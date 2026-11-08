// Fetch manga (JP) and manhwa (KR) from AniList, with reader reviews and
// "readers also liked" recommendations, into data/raw/anilist-top.json.
//
// Two pools, because top-by-score is mostly action/drama:
//   score: top-rated per country
//   mood:  top-rated per light genre (romance / slice of life / comedy), no action/horror,
//          to give the site enough "ฟินใจละลาย" and "ชิลๆ" picks
//
// Usage: npx tsx pipeline/fetch-anilist.ts [scorePerCountry=70] [moodPerGenreCountry=10]
//        npx tsx pipeline/fetch-anilist.ts more <manhwa> <manga>
//        npx tsx pipeline/fetch-anilist.ts more ids <id,id,...>
//          append the most-read standalone titles not yet in the file (pool "popular")
import fs from "node:fs";

const MORE = process.argv[2] === "more";
const MIN_SCORE_POPULAR = 74; // widely read is not the same as good
const SCORE_PER_COUNTRY = Number(process.argv[2] ?? 70);
const MOOD_PER_BUCKET = Number(process.argv[3] ?? 10);
const MOOD_GENRES = ["Romance", "Slice of Life", "Comedy"];
const MOOD_EXCLUDE = ["Action", "Horror", "Thriller"];
const PAGE_SIZE = 25;
const MIN_POPULARITY = 15000; // skip titles with too few ratings to trust the score
const MIN_POPULARITY_MOOD = 5000; // light genres are less popular on AniList, esp. KR
const REVIEW_CHARS = 1500; // per review, enough to find why people love it
const OUT = process.env.OUT ?? "data/raw/anilist-top.json";

// Separate AniList entries for the same story; keep only the one more people read.
const SKIP = new Set([
  98361, // Mikkakan no Koufuku (2013) — same novel as 97553 Jumyou wo Kaitotte Moratta (2016, 85K readers)
  101311, // Bakemonogatari manga — the novel (44893) is already on the site
  78621, // Koe no Katachi 2011 one-shot — the series (85135 A Silent Voice) is already on the site
  122337, // The Angel Next Door manga — the novel (113533) is already on the site
  99026, // The Apothecary Diaries (Nekokurage) — the Kurata manga (99022) is already on the site
  33299, // Spice & Wolf — the 2006 manga (39115) is already on the site
  107790, // No Longer Human (Junji Ito) — Usamaru Furuya's version (43290) is already on the site
  85364, // One Punch Man webcomic — the Murata manga (74347) is already on the site
  115154, // Gokurakugai one-shot — the series (150378) is already on the site
]);

const QUERY = `
query ($page: Int, $perPage: Int, $country: CountryCode, $minPop: Int, $minScore: Int, $ids: [Int],
       $sort: [MediaSort] = [SCORE_DESC], $genreIn: [String], $genreNotIn: [String]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: MANGA, sort: $sort, isAdult: false, id_in: $ids,
          countryOfOrigin: $country, popularity_greater: $minPop, averageScore_greater: $minScore,
          genre_in: $genreIn, genre_not_in: $genreNotIn) {
      id
      title { romaji english native }
      countryOfOrigin format status chapters volumes
      averageScore popularity
      startDate { year }
      genres
      tags { name rank isMediaSpoiler }
      coverImage { large color }
      siteUrl
      description(asHtml: false)
      reviews(sort: RATING_DESC, perPage: 3) {
        nodes { summary score rating body(asHtml: false) }
      }
      relations { edges { relationType node { id } } }
      recommendations(sort: RATING_DESC, perPage: 5) {
        nodes { rating mediaRecommendation { id title { romaji english } } }
      }
    }
  }
}`;

