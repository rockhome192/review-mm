// Fetch reader comments, rating and category votes from MangaUpdates for titles in
// data/raw/anilist-top.json, into data/raw/mangaupdates.json. Second crowd source for
// the mood check, mainly for manhwa that have no AniList reviews.
// MangaUpdates API terms: credit MangaUpdates, keep reasonable spacing between requests.
//
// Matching: search by romaji, then English title; keep results of the right type
// (Manga for JP, Manhwa for KR). An exact title match is "exact"; otherwise the closest
// year with the most votes is "check" and listed at the end for a human to confirm.
//
// Titles already in the output are kept as they are (including hand-checked matches);
// only new titles are fetched. Set ALL=1 to refetch everything.
//
// Usage: npx tsx pipeline/fetch-mangaupdates.ts [commentsPerTitle=20]
import fs from "node:fs";

const PER_TITLE = Number(process.argv[2] ?? 20);
const COMMENT_CHARS = 1000;
const SRC = "data/raw/anilist-top.json";
const OUT = process.env.OUT ?? "data/raw/mangaupdates.json";
const API = "https://api.mangaupdates.com/v1";
const GAP_MS = 2000; // "reasonable spacing between requests"

type Raw = any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

async function call(path: string, body?: unknown): Promise<Raw> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(GAP_MS);
    try {
      const res = await fetch(API + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        console.log(`  ${res.status} on ${path}, waiting 30s`);
        await sleep(30_000);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return await res.json();
    } catch (e) {
      console.log(`  network error on ${path} (${(e as Error).message}), retrying`);
      await sleep(10_000);
    }
  }
  throw new Error(`MangaUpdates: too many retries on ${path}`);
}

async function match(t: Raw) {
  const wantType = t.type === "manhwa" ? "Manhwa" : "Manga";
  const names = new Set([t.title, t.titleRomaji, t.titleNative].map(norm).filter(Boolean));
  const seen = new Map<number, Raw>();
  for (const q of [...new Set([t.titleRomaji, t.title])].filter(Boolean)) {
    const data = await call("/series/search", { search: q });
    for (const r of data.results ?? []) {
      if (r.record.type !== wantType) continue;
      const id = r.record.series_id;
      const prev = seen.get(id);
      const exact = names.has(norm(r.hit_title)) || names.has(norm(r.record.title));
      seen.set(id, { ...r.record, exact: exact || prev?.exact });
    }
    const exacts = [...seen.values()].filter((r) => r.exact);
    if (exacts.length) break; // the romaji search already found it
  }
  const all = [...seen.values()];
  const yearGap = (r: Raw) => (r.year && t.startYear ? Math.abs(Number(r.year) - t.startYear) : 5);
  const pick = (list: Raw[]) =>
    list.sort((a, b) => yearGap(a) - yearGap(b) || (b.rating_votes ?? 0) - (a.rating_votes ?? 0))[0];
  const exacts = all.filter((r) => r.exact);
  if (exacts.length) return { record: pick(exacts), match: exacts.length === 1 ? "exact" : "check" };
  const near = all.filter((r) => yearGap(r) <= 1);
  return near.length ? { record: pick(near), match: "check" } : null;
}

const titles: Raw[] = JSON.parse(fs.readFileSync(SRC, "utf8"));
const prev = new Map<number, Raw>(
  (!process.env.ALL && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : []).map((r: Raw) => [r.anilistId, r]),
);
const out: Raw[] = [];
const fresh = new Set<number>(); // fetched this run, for the summary below

for (const [i, t] of titles.entries()) {
  if (prev.has(t.anilistId)) {
    out.push(prev.get(t.anilistId));
    continue;
  }
  fresh.add(t.anilistId);
  const m = await match(t);
  if (!m) {
    out.push({ anilistId: t.anilistId, match: "none" });
    console.log(`${i + 1}/${titles.length} ${t.title}: no match`);
    continue;
  }
  const id = m.record.series_id;
  const series = await call(`/series/${id}`);
  const comments = await call(`/series/${id}/comments/search`, { page: 1, perpage: PER_TITLE });
  out.push({
    anilistId: t.anilistId,
    match: m.match,
    muId: id,
    muTitle: series.title,
    muYear: series.year,
    url: series.url,
    rating: series.bayesian_rating,
    ratingVotes: series.rating_votes,
    genres: (series.genres ?? []).map((g: Raw) => g.genre),
    categories: (series.categories ?? [])
      .filter((c: Raw) => c.votes > 0)
      .sort((a: Raw, b: Raw) => b.votes - a.votes)
      .map((c: Raw) => ({ name: c.category, votes: c.votes })),
    commentTotal: comments.total_hits ?? 0,
    comments: (comments.results ?? []).map((c: Raw) => ({
      id: c.record.comment_id,
      text: (c.record.content ?? "").replace(/\s+/g, " ").trim().slice(0, COMMENT_CHARS),
    })),
  });
  console.log(`${i + 1}/${titles.length} ${t.title} -> ${series.title} [${m.match}] ${comments.total_hits ?? 0} comments`);
  if ((i + 1) % 20 === 0) fs.writeFileSync(OUT, JSON.stringify(out, null, 2)); // keep progress
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const by = (k: string) => out.filter((r) => r.match === k && fresh.has(r.anilistId));
console.log(`${out.length - fresh.size} kept from the previous run; the counts below are for the ${fresh.size} fetched now`);
console.log(`saved ${out.length} -> ${OUT}; exact ${by("exact").length}, check ${by("check").length}, none ${by("none").length}`);
for (const r of [...by("check"), ...by("none")]) {
  const t = titles.find((x) => x.anilistId === r.anilistId);
  console.log(`  ${r.match}: ${t.title} (${r.anilistId}, ${t.startYear}) -> ${r.muTitle ?? "-"} (${r.muYear ?? "-"})`);
}
