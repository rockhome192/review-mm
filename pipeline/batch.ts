// Steps of the blurb pipeline through the Message Batches API. Same prompts and the same
// input as make-chunk.ts and the Claude Code agents, same zod shapes, so the output goes
// through check-file.ts / review-summary.ts like anything the agents write.
//
//   A       writer (prompt.md)                     -> Recommendation[]
//   review  editor (review-prompt.md + prompt.md)  -> Review[]  (the manga-reviewer agent's job)
//
// One request per chunk of CHUNK titles, like the agents, so the "vary the openings within a
// chunk" rules still apply. Batches cost half the normal price and usually finish within an
// hour (24 h at most).
//
// Usage:
//   npx tsx pipeline/batch.ts submit <ids.json> [--dry]       ids.json: [{ anilistId }...]
//   npx tsx pipeline/batch.ts review <blurbs.json> [--dry]    blurbs.json: Recommendation[]
//   npx tsx pipeline/batch.ts status <batchId>
//   npx tsx pipeline/batch.ts fetch <batchId> <out.json>
// --dry prints what would be sent and needs no API key.
// Every submitted batch is logged in data/batches/<batchId>.json.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { titleInput } from "./make-chunk.ts";
import { Recommendation, Review } from "./schema.ts";

const CHUNK = 10;
const MAX_TOKENS = 32000; // 10 titles plus thinking; a cut-off chunk is wasted money
const LOG_DIR = "data/batches";

// Batch prices, USD per million tokens (half the normal rate). Cache writes cost 1.25x input, reads 0.1x.
const STEPS = {
  A: { model: "claude-sonnet-5-5", price: { input: 1, output: 5 }, schema: z.object({ titles: z.array(Recommendation) }) },
  // Opus 5.5 always thinks adaptively; how hard is `effort` (default medium). At medium the editor
  // missed most review-copy issues: 7-8 revise vs the agent's 15 on the same drafts.
  review: { model: "claude-opus-5-5", price: { input: 2, output: 10 }, schema: z.object({ titles: z.array(Review) }), effort: "high" },
} as Record<string, { model: string; price: { input: number; output: number }; schema: z.ZodType<{ titles: { anilistId: number }[] }>; effort?: "high" | "xhigh" | "max" }>;
type Step = "A" | "review";

const [cmd, ...args] = process.argv.slice(2);
const DRY = args.includes("--dry");

function client() {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in .env.local");
  return new Anthropic();
}

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The source data block for one title, as the agents see it. */
function sourceData(ids: number[]) {
  const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
  const byId = new Map(raw.map((t) => [t.anilistId, t]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`not in anilist-top.json: ${missing.join(", ")}`);
  return (id: number) => titleInput(byId.get(id));
}

/** One request per chunk; `user` writes the user turn for a chunk. Sends, or prints with --dry. */
async function submit(step: Step, system: string, ids: number[], user: (part: number[]) => string) {
  const { model, schema, effort } = STEPS[step];
  const parts = chunks(ids, CHUNK);
  const requests = parts.map((part, i) => ({
    custom_id: `${step}-${i}`,
    params: {
      model,
      max_tokens: MAX_TOKENS,
      // the same prompt in every request: cached after the first one
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: user(part) }],
      output_config: { format: zodOutputFormat(schema), ...(effort && { effort }) },
    },
  }));

  if (DRY) {
    for (const r of requests) console.log(`${r.custom_id}: ${r.params.messages[0].content.length.toLocaleString()} chars`);
    console.log(`system prompt ${system.length.toLocaleString()} chars, ${requests.length} requests, model ${model}`);
    return;
  }

  const batch = await client().messages.batches.create({ requests });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const log = { id: batch.id, step, model, createdAt: batch.created_at, chunks: requests.map((r, i) => ({ custom_id: r.custom_id, ids: parts[i] })) };
  fs.writeFileSync(`${LOG_DIR}/${batch.id}.json`, JSON.stringify(log, null, 2));
  console.log(`submitted ${batch.id} (${step}, ${requests.length} requests, ${ids.length} titles). Check with: npx tsx pipeline/batch.ts status ${batch.id}`);
}

