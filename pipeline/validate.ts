// Validate generated chunks against the schema and merge them into
// data/generated/all.json. Flags: ifYouLike not in alsoLiked, banned phrases.
// Moods from step B (data/moods/moods-*.json) replace the writer's moods.
//
// Usage: npx tsx pipeline/validate.ts
import fs from "node:fs";
import { Recommendation, MoodResult, MOOD_KEYS, pickMoods, MOOD_LABELS } from "./schema.ts";

const BANNED = ["ลุ้นจนลืมหายใจ", "วางไม่ลง", "ห้ามพลาด", "ครบทุกรส", "อ่านเพลิน"];
const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const byId = new Map(raw.map((t) => [t.anilistId, t]));

const dir = "data/generated";
const files = fs.readdirSync(dir).filter((f) => /^chunk-\d+\.json$/.test(f)).sort();
const all: Recommendation[] = [];
let problems = 0;

const moodDir = "data/moods";
const moodById = new Map<number, MoodResult>();
for (const f of fs.existsSync(moodDir) ? fs.readdirSync(moodDir).filter((f) => /^moods-.*\.json$/.test(f)) : [])
  for (const item of JSON.parse(fs.readFileSync(`${moodDir}/${f}`, "utf8"))) {
    const parsed = MoodResult.safeParse(item);
    if (parsed.success) moodById.set(parsed.data.anilistId, parsed.data);
    else { problems++; console.log(`✗ ${f} ${item.anilistId}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`); }
  }

for (const f of files) {
  for (const item of JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"))) {
    const parsed = Recommendation.safeParse(item);
    if (!parsed.success) {
      problems++;
      console.log(`✗ ${f} ${item.anilistId}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const r = parsed.data;
    const src = byId.get(r.anilistId);
    if (!src) { problems++; console.log(`✗ ${f} ${r.anilistId}: unknown anilistId`); continue; }
    for (const name of r.ifYouLike)
      if (!src.alsoLiked.includes(name)) { problems++; console.log(`⚠ ${src.title}: ifYouLike "${name}" not in alsoLiked`); }
    const text = `${r.hook} ${r.body} ${r.caveat ?? ""}`;
    for (const b of BANNED) if (text.includes(b)) { problems++; console.log(`⚠ ${src.title}: banned phrase "${b}"`); }
    const m = moodById.get(r.anilistId);
    if (m) for (const k of MOOD_KEYS) r.moods[k] = { score: m.moods[k].score, reason: m.moods[k].reason };
    all.push(r);
  }
}

fs.writeFileSync(`${dir}/all.json`, JSON.stringify(all, null, 2));
const moodCount: Record<string, number> = {};
for (const r of all) for (const m of pickMoods(r)) moodCount[MOOD_LABELS[m]] = (moodCount[MOOD_LABELS[m]] ?? 0) + 1;
console.log(`\n${all.length} valid, ${problems} problems -> ${dir}/all.json`);
console.log(`moods from step B: ${all.filter((r) => moodById.has(r.anilistId)).length}/${all.length}`);
console.log("moods:", moodCount);
console.log("low confidence:", all.filter((r) => r.confidence === "low").length,
  "| outside knowledge:", all.filter((r) => r.usedOutsideKnowledge).length);
