// Fetch AniList "readers also liked" for our titles, with vote counts and the basic
// facts of each recommended title, into data/raw/anilist-recs.json. Separate from
// anilist-top.json so the facts the blurbs were written from stay as they are.
//
// Usage: npx tsx pipeline/fetch-recs.ts [perTitle=10]
import fs from "node:fs";

const PER_TITLE = Number(process.argv[2] ?? 10);
const PAGE_SIZE = 10; // 10 titles x 10 recs stays under AniList's query complexity limit
const OUT = "data/raw/anilist-recs.json";

const QUERY = `
query ($page: Int, $perPage: Int, $ids: [Int], $recs: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: MANGA, id_in: $ids) {
      id
      recommendations(sort: RATING_DESC, perPage: $recs) {
        nodes {
          rating
          mediaRecommendation {
            id
            title { romaji english }
            type format countryOfOrigin status isAdult
            averageScore popularity
            genres
            relations { edges { relationType } }
          }
        }
      }
    }
  }
}`;

type Raw = any;

async function gql(variables: Record<string, unknown>): Promise<Raw> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables }),
    });
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

const raw: Raw[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const ids = raw.map((t) => t.anilistId);
const out: Raw[] = [];

for (let i = 0; i < ids.length; i += PAGE_SIZE) {
  const data = await gql({ page: 1, perPage: PAGE_SIZE, ids: ids.slice(i, i + PAGE_SIZE), recs: PER_TITLE });
  for (const m of data.media)
    out.push({
      anilistId: m.id,
      recs: m.recommendations.nodes
        .filter((n: Raw) => n.mediaRecommendation)
        .map((n: Raw) => {
          const r = n.mediaRecommendation;
          return {
            anilistId: r.id,
            title: r.title.english ?? r.title.romaji, // same naming as anilist-top.json
            titleRomaji: r.title.romaji,
            votes: n.rating,
            type: r.type,
            format: r.format,
            country: r.countryOfOrigin,
            status: r.status,
            isAdult: r.isAdult,
            score: r.averageScore,
            popularity: r.popularity,
            genres: r.genres,
            sequel: r.relations.edges.some((e: Raw) => e.relationType === "PREQUEL" || e.relationType === "PARENT"),
          };
        }),
    });
  console.log(`${Math.min(i + PAGE_SIZE, ids.length)}/${ids.length}`);
  await new Promise((r) => setTimeout(r, 2500)); // stay well under the rate limit
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`saved recs for ${out.length} titles -> ${OUT}`);
