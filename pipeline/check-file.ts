// Validate one generated file outside data/generated/ (e.g. the model test) without merging it.
// Same checks as validate.ts: schema, ifYouLike in alsoLiked, banned phrases.
//
// Usage: npx tsx pipeline/check-file.ts data/model-test/sonnet.json
import fs from "node:fs";
import { Recommendation, BANNED_PHRASES } from "./schema.ts";

const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const byId = new Map(raw.map((t) => [t.anilistId, t]));

const file = process.argv[2];
let ok = 0, problems = 0;
for (const item of JSON.parse(fs.readFileSync(file, "utf8"))) {
  const parsed = Recommendation.safeParse(item);
  if (!parsed.success) {
    problems++;
    console.log(`✗ ${item.anilistId}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    continue;
  }
  const r = parsed.data;
  const src = byId.get(r.anilistId);
  if (!src) { problems++; console.log(`✗ ${r.anilistId}: unknown anilistId`); continue; }
  for (const name of r.ifYouLike)
    if (!src.alsoLiked.includes(name)) { problems++; console.log(`⚠ ${src.title}: ifYouLike "${name}" not in alsoLiked`); }
  const text = `${r.hook} ${r.body} ${r.caveat ?? ""}`;
  for (const b of BANNED_PHRASES) if (text.includes(b)) { problems++; console.log(`⚠ ${src.title}: banned phrase "${b}"`); }
  ok++;
}
console.log(`\n${ok} valid, ${problems} problems in ${file}`);
