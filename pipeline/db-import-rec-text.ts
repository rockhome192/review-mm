// Validate data/rec-text/*.json (RecText) and write same/diff into the
// recommendations table. Only cards that are currently on a page are updated;
// a card whose title changed since the text was written is skipped.
//
// Usage: npx tsx pipeline/db-import-rec-text.ts [--dry]
// Run --dry on fresh writer output before the Opus review, so the mechanical
// problems (banned words, length) are fixed without spending a review on them.
import fs from "node:fs";
import path from "node:path";
import { RecText, BANNED_PHRASES } from "./schema.ts";
import { sql, closeDb } from "./db.ts";

const DIR = "data/rec-text";
const DRY = process.argv.includes("--dry");

// recs-NNN-NNN.json per title range, recs-refill-N.json for cards that replaced weak ones
const texts = fs.readdirSync(DIR).filter((f) => /^recs-(\d+-\d+|refill-\d+)\.json$/.test(f)).sort()
  .flatMap((f) => RecText.array().parse(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))));

const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const titleOf = new Map(raw.map((t) => [t.anilistId, t.title]));
const recs: any[] = JSON.parse(fs.readFileSync("data/generated/recs.json", "utf8"));
const current = new Set(recs.flatMap((r) => r.recs.map((n: string) => `${r.anilistId}:${n}`)));

const rows = texts
  .filter((t) => current.has(`${t.anilistId}:${titleOf.get(t.recAnilistId)}`))
  .map((t) => ({ anilist_id: t.anilistId, rec_title: titleOf.get(t.recAnilistId)!, same: t.same, diff: t.diff }));
const weak = texts.filter((t) => t.fit === "weak").length;
console.log(`${texts.length} texts, ${rows.length} on current cards, ${weak} weak fit`);

// same checks as validate.ts, plus citing readers (rec-prompt.md)
let problems = 0;
for (const t of texts)
  for (const line of [t.same, t.diff])
    for (const bad of [...BANNED_PHRASES, "รีวิว", "คนอ่าน", "แฟนๆ"])
      if (line.includes(bad)) {
        problems++;
        console.log(`⚠ ${t.anilistId} -> ${t.recAnilistId}: "${bad}" in "${line}"`);
      }
// the prompt asks for ~60 characters; a few over is fine, past 65 it wraps badly under the card
for (const t of texts)
  for (const line of [t.same, t.diff]) {
    if (line.length > 65) {
      problems++;
      console.log(`⚠ ${t.anilistId} -> ${t.recAnilistId}: ${line.length} chars "${line}"`);
    } else if (line.length < 20) {
      console.log(`? ${t.anilistId} -> ${t.recAnilistId}: short, maybe genre only "${line}"`);
    }
  }
if (problems) {
  console.log(`${problems} problems; fix them before importing`);
  process.exit(1);
}

if (!DRY && rows.length) {
  const res = await sql`update recommendations r set same = n.same, diff = n.diff
    from json_to_recordset(${JSON.stringify(rows)}::text::json)
      as n(anilist_id int, rec_title text, same text, diff text)
    where r.anilist_id = n.anilist_id and r.rec_title = n.rec_title`;
  console.log(`updated ${res.count} cards`);
}
await closeDb();
