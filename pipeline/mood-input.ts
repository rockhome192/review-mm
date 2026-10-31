// Print the reader evidence for titles, for the mood rater (step B, see mood-prompt.md).
// Deliberately leaves out our generated blurbs and AI mood scores, so the crowd
// estimate stays independent of them.
//
// Usage: npx tsx pipeline/mood-input.ts <from> <to>   (1-based, inclusive, order of data/raw/anilist-top.json)
//        npx tsx pipeline/mood-input.ts ids <id,id,...>   (AniList ids, for re-scoring a few titles)
import fs from "node:fs";

const REVIEW_CHARS = 1200;
const COMMENT_CHARS = 500;

const top = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const al = JSON.parse(fs.readFileSync("data/raw/anilist-reviews.json", "utf8"));
const mu = JSON.parse(fs.readFileSync("data/raw/mangaupdates.json", "utf8"));

/** The evidence for one title as prompt input. Exported for the Batch API pipeline. */
export function moodInput(anilistId: number): string {
  const t = top.find((x: any) => x.anilistId === anilistId);
  const a = al.find((x: any) => x.anilistId === anilistId);
  const m = mu.find((x: any) => x.anilistId === anilistId);
  if (!t || !a) throw new Error(`${anilistId}: not in anilist-top.json / anilist-reviews.json`);
  const lines = [`=== ${t.title} (${t.anilistId}) · ${t.type} · ${t.status} · genres: ${t.genres.join(", ")}`];
  lines.push(`AniList tags: ${a.tags.map((x: any) => `${x.name} ${x.rank}%`).join(", ")}`);
  if (m?.muId) {
    lines.push(`MangaUpdates genres: ${m.genres.join(", ")}`);
    lines.push(`MangaUpdates categories (votes): ${m.categories.slice(0, 25).map((c: any) => `${c.name} ${c.votes}`).join(", ")}`);
  }
  lines.push(`-- AniList reviews (${a.reviews.length} of ${a.reviewTotal}):`);
  for (const r of a.reviews) lines.push(`[R${r.id} score ${r.score}] ${r.summary} — ${r.excerpt.slice(0, REVIEW_CHARS)}`);
  const cs = m?.comments ?? [];
  lines.push(`-- MangaUpdates comments (${cs.length} of ${m?.commentTotal ?? 0}):`);
  cs.forEach((c: any, i: number) => c.text && lines.push(`[MU${i + 1}] ${c.text.slice(0, COMMENT_CHARS)}`));
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("mood-input.ts")) {
  const picked: any[] =
    process.argv[2] === "ids"
      ? process.argv[3].split(",").map((id) => top.find((t: any) => t.anilistId === Number(id)))
      : top.slice(Number(process.argv[2]) - 1, Number(process.argv[3]));
  for (const t of picked) console.log(`\n${moodInput(t.anilistId)}`);
}