type Raw = any;

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/img\d*\([^)]*\)/g, " ") // AniList image markup
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links
    .replace(/<[^>]+>|~!|!~|[_*#~>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function gql(variables: Record<string, unknown>): Promise<Raw> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: QUERY, variables }),
      });
    } catch (e) {
      console.log(`  network error (${(e as Error).message}), retrying in 10s`);
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 60);
      console.log(`  rate limited, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
    return json.data.Page;
  }
  throw new Error("AniList: too many retries");
}

function slim(m: Raw, pool: string) {
  return {
    anilistId: m.id,
    pool,
    title: m.title.english ?? m.title.romaji,
    titleRomaji: m.title.romaji,
    titleNative: m.title.native,
    type: m.countryOfOrigin === "KR" ? "manhwa" : "manga",
    status: m.status,
    chapters: m.chapters,
    volumes: m.volumes,
    startYear: m.startDate?.year ?? null,
    score: m.averageScore,
    popularity: m.popularity,
    genres: m.genres,
    tags: m.tags
      .filter((t: Raw) => !t.isMediaSpoiler && t.rank >= 50)
      .map((t: Raw) => ({ name: t.name, rank: t.rank })),
    cover: m.coverImage?.large ?? null,
    coverColor: m.coverImage?.color ?? null,
    siteUrl: m.siteUrl,
    synopsis: clean(m.description),
    reviews: m.reviews.nodes.map((r: Raw) => ({
      summary: clean(r.summary),
      score: r.score,
      helpful: r.rating,
      excerpt: clean(r.body).slice(0, REVIEW_CHARS),
    })),
    alsoLiked: m.recommendations.nodes
      .filter((n: Raw) => n.mediaRecommendation)
      .map((n: Raw) => n.mediaRecommendation.title.english ?? n.mediaRecommendation.title.romaji),
  };
}

// Low-popularity sequels and spin-offs score high with their existing fans but are
// no place to start reading. The score pool keeps them (e.g. Steel Ball Run).
const isSequel = (m: Raw) =>
  m.relations.edges.some((e: Raw) => e.relationType === "PREQUEL" || e.relationType === "PARENT");

const out: ReturnType<typeof slim>[] = [];
const seen = new Set<number>(SKIP);

// Another edition of a story already picked (e.g. a second manga adaptation of the
// same novel, or a one-shot of a series) usually has the same English or romaji title,
// or AniList links it as ALTERNATIVE. Only checked in "more" mode; hand-picked ids are trusted.
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const titleOwner = new Map<string, string>();
let checkTitles = false;
const picked = new Map<number, string>();
function remember(t: { anilistId: number; title: string; titleRomaji: string }) {
  picked.set(t.anilistId, t.title);
  for (const k of [norm(t.title), norm(t.titleRomaji)]) if (k && !titleOwner.has(k)) titleOwner.set(k, `${t.anilistId} ${t.title}`);
}
function sameStory(m: Raw, t: { anilistId: number; title: string; titleRomaji: string }) {
  // AniList links another version of the same story (e.g. a one-shot of a series) as ALTERNATIVE
  const alt = m.relations.edges.find((e: Raw) => e.relationType === "ALTERNATIVE" && picked.has(e.node.id));
  const owner = alt ? `${alt.node.id} ${picked.get(alt.node.id)}` : titleOwner.get(norm(t.title)) ?? titleOwner.get(norm(t.titleRomaji));
  if (owner) console.log(`  skip ${t.anilistId} ${t.title}: same story as ${owner} (add it to SKIP to silence)`);
  return Boolean(owner);
}

/** Append up to `want` new titles matching `filter`, skipping ones already picked. */
async function take(want: number, pool: string, filter: Record<string, unknown>, standaloneOnly = false) {
  let got = 0;
  for (let page = 1; got < want; page++) {
    const data = await gql({ page, perPage: PAGE_SIZE, ...filter });
    const batch = data.media
      // cancelled series (e.g. dropped for plagiarism) are not worth recommending
      .filter((m: Raw) => m.status !== "CANCELLED" && !seen.has(m.id))
      .filter((m: Raw) => !standaloneOnly || !isSequel(m))
      .filter((m: Raw) => {
        if (!checkTitles) return true;
        seen.add(m.id); // log each duplicate only once across pages
        return !sameStory(m, slim(m, pool));
      })
      .map((m: Raw) => slim(m, pool))
      .slice(0, want - got);
    for (const t of batch) { seen.add(t.anilistId); remember(t); }
    out.push(...batch);
    got += batch.length;
    console.log(`${pool} ${filter.country} page ${page}: ${got}/${want}`);
    if (!data.pageInfo.hasNextPage) break;
    await new Promise((r) => setTimeout(r, 2500)); // stay well under the rate limit
  }
}

if (MORE) {
  // keep every existing title (and its order) untouched; new ones go at the end
  const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.copyFileSync(OUT, OUT.replace(/\.json$/, `.before-more-${prev.length}.json`));
  out.push(...prev);
  for (const t of prev) { seen.add(t.anilistId); remember(t); }
  if (process.argv[3] === "ids") {
    // hand-picked titles, e.g. to balance genres the popularity order skews
    const ids = process.argv[4].split(",").map(Number);
    await take(ids.length, "popular", { ids, sort: ["POPULARITY_DESC"] });
  } else {
    const [manhwa, manga] = [Number(process.argv[3] ?? 0), Number(process.argv[4] ?? 0)];
    const popular = { sort: ["POPULARITY_DESC"], minScore: MIN_SCORE_POPULAR };
    checkTitles = true;
    await take(manhwa, "popular", { country: "KR", ...popular }, true);
    await take(manga, "popular", { country: "JP", ...popular }, true);
  }
} else {
  for (const country of ["JP", "KR"])
    await take(SCORE_PER_COUNTRY, "score", { country, minPop: MIN_POPULARITY });
  for (const genre of MOOD_GENRES)
    for (const country of ["JP", "KR"])
      await take(MOOD_PER_BUCKET, `mood:${genre}`, {
        country, minPop: MIN_POPULARITY_MOOD, genreIn: [genre], genreNotIn: MOOD_EXCLUDE,
      }, true);
}

fs.mkdirSync("data/raw", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`saved ${out.length} titles -> ${OUT}`);
