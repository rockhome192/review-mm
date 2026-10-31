// Validate reviewer output in data/reviews/ and print what needs a rewrite or a human look.
//
// Usage: npx tsx pipeline/review-summary.ts [chunk-05.json ...]   (default: all review files)
//        npx tsx pipeline/review-summary.ts chunk-05.recheck.json  (re-check: only the re-checked titles)
//        npx tsx pipeline/review-summary.ts data/model-test/review-A.json  (any path, e.g. the model test)
import fs from "node:fs";
import { Review } from "./schema.ts";

const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const title = new Map(raw.map((t) => [t.anilistId, t.title]));

const dir = "data/reviews";
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => /^chunk-\d+\.json$/.test(f)).sort();

let total = 0, revise = 0, copyPassed = 0;
const byCriterion: Record<string, number> = {};

for (const f of files) {
  const isPath = f.includes("/");
  const reviewed = JSON.parse(fs.readFileSync(isPath ? f : `${dir}/${f}`, "utf8"));
  const recheck = f.endsWith(".recheck.json");
  const generated = recheck || isPath ? [] : JSON.parse(fs.readFileSync(`data/generated/${f}`, "utf8"));
  const seen = new Set<number>();
  for (const item of reviewed) {
    const parsed = Review.safeParse(item);
    if (!parsed.success) { console.log(`✗ ${f} ${item.anilistId}: ${parsed.error.issues.map((i) => i.message).join("; ")}`); continue; }
    const r = parsed.data;
    seen.add(r.anilistId);
    total++;
    for (const i of r.issues) byCriterion[i.criterion] = (byCriterion[i.criterion] ?? 0) + 1;
    // copying from reviews is never OK, so a passed title with any copy issue still goes to a human
    const copy = r.issues.filter((i) => i.criterion === "copy");
    if (r.verdict === "pass" && copy.length) {
      copyPassed++;
      console.log(`\n⚑ ${f} ${title.get(r.anilistId)} (${r.anilistId}) passed, but has a copy issue: check by hand`);
      for (const i of copy) console.log(`   [${i.severity} copy] ${i.problem}\n      → ${i.fix}`);
    }
    if (r.verdict === "pass") continue;
    revise++;
    console.log(`\n✎ ${f} ${title.get(r.anilistId)} (${r.anilistId})`);
    for (const i of r.issues) console.log(`   [${i.severity} ${i.criterion}] ${i.problem}\n      → ${i.fix}`);
  }
  for (const g of generated) if (!seen.has(g.anilistId)) console.log(`✗ ${f}: ${title.get(g.anilistId)} not reviewed`);
}

console.log(`\n${total} reviewed, ${revise} need revision, ${copyPassed} passed with a copy issue (check by hand)`);
console.log("issues by criterion:", byCriterion);
