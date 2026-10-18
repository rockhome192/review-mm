// Fetch AniList externalLinks (official reading / publisher pages) for every title
// in data/raw/anilist-top.json into data/raw/links.json.
//
// Usage: npx tsx pipeline/fetch-links.ts
import fs from "node:fs";

const IN = "data/raw/anilist-top.json";
const OUT = "data/raw/links.json";
const PAGE_SIZE = 50;

const QUERY = `
query ($ids: [Int], $perPage: Int) {
  Page(perPage: $perPage) {
    media(id_in: $ids, type: MANGA) {
      id
      externalLinks { site url type language isDisabled }
    }
  }
}`;

const ids: number[] = JSON.parse(fs.readFileSync(IN, "utf8")).map((t: any) => t.anilistId);
const out: { anilistId: number; links: any[] }[] = [];

for (let i = 0; i < ids.length; i += PAGE_SIZE) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { ids: ids.slice(i, i + PAGE_SIZE), perPage: PAGE_SIZE } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  for (const m of json.data.Page.media) out.push({ anilistId: m.id, links: m.externalLinks });
  console.log(`${out.length}/${ids.length}`);
  await new Promise((r) => setTimeout(r, 2500));
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`saved ${out.length} titles -> ${OUT}`);
