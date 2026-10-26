// Find which titles in data/raw/anilist-top.json have a Thai print edition, and from
// which Thai publisher, using the infobox on Thai Wikipedia. Writes
// data/raw/th-publishers.json and data/raw/th-publishers-review.csv (by popularity, for
// a human to check). Feeds the Shopee / e-book links in the legal-reading box.
//
// Finding the Thai page:
//   1. Wikidata item with this AniList manga ID (P8731) -> its th.wikipedia sitelink.
//   2. Otherwise English Wikipedia by title (also "<title> (manga)" etc.) -> its Thai
//      language link. Accepted only if the Thai page mentions the native title; else
//      the row is kept with check = true.
// Reading the infobox: only print blocks for manga / manhwa / webtoon (light novel and
// anime blocks are skipped). Thai publishers come from publisher_th, or from a
// publisher line marked {{flagicon|Thailand}} or "(ไทย)".
//
// Usage: npx tsx pipeline/fetch-th-publishers.ts
import fs from "node:fs";

const SRC = "data/raw/anilist-top.json";
const OUT = "data/raw/th-publishers.json";
const CSV = "data/raw/th-publishers-review.csv";
const UA = { "User-Agent": "review-manga/1.0 (https://review-manga.rockhome03.workers.dev)" };
const GAP_MS = 500;

type Raw = any;
type Publisher = { name: string; key: string | null; from: "infobox" | "text" };
type Row = {
  anilistId: number;
  title: string;
  type: string;
  popularity: number;
  via: "wikidata" | "name" | null;
  check: boolean;
  thPage: string | null;
  publishers: Publisher[];
};

// Known Thai manga publishers; anything else keeps key null so it shows up for review.
const PUBLISHERS: [string, RegExp][] = [
  ["siam-inter", /สยามอินเตอร์|siam inter/i],
  ["luckpim", /รักพิมพ์|luckpim/i],
  ["phoenix", /ฟีนิกซ์|phoenix/i],
  ["ned", /เนชั่น|ned\b/i],
  ["vibulkij", /วิบูลย์กิจ|vibulkij/i],
  ["bongkoch", /บงกช|bongkoch/i],
  ["dexpress", /เดกซ์|dexpress/i],
  ["animag", /อนิแม็ก|animag/i],
  ["zenshu", /เซนชู|zenshu/i],
  ["rose", /โรส มีเดีย|rose media/i],
  ["first-page", /เฟิร์ส ?เพจ|first page/i],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

async function getJson(url: URL | string, init?: RequestInit): Promise<Raw> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(GAP_MS);
    const res = await fetch(url, { ...init, headers: { ...UA, ...init?.headers } });
    if (res.status === 429 || res.status >= 500) {
      console.log(`  ${res.status}, waiting 30s`);
      await sleep(30_000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`too many retries on ${url}`);
}

// POST: 40 Thai titles, percent-encoded, are too long for a URL (414)
function wikiApi(host: string, params: Record<string, string>) {
  return getJson(`https://${host}/w/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, format: "json", formatversion: "2" }).toString(),
  });
}

async function thPagesFromWikidata(ids: number[]) {
  const query = `SELECT ?al ?th WHERE {
    VALUES ?al { ${ids.map((i) => `"${i}"`).join(" ")} }
    ?item wdt:P8731 ?al .
    ?th schema:about ?item ; schema:isPartOf <https://th.wikipedia.org/> .
  }`;
  const data = await getJson("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
    body: "query=" + encodeURIComponent(query),
  });
  const out = new Map<number, string>();
  for (const b of data.results.bindings) {
    out.set(Number(b.al.value), decodeURIComponent(b.th.value.split("/wiki/")[1]).replace(/_/g, " "));
  }
  return out;
}

// English title -> Thai page title, via English Wikipedia language links (50 per call).
async function thPagesFromEnglish(names: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const data = await wikiApi("en.wikipedia.org", {
      action: "query", prop: "langlinks", lllang: "th", redirects: "1", titles: batch.join("|"),
    });
    const from = new Map<string, string>(); // resolved title -> name we asked for
    for (const n of data.query.normalized ?? []) from.set(n.to, n.from);
    for (const r of data.query.redirects ?? []) from.set(r.to, from.get(r.from) ?? r.from);
    for (const p of data.query.pages) {
      const th = p.langlinks?.[0]?.title;
      if (th) out.set(from.get(p.title) ?? p.title, th);
    }
  }
  return out;
}

async function thWikitext(pages: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < pages.length; i += 40) {
    const batch = pages.slice(i, i + 40);
    const data = await wikiApi("th.wikipedia.org", {
      action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: batch.join("|"),
    });
    const from = new Map<string, string>();
    for (const n of data.query.normalized ?? []) from.set(n.to, n.from);
    for (const r of data.query.redirects ?? []) from.set(r.to, from.get(r.from) ?? r.from);
    for (const p of data.query.pages) {
      const text = p.revisions?.[0]?.slots?.main?.content;
      if (text) out.set(from.get(p.title) ?? p.title, text);
    }
  }
  return out;
}

// "[[ฟีนิกซ์ (สำนักพิมพ์)|ฟีนิกซ์]]" -> "ฟีนิกซ์"; drops templates, refs and comments.
function plain(s: string) {
  return s
    .replace(/<!--[\s\S]*?-->|<ref[\s\S]*?(<\/ref>|\/>)/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{ill\|([^|}]*)[^}]*\}\}/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/^สำนักพิมพ์\s*|\s*\(สำนักพิมพ์\)$/g, "")
    .trim();
}

// Values of "| name = value" lines. [ \t] not \s, so an empty value doesn't run onto the next line.
function field(block: string, name: string) {
  return [...block.matchAll(new RegExp(`^[ \\t]*\\|[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, "gim"))].map((m) => m[1]);
}

