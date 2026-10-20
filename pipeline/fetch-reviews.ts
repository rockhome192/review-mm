// Fetch more reader reviews and the full tag list for titles already in
// data/raw/anilist-top.json, into data/raw/anilist-reviews.json. Used to build a
// crowd mood estimate to check the AI mood scores against. anilist-top.json itself
// is not touched, so the writer's source data stays fixed.
//
// Titles already in the output are kept as they are; only new titles are fetched.
// Set ALL=1 to refetch everything.
//
// Usage: npx tsx pipeline/fetch-reviews.ts [reviewsPerTitle=10]
import fs from "node:fs";

const PER_TITLE = Number(process.argv[2] ?? 10);
const IDS_PER_CALL = 10;
const REVIEW_CHARS = 2000; // a bit more than the writer gets: moods often sit late in a review
const SRC = "data/raw/anilist-top.json";
const OUT = process.env.OUT ?? "data/raw/anilist-reviews.json";

const QUERY = `
query ($ids: [Int], $perPage: Int) {
  Page(perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id
      tags { name rank isMediaSpoiler }
      reviews(sort: RATING_DESC, perPage: $perPage) {
        pageInfo { total }
        nodes { id summary score rating ratingAmount body(asHtml: false) }
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

const ids: number[] = JSON.parse(fs.readFileSync(SRC, "utf8")).map((t: Raw) => t.anilistId);
const prev: Raw[] = !process.env.ALL && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
const byId = new Map<number, Raw>(prev.map((t) => [t.anilistId, t]));
const todo = ids.filter((id) => !byId.has(id));
console.log(`${ids.length - todo.length} already fetched, ${todo.length} to fetch`);

for (let i = 0; i < todo.length; i += IDS_PER_CALL) {
  const data = await gql({ ids: todo.slice(i, i + IDS_PER_CALL), perPage: PER_TITLE });
  for (const m of data.media)
    byId.set(m.id, {
      anilistId: m.id,
      reviewTotal: m.reviews.pageInfo.total,
      // all non-spoiler tags, including low-ranked ones: a weak "comedy 30%" is a signal too
      tags: m.tags
        .filter((t: Raw) => !t.isMediaSpoiler)
        .map((t: Raw) => ({ name: t.name, rank: t.rank })),
      reviews: m.reviews.nodes.map((r: Raw) => ({
        id: r.id,
        summary: clean(r.summary),
        score: r.score,
        helpful: r.rating,
        votes: r.ratingAmount,
        excerpt: clean(r.body).slice(0, REVIEW_CHARS),
      })),
    });
  console.log(`${Math.min(i + IDS_PER_CALL, todo.length)}/${todo.length}`);
  await new Promise((r) => setTimeout(r, 2500)); // stay well under the rate limit
}

const missing = ids.filter((id) => !byId.has(id));
if (missing.length) console.log(`missing: ${missing.join(", ")}`);
const out = ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const counts = out.map((t) => t.reviews.length);
console.log(
  `saved ${out.length} titles -> ${OUT}; reviews: ${counts.reduce((a, b) => a + b, 0)} total, ` +
    `${counts.filter((c) => c === 0).length} titles with none, ${counts.filter((c) => c < 3).length} with <3`,
);
