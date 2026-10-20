// Print, for each title, both sides of every "ถ้าชอบเรื่องนี้" card (from
// data/generated/recs.json): facts, tags, our blurb and the reader moods.
// Input for the rec writer (pipeline/rec-prompt.md).
//
// Usage: npx tsx pipeline/rec-input.ts <from> <to>   (1-based, inclusive, order of data/raw/anilist-top.json)
//        npx tsx pipeline/rec-input.ts pairs <id>:<recId>,...   (only these cards, for rewrites)
import fs from "node:fs";
import { MOOD_KEYS, MOOD_LABELS } from "./schema.ts";

const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const gen: any[] = JSON.parse(fs.readFileSync("data/generated/all.json", "utf8"));
const recs: any[] = JSON.parse(fs.readFileSync("data/generated/recs.json", "utf8"));

const byId = new Map(raw.map((t) => [t.anilistId, t]));
const byTitle = new Map(raw.map((t) => [t.title, t.anilistId]));
const blurb = new Map(gen.map((g) => [g.anilistId, g]));
const cards = new Map(recs.map((r) => [r.anilistId, r.recs.map((n: string) => byTitle.get(n)!)]));
// how many AniList readers recommended this exact pair
const fetched: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-recs.json", "utf8"));
const votes = new Map(fetched.flatMap((f) => f.recs.map((r: any) => [`${f.anilistId}:${r.anilistId}`, r.votes])));

function describe(id: number) {
  const t = byId.get(id), g = blurb.get(id);
  const length = t.chapters ? `${t.chapters} ตอน` : "ไม่ทราบจำนวนตอน";
  const moods = MOOD_KEYS.filter((k) => g.moods[k].score > 0)
    .map((k) => `${MOOD_LABELS[k]} ${g.moods[k].score} (${g.moods[k].reason})`).join("; ");
  return [
    `${t.title} (${id}) · ${t.type} · ${t.status} · ${length} · ${t.startYear ?? "?"}`,
    `  genres: ${t.genres.join(", ")} | tags: ${t.tags.slice(0, 10).map((x: any) => x.name).join(", ")}`,
    `  hook: ${g.hook}`,
    `  body: ${g.body}`,
    `  caveat: ${g.caveat ?? "-"}`,
    `  moods: ${moods || "ไม่มีอารมณ์เด่น"}`,
  ].join("\n");
}

let pairs: [number, number][];
if (process.argv[2] === "pairs") {
  pairs = process.argv[3].split(",").map((p) => p.split(":").map(Number) as [number, number]);
} else {
  const from = Number(process.argv[2]) - 1, to = Number(process.argv[3]);
  pairs = raw.slice(from, to).flatMap((t) => (cards.get(t.anilistId) ?? []).map((r: number) => [t.anilistId, r]));
}

let last = 0;
for (const [a, b] of pairs) {
  if (a !== last) {
    console.log(`\n=== PAGE ${describe(a)}`);
    last = a;
  }
  console.log(`--- CARD ${a} -> ${b} · ${votes.get(`${a}:${b}`) ?? "?"} readers recommended this pair\n${describe(b)}`);
}
console.log(`\n${pairs.length} cards`);