if (cmd === "submit") {
  const ids: number[] = JSON.parse(fs.readFileSync(args[0], "utf8")).map((x: any) => x.anilistId);
  const source = sourceData(ids);
  await submit("A", fs.readFileSync("pipeline/prompt.md", "utf8"), ids, (part) =>
    `เขียนคำโปรยให้ ${part.length} เรื่องต่อไปนี้ ตามคู่มือ ` +
    `ตอบเป็น titles เรียงตามลำดับเดียวกับข้อมูล หนึ่งรายการต่อเรื่อง ใช้ anilistId ตามข้อมูล\n\n` +
    part.map(source).join("\n\n"),
  );
} else if (cmd === "review") {
  const blurbs: Recommendation[] = JSON.parse(fs.readFileSync(args[0], "utf8"));
  const byId = new Map(blurbs.map((b) => [b.anilistId, b]));
  const ids = blurbs.map((b) => b.anilistId);
  const source = sourceData(ids);
  // the rubric points at the writer's guide by path, so both go in, labelled
  const system =
    fs.readFileSync("pipeline/review-prompt.md", "utf8") +
    "\n\n---\n\n# คู่มือนักเขียน (`pipeline/prompt.md`)\n\n" +
    fs.readFileSync("pipeline/prompt.md", "utf8");
  await submit("review", system, ids, (part) =>
    `ตรวจคำโปรย ${part.length} เรื่องต่อไปนี้ตามเกณฑ์ ทุกข้อ ทุกเรื่อง และเทียบ hook ข้ามเรื่องในชุด ` +
    `ตอบเป็น titles เรียงตามลำดับเดียวกับคำโปรย หนึ่งรายการต่อเรื่อง\n\n` +
    `## ข้อมูลต้นทาง\n\n${part.map(source).join("\n\n")}\n\n` +
    `## คำโปรยที่นักเขียนส่งมา\n\n${JSON.stringify(part.map((id) => byId.get(id)), null, 2)}`,
  );
} else if (cmd === "status") {
  const b = await client().messages.batches.retrieve(args[0]);
  const c = b.request_counts;
  console.log(`${b.id}: ${b.processing_status} | processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}, expired ${c.expired}, canceled ${c.canceled}`);
} else if (cmd === "fetch") {
  const [id, out] = args;
  if (!out) throw new Error("usage: batch.ts fetch <batchId> <out.json>");
  const log = JSON.parse(fs.readFileSync(`${LOG_DIR}/${id}.json`, "utf8"));
  const { schema, price } = STEPS[log.step as Step];
  const expected = new Map<string, number[]>(log.chunks.map((c: any) => [c.custom_id, c.ids]));
  const api = client();
  const b = await api.messages.batches.retrieve(id);
  if (b.processing_status !== "ended") throw new Error(`batch is still ${b.processing_status}`);

  const got = new Map<string, { anilistId: number }[]>();
  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  // results come back in any order: match on custom_id
  for await (const r of await api.messages.batches.results(id)) {
    if (r.result.type !== "succeeded") {
      console.log(`✗ ${r.custom_id}: ${r.result.type}${r.result.type === "errored" ? ` ${JSON.stringify(r.result.error)}` : ""}`);
      continue;
    }
    const m = r.result.message;
    usage.input += m.usage.input_tokens;
    usage.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
    usage.cacheRead += m.usage.cache_read_input_tokens ?? 0;
    usage.output += m.usage.output_tokens;
    if (m.stop_reason !== "end_turn") {
      console.log(`✗ ${r.custom_id}: stopped on ${m.stop_reason}${m.stop_details ? ` ${JSON.stringify(m.stop_details)}` : ""}`);
      continue;
    }
    const text = m.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.log(`✗ ${r.custom_id}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const want = expected.get(r.custom_id) ?? [];
    const ids = parsed.data.titles.map((t) => t.anilistId);
    if (ids.join() !== want.join()) console.log(`⚠ ${r.custom_id}: anilistIds ${ids.join()} != sent ${want.join()}`);
    got.set(r.custom_id, parsed.data.titles);
  }

  const all = log.chunks.flatMap((c: any) => got.get(c.custom_id) ?? []);
  fs.writeFileSync(out, JSON.stringify(all, null, 2) + "\n");
  const cost =
    (usage.input * price.input + usage.cacheWrite * price.input * 1.25 + usage.cacheRead * price.input * 0.1 + usage.output * price.output) / 1e6;
  console.log(`${all.length} titles -> ${out}`);
  console.log(`tokens: input ${usage.input}, cache write ${usage.cacheWrite}, cache read ${usage.cacheRead}, output ${usage.output}`);
  console.log(`cost ≈ $${cost.toFixed(3)} ($${(cost / Math.max(all.length, 1)).toFixed(4)} per title)`);
} else {
  console.log("usage: batch.ts submit <ids.json> [--dry] | review <blurbs.json> [--dry] | status <batchId> | fetch <batchId> <out.json>");
}
