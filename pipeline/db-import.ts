// Upsert titles, blurbs, moods and recommendation cards into Supabase from
// data/raw/anilist-top.json + data/generated/all.json. Safe to re-run.
// Never touches overrides, lists or reading_links.
//
// Usage: npx tsx pipeline/db-import.ts [status=published] [model] [promptVersion]
//   status applies to new titles only; model/promptVersion to titles whose text changed
import fs from "node:fs";
import { Recommendation, MOOD_KEYS } from "./schema.ts";
import { sql, closeDb } from "./db.ts";

const STATUS = process.argv[2] ?? "published";
const MODEL = process.argv[3] ?? "claude-opus (claude code)";
const PROMPT_VERSION = process.argv[4] ?? "v1";

const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const gen = Recommendation.array().parse(
  JSON.parse(fs.readFileSync("data/generated/all.json", "utf8")),
);

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const slugs = new Set<string>();
const titles = raw.map((t) => {
  let slug = slugify(t.title) || String(t.anilistId);
  if (slugs.has(slug)) slug = `${slug}-${t.anilistId}`;
  slugs.add(slug);
  return {
    anilist_id: t.anilistId,
    slug,
    title: t.title,
    title_romaji: t.titleRomaji,
    title_native: t.titleNative,
    type: t.type,
    status: t.status,
    chapters: t.chapters,
    volumes: t.volumes,
    start_year: t.startYear,
    score: t.score,
    popularity: t.popularity,
    genres: t.genres,
    tags: t.tags.map((x: any) => x.name),
    also_liked: t.alsoLiked,
    cover_url: t.cover,
    cover_color: t.coverColor,
    anilist_url: t.siteUrl,
  };
});

// ifYouLike holds display titles; link them to our own titles when we have them.
const byName = new Map<string, number>();
for (const t of raw) for (const n of [t.title, t.titleRomaji]) if (n) byName.set(n.toLowerCase(), t.anilistId);

const blurbs = gen.map((g) => ({
  anilist_id: g.anilistId,
  hook: g.hook,
  body: g.body,
  caveat: g.caveat,
  tags_th: g.tagsTh,
  content_warnings: g.contentWarnings,
  confidence: g.confidence,
  status: STATUS,
  model: MODEL,
  prompt_version: PROMPT_VERSION,
}));
const moods = gen.flatMap((g) =>
  MOOD_KEYS.map((k) => ({ anilist_id: g.anilistId, mood: k, score: g.moods[k].score, reason: g.moods[k].reason })),
);
// cards come from pick-recs.ts when it has run, else from the writer's ifYouLike
const RECS = "data/generated/recs.json";
const picked = new Map<number, string[]>(
  fs.existsSync(RECS)
    ? JSON.parse(fs.readFileSync(RECS, "utf8")).map((r: any) => [r.anilistId, r.recs])
    : [],
);
const recs = gen.flatMap((g) =>
  (picked.get(g.anilistId) ?? g.ifYouLike).map((name, i) => ({
    anilist_id: g.anilistId,
    position: i + 1,
    rec_title: name,
    rec_anilist_id: byName.get(name.toLowerCase()) ?? null,
  })),
);

await sql.begin(async (tx) => {
  await tx`insert into titles ${tx(titles)}
    on conflict (anilist_id) do update set
      title = excluded.title, title_romaji = excluded.title_romaji, title_native = excluded.title_native,
      type = excluded.type, status = excluded.status, chapters = excluded.chapters,
      volumes = excluded.volumes, start_year = excluded.start_year, score = excluded.score,
      popularity = excluded.popularity, genres = excluded.genres, tags = excluded.tags,
      also_liked = excluded.also_liked, cover_url = excluded.cover_url,
      cover_color = excluded.cover_color, anilist_url = excluded.anilist_url, updated_at = now()`;
  // slug stays fixed once set, so published URLs never change
  // status is only set for new rows, so a hand-set needs_review survives re-imports;
  // model/prompt_version only change when the text itself changed
  await tx`insert into blurbs ${tx(blurbs)}
    on conflict (anilist_id) do update set
      hook = excluded.hook, body = excluded.body, caveat = excluded.caveat,
      tags_th = excluded.tags_th, content_warnings = excluded.content_warnings,
      confidence = excluded.confidence,
      model = case when (blurbs.hook, blurbs.body, blurbs.caveat) is distinct from
        (excluded.hook, excluded.body, excluded.caveat) then excluded.model else blurbs.model end,
      prompt_version = case when (blurbs.hook, blurbs.body, blurbs.caveat) is distinct from
        (excluded.hook, excluded.body, excluded.caveat) then excluded.prompt_version else blurbs.prompt_version end,
      updated_at = now()`;
  await tx`insert into moods ${tx(moods)}
    on conflict (anilist_id, mood) do update set score = excluded.score, reason = excluded.reason`;
  // same/diff come from a later pass; keep them unless the card's title changed
  const ids = gen.map((g) => g.anilistId);
  await tx`delete from recommendations r where r.anilist_id = any(${ids})
    and not exists (select 1 from json_to_recordset(${JSON.stringify(recs)}::text::json)
      as n(anilist_id int, position int, rec_title text)
      where n.anilist_id = r.anilist_id and n.position = r.position and n.rec_title = r.rec_title)`;
  if (recs.length)
    await tx`insert into recommendations ${tx(recs)}
      on conflict (anilist_id, position) do update set rec_anilist_id = excluded.rec_anilist_id`;
});

const linked = recs.filter((r) => r.rec_anilist_id).length;
console.log(`titles ${titles.length}, blurbs ${blurbs.length} (${STATUS}), moods ${moods.length}, ` +
  `recs ${recs.length} (${linked} link to our titles)`);
await closeDb();
