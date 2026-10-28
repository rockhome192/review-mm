// Build-time data access. Reads Supabase through the Data API with the
// publishable key, so only rows RLS lets the public see come back.
import "server-only";
import { normalizeName } from "./search";
import { MOOD_KEYS, type CardTitle, type LengthKey, type List, type Title, type TitleRow } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// next dev reads fresh rows on every refresh, so DB edits show up without clearing .next/cache
const DEV = process.env.NODE_ENV === "development";

async function rest<T>(path: string): Promise<T> {
  if (!URL || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY are not set");
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY },
    cache: DEV ? "no-store" : "force-cache",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Start years at or before this, still running with no chapter count, are long-runners. */
const LONG_RUNNER_BEFORE = new Date().getFullYear() - 3;

function lengthOf(chapters: number | null, status: string | null, startYear: number | null): LengthKey | null {
  if (chapters) return chapters <= 100 ? "short" : chapters <= 200 ? "mid" : "long";
  if (status === "RELEASING" && startYear && startYear <= LONG_RUNNER_BEFORE) return "long";
  return null; // unknown: only matches "ได้หมด"
}

function toTitle(r: TitleRow): Title {
  const o = r.overrides;
  const chapters = o?.chapters ?? r.chapters;
  const status = o?.status ?? r.status;
  const moods = Object.fromEntries(MOOD_KEYS.map((k) => [k, { score: 0, reason: "" }])) as Title["moods"];
  for (const m of r.moods) moods[m.mood] = { score: m.score, reason: m.reason };
  return {
    id: r.anilist_id,
    slug: r.slug,
    href: `/${r.type}/${r.slug}`,
    title: r.title,
    titleRomaji: r.title_romaji,
    titleNative: r.title_native,
    type: r.type,
    status,
    chapters,
    length: lengthOf(chapters, status, r.start_year),
    startYear: r.start_year,
    score: r.score,
    popularity: r.popularity ?? 0,
    cover: r.cover_url,
    coverColor: r.cover_color ?? "#ebe5d8",
    anilistUrl: r.anilist_url,
    hook: o?.premise ?? r.blurbs.hook,
    body: r.blurbs.body,
    caveat: r.blurbs.caveat,
    tags: r.blurbs.tags_th,
    warnings: r.blurbs.content_warnings,
    moods,
    recs: r.recommendations
      .sort((a, b) => a.position - b.position)
      .map((x) => ({ title: x.rec_title, id: x.rec_anilist_id, same: x.same, diff: x.diff })),
    links: r.reading_links.sort((a, b) => a.sort - b.sort || a.site.localeCompare(b.site)),
  };
}

let catalog: Promise<Title[]> | undefined;

/** The Data API returns at most 1000 rows per request (Supabase "Max rows"), so read in pages. */
const CATALOG_PAGE = 500;

async function allTitleRows(): Promise<TitleRow[]> {
  const rows: TitleRow[] = [];
  // anilist_id breaks popularity ties, so no row lands on two pages or none.
  // Step by what came back and stop on an empty page, not a short one: a lower
  // Max rows would cut every page short.
  for (;;) {
    const page = await rest<TitleRow[]>(
      "titles?select=*,blurbs!inner(*),moods(*),recommendations!recommendations_anilist_id_fkey(*),reading_links(*),overrides(*)" +
        `&order=popularity.desc,anilist_id.asc&limit=${CATALOG_PAGE}&offset=${rows.length}`,
    );
    if (!page.length) return rows;
    rows.push(...page);
  }
}

/** Every visible title (published blurb, not hidden), most popular first. */
export function getCatalog(): Promise<Title[]> {
  if (DEV) catalog = undefined; // the dev server process lives across refreshes
  catalog ??= allTitleRows().then((rows) => rows.filter((r) => !r.overrides?.hidden).map(toTitle));
  return catalog;
}

export async function getTitle(type: string, slug: string) {
  return (await getCatalog()).find((t) => t.type === type && t.slug === slug) ?? null;
}

export function toCard(t: Title): CardTitle {
  return {
    id: t.id,
    href: t.href,
    title: t.title,
    type: t.type,
    status: t.status,
    chapters: t.chapters,
    length: t.length,
    cover: t.cover,
    coverColor: t.coverColor,
    popularity: t.popularity,
    score: t.score,
    startYear: t.startYear,
    names: [t.title, t.titleRomaji, t.titleNative].filter(Boolean).map((n) => normalizeName(n!)).join("\n"),
    moodScores: Object.fromEntries(MOOD_KEYS.map((k) => [k, t.moods[k].score])) as CardTitle["moodScores"],
  };
}

export async function getLists(): Promise<List[]> {
  const rows = await rest<
    { slug: string; title: string; description: string | null; list_items: { anilist_id: number; position: number }[] }[]
  >("lists?select=slug,title,description,list_items(anilist_id,position)&published=eq.true&order=sort");
  return rows.map((l) => ({
    slug: l.slug,
    title: l.title,
    description: l.description,
    ids: l.list_items.sort((a, b) => a.position - b.position).map((i) => i.anilist_id),
  }));
}
