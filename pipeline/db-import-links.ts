// Load reading links into reading_links:
//   source 'anilist': official reading links from data/raw/links.json, Thai first, then English
//   source 'auto':    Thai print editions from data/raw/th-publishers.json (kind th_buy): the
//                     publisher's official shop when we know it, else the Thai Wikipedia page
//                     the publisher came from
// Only rows with those two sources are added, updated or removed; manual and affiliate rows
// are never touched.
//
// Usage: npx tsx pipeline/db-import-links.ts [--dry]   (--dry: print the counts, no database)
import fs from "node:fs";

const DRY = process.argv.includes("--dry");

type Row = { anilist_id: number; kind: string; site: string; url: string; source: string; sort: number };

const SKIP_SITES = new Set(["Kakao Webtoon"]); // closed
const raw: { anilistId: number; links: any[] }[] = JSON.parse(fs.readFileSync("data/raw/links.json", "utf8"));

const anilistRows: Row[] = raw.flatMap(({ anilistId, links }) =>
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

// Publisher keys from fetch-th-publishers.ts. `shop` only where the official store was checked
// by hand (2026-10-31); none of the shops has a search URL we can link per title, so it's the
// store's front page.
const PUBLISHERS: Record<string, { name: string; shop?: { site: string; url: string } }> = {
  "siam-inter": { name: "สยามอินเตอร์คอมิกส์", shop: { site: "Siam Inter Shop", url: "https://www.yaakz.com/" } },
  luckpim: { name: "รักพิมพ์", shop: { site: "ร้านรักพิมพ์", url: "https://www.luckpim.com/" } },
  phoenix: { name: "ฟีนิกซ์", shop: { site: "Phoenix Next", url: "https://www.phoenixnext.com/" } },
  "first-page": { name: "First Page Pro", shop: { site: "Phoenix Next (First Page Pro)", url: "https://www.phoenixnext.com/" } },
  ned: { name: "เนชั่น เอ็ดดูเทนเมนท์ (NED)" },
  vibulkij: { name: "วิบูลย์กิจ" },
  bongkoch: { name: "บงกช" },
  dexpress: { name: "เดกซ์เพรส" },
  zenshu: { name: "เซนชู" },
  animag: { name: "อนิแม็ก" },
  rose: { name: "โรส มีเดีย" },
};

const th: Record<string, { anilistId: number; check: boolean; thPage: string | null; publishers: { name: string; key: string | null }[] }> =
  JSON.parse(fs.readFileSync("data/raw/th-publishers.json", "utf8"));

const publisherRows: Row[] = Object.values(th)
  .filter((t) => t.publishers.length && !t.check && t.thPage) // check = not confirmed by a human
  .flatMap((t) => {
    const known = [...new Set(t.publishers.flatMap((p) => (p.key && PUBLISHERS[p.key] ? [p.key] : [])))];
    const row = (site: string, url: string, sort: number): Row => ({ anilist_id: t.anilistId, kind: "th_buy", site, url, source: "auto", sort });
    const shops = known.flatMap((k) => (PUBLISHERS[k].shop ? [PUBLISHERS[k].shop!] : []));
    // publishers without a known shop share one row: the Wikipedia page that names them.
    // Unknown names are often wrong (magazines, foreign publishers), so only when nothing else is known.
    const unlisted = known.length
      ? known.filter((k) => !PUBLISHERS[k].shop).map((k) => PUBLISHERS[k].name)
      : t.publishers.map((p) => p.name);
    return [
      ...shops.map((s) => row(s.site, s.url, 50)),
      ...(unlisted.length
        ? [row(`${unlisted.join(", ")} (ข้อมูลจากวิกิพีเดีย)`, `https://th.wikipedia.org/wiki/${encodeURIComponent(t.thPage!.replaceAll(" ", "_"))}`, 60)]
        : []),
    ];
  });

// AniList sometimes lists the same URL twice; two publishers can share a shop
const dedupe = (rows: Row[]) => [...new Map(rows.map((r) => [`${r.anilist_id} ${r.url}`, r])).values()];

const { sql, closeDb } = DRY ? { sql: null, closeDb: async () => {} } : await import("./db.ts");
for (const [source, rows] of DRY ? [] : ([["anilist", dedupe(anilistRows)], ["auto", dedupe(publisherRows)]] as const)) {
  await sql!.begin(async (tx) => {
    await tx`delete from reading_links r where r.source = ${source}
      and not exists (select 1 from json_to_recordset(${JSON.stringify(rows)}::text::json)
        as n(anilist_id int, url text) where n.anilist_id = r.anilist_id and n.url = r.url)`;
    await tx`insert into reading_links ${tx(rows)}
      on conflict (anilist_id, url) do update set
        kind = excluded.kind, site = excluded.site, sort = excluded.sort
      where reading_links.source = ${source}`;
  });
}

const all = [...dedupe(anilistRows), ...dedupe(publisherRows)];
const titlesWith = (f: (r: Row) => boolean) => new Set(all.filter(f).map((r) => r.anilist_id)).size;
console.log(`${all.length} links (${dedupe(publisherRows).length} Thai print)`);
console.log(`titles: ${titlesWith((r) => r.kind === "th_read")} read in Thai, ${titlesWith((r) => r.kind === "th_buy")} Thai print, ${titlesWith(() => true)} any, ${raw.length - titlesWith(() => true)} none`);
await closeDb();