// Print blocks (manga, manhwa, "รวมเล่ม", ...); each block runs until the next line
// opening a template. Novel blocks are dropped: their Thai publisher is for the novel.
function printBlocks(w: string) {
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (const line of w.split("\n")) {
    if (/^\s*\{\{/.test(line)) {
      if (cur) blocks.push(cur.join("\n"));
      cur = /^\s*\{\{\s*(Infobox animanga\/Print|Infobox manhwa|Infobox manga|กล่องข้อมูล การ์ตูน(ญี่ปุ่น)?\/(มังงะ|สิ่งพิมพ์))/i.test(line)
        ? [line]
        : null;
    } else if (cur) cur.push(line);
  }
  if (cur) blocks.push(cur.join("\n"));
  return blocks.filter((b) => !/novel|นิยาย|นวนิยาย|โนเวล/i.test(field(b, "type")[0] ?? ""));
}

// Infobox first: publisher_th, or any publisher* line part marked {{flagicon|Thailand}} or
// "(ไทย)". If the infobox names none, fall back to prose like "ตีพิมพ์โดย[[สยามอินเตอร์คอมิกส์]]",
// for known publishers only (prose also names anime DVD licensors).
function thaiPublishers(w: string): Publisher[] {
  const found: Publisher[] = [];
  for (const b of printBlocks(w)) {
    for (const v of field(b, "publisher_th")) {
      for (const n of v.split(/<br\s*\/?>|,/)) found.push({ name: n, key: null, from: "infobox" });
    }
    for (const v of field(b, "publisher_?[a-z]*")) {
      for (const part of v.split(/<br\s*\/?>|\{\{flagicon\|/i)) {
        if (/^Thailand\}\}/i.test(part)) found.push({ name: part.replace(/^Thailand\}\}/i, ""), key: null, from: "infobox" });
        else if (/\(ไทย\)/.test(part)) {
          // "{{ubl|D&C Media (เกาหลี)|[[ฟีนิกซ์]] (ไทย)}}": the name is the list item before "(ไทย)"
          const name = part.replace(/\s*\(ไทย\)[\s\S]*/, "").replace(/\[\[[^\]]*\]\]/g, (l) => l.replace(/\|/g, "\u0000"));
          found.push({ name: name.split("|").pop()!.replace(/\u0000/g, "|"), key: null, from: "infobox" });
        }
      }
    }
  }
  if (!found.length) {
    const text = plain(w.replace(/\{\{[^{}]*\}\}/g, ""));
    for (const m of text.matchAll(/(ตีพิมพ์|จัดพิมพ์|ลิขสิทธิ์)[^.\n]{0,60}/g)) {
      for (const [key, re] of PUBLISHERS) if (re.test(m[0])) found.push({ name: m[0].match(re)![0], key, from: "text" });
    }
  }
  const seen = new Map<string, Publisher>();
  for (const p of found) {
    const name = plain(p.name);
    if (!name) continue;
    const key = p.key ?? PUBLISHERS.find(([, re]) => re.test(name))?.[0] ?? null;
    if (!seen.has(key ?? name)) seen.set(key ?? name, { name, key, from: p.from });
  }
  return [...seen.values()];
}

async function main() {
  const titles: Raw[] = JSON.parse(fs.readFileSync(SRC, "utf8"));
  console.log(`${titles.length} titles`);

  const byWikidata = await thPagesFromWikidata(titles.map((t) => t.anilistId));
  console.log(`Wikidata: ${byWikidata.size} have a Thai page`);

  const rest = titles.filter((t) => !byWikidata.has(t.anilistId));
  const candidates = (t: Raw) => {
    const kind = t.type === "manhwa" ? ["manhwa", "webtoon"] : ["manga"];
    const base = [...new Set([t.title, t.titleRomaji].filter(Boolean))];
    return [...base.flatMap((b) => kind.map((k) => `${b} (${k})`)), ...base];
  };
  const byEnglish = await thPagesFromEnglish([...new Set(rest.flatMap(candidates))]);

  const pageOf = new Map<number, { page: string; via: "wikidata" | "name" }>();
  for (const [id, page] of byWikidata) pageOf.set(id, { page, via: "wikidata" });
  for (const t of rest) {
    const hit = candidates(t).find((c) => byEnglish.has(c));
    if (hit) pageOf.set(t.anilistId, { page: byEnglish.get(hit)!, via: "name" });
  }

  const texts = await thWikitext([...new Set([...pageOf.values()].map((p) => p.page))]);

  const rows: Row[] = titles.map((t) => {
    const p = pageOf.get(t.anilistId);
    const w = p ? texts.get(p.page) ?? "" : "";
    const nativeFound = !!t.titleNative && norm(w).includes(norm(t.titleNative));
    return {
      anilistId: t.anilistId,
      title: t.title,
      type: t.type,
      popularity: t.popularity,
      via: p?.via ?? null,
      check: p?.via === "name" && !nativeFound,
      thPage: p?.page ?? null,
      publishers: w && !(p?.via === "name" && !nativeFound) ? thaiPublishers(w) : [],
    };
  });

  const out = Object.fromEntries(rows.map((r) => [r.anilistId, r]));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");

  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [...rows]
    .sort((a, b) => b.popularity - a.popularity)
    .map((r, i) =>
      [
        i + 1, cell(r.title), r.type, cell(r.publishers.map((p) => p.name + (p.from === "text" ? " (จากเนื้อหา)" : "")).join(" / ")),
        r.via ?? "", r.check ? "check" : "",
        r.thPage ? cell(`https://th.wikipedia.org/wiki/${encodeURIComponent(r.thPage.replace(/ /g, "_"))}`) : "",
        "", // ถูกไหม: left for the reviewer
      ].join(","),
    );
  // BOM so Excel opens the Thai text as UTF-8
  fs.writeFileSync(CSV, "﻿" + ["rank,title,type,thai_publishers,via,flag,th_wiki,correct?", ...lines].join("\n") + "\n");

  const found = rows.filter((r) => r.publishers.length);
  console.log(`Thai page: ${pageOf.size} (wikidata ${byWikidata.size}, name ${pageOf.size - byWikidata.size})`);
  console.log(`Thai publisher found: ${found.length}`);
  for (const type of ["manga", "manhwa"]) {
    const s = rows.filter((r) => r.type === type);
    console.log(`  ${type}: ${s.filter((r) => r.publishers.length).length} / ${s.length}`);
  }
  const top = [...rows].sort((a, b) => b.popularity - a.popularity).slice(0, 100);
  console.log(`  top 100 by popularity: ${top.filter((r) => r.publishers.length).length}`);
  const count = new Map<string, number>();
  for (const r of found) for (const p of r.publishers) count.set(p.key ?? `? ${p.name}`, (count.get(p.key ?? `? ${p.name}`) ?? 0) + 1);
  console.log([...count].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
  console.log(`check (matched by name, native title not on page): ${rows.filter((r) => r.check).length}`);
  console.log(`wrote ${OUT} and ${CSV}`);
}

main();
