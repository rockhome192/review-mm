// Print a compact, readable view of titles [start, end) from the raw AniList data —
// the same fields the Batch API prompt receives.
//
// Usage: npx tsx pipeline/make-chunk.ts <start> <end>
//        npx tsx pipeline/make-chunk.ts todo [n=10] [skip=0]   next n titles not yet in data/generated/all.json
//                                                              (skip lets parallel writers take separate slices)
//        npx tsx pipeline/make-chunk.ts chunk <file>   the titles in a generated chunk (for review)
import fs from "node:fs";

const raw = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));

/** One title as prompt input. Exported for the Batch API pipeline. */
export function titleInput(t: any, reviewChars = 900): string {
  return [
    `## ${t.title} (anilistId ${t.anilistId})`,
    `type=${t.type} status=${t.status} chapters=${t.chapters ?? "?"} year=${t.startYear} score=${t.score} popularity=${t.popularity}`,
    `genres: ${t.genres.join(", ")}`,
    `tags: ${t.tags.map((x: any) => `${x.name}(${x.rank})`).join(", ")}`,
    `synopsis: ${t.synopsis}`,
    ...t.reviews.map(
      (r: any, i: number) => `review${i + 1} [${r.score}/100] "${r.summary}": ${r.excerpt.slice(0, reviewChars)}`,
    ),
    `alsoLiked: ${t.alsoLiked.join(" | ")}`,
  ].join("\n");
}

if (process.argv[1]?.endsWith("make-chunk.ts")) {
  const args = process.argv.slice(2);
  let picked: any[];
  if (args[0] === "todo") {
    const all = "data/generated/all.json";
    const done = new Set(fs.existsSync(all) ? JSON.parse(fs.readFileSync(all, "utf8")).map((r: any) => r.anilistId) : []);
    const todo = raw.filter((t: any) => !done.has(t.anilistId));
    console.error(`${todo.length} titles left`);
    const skip = Number(args[2] ?? 0);
    picked = todo.slice(skip, skip + Number(args[1] ?? 10));
  } else if (args[0] === "chunk") {
    const ids: number[] = JSON.parse(fs.readFileSync(args[1], "utf8")).map((r: any) => r.anilistId);
    picked = ids.map((id) => raw.find((t: any) => t.anilistId === id)).filter(Boolean);
  } else {
    const [start, end] = args.map(Number);
    picked = raw.slice(start, end);
  }
  console.log(picked.map((t: any) => titleInput(t)).join("\n\n"));
}
