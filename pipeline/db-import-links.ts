// Load official reading links from data/raw/links.json into reading_links.
// Thai first, then English. Only rows with source = 'anilist' are added,
// updated or removed; manual and affiliate rows are never touched.
//
// Usage: npx tsx pipeline/db-import-links.ts
import fs from "node:fs";
import { sql, closeDb } from "./db.ts";

const SKIP_SITES = new Set(["Kakao Webtoon"]); // closed
const raw: { anilistId: number; links: any[] }[] = JSON.parse(fs.readFileSync("data/raw/links.json", "utf8"));

const rows = raw.flatMap(({ anilistId, links }) =>
  links
    .filter((l) => !l.isDisabled && l.type !== "SOCIAL" && !SKIP_SITES.has(l.site))
    .filter((l) => l.language === "Thai" || l.language === "English")
    .map((l) => ({
      anilist_id: anilistId,
      kind: l.language === "Thai" ? "th_read" : "en_official",
      site: l.site === "Official Site" ? "เว็บทางการ" : l.site,
      url: l.url,
      source: "anilist",
      // Thai, then English reading sites, then English publisher pages
      sort: l.language === "Thai" ? 0 : l.type === "STREAMING" ? 100 : 200,
    })),
);
// AniList sometimes lists the same URL twice
const unique = [...new Map(rows.map((r) => [`${r.anilist_id} ${r.url}`, r])).values()];

await sql.begin(async (tx) => {
  await tx`delete from reading_links r where r.source = 'anilist'
    and not exists (select 1 from json_to_recordset(${JSON.stringify(unique)}::text::json)
      as n(anilist_id int, url text) where n.anilist_id = r.anilist_id and n.url = r.url)`;
  await tx`insert into reading_links ${tx(unique)}
    on conflict (anilist_id, url) do update set
      kind = excluded.kind, site = excluded.site, sort = excluded.sort
    where reading_links.source = 'anilist'`;
});

const withThai = new Set(unique.filter((r) => r.kind === "th_read").map((r) => r.anilist_id)).size;
const withAny = new Set(unique.map((r) => r.anilist_id)).size;
console.log(`${unique.length} links; ${withThai} titles have Thai, ${withAny} have any, ${raw.length - withAny} have none`);
await closeDb();
