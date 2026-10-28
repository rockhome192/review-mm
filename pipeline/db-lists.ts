// Rebuild the curated lists ("ลิสต์คัดสรร") from the catalog data, so new titles
// join the lists they fit. Run after db-import. Safe to re-run.
//
// Each list is a rule over moods, tags, status and chapters, kept to titles
// with AniList score >= MIN_SCORE. data/lists-manual.json adds hand picks per
// list ("pin", always in, whatever the rule says) and drops titles the rule
// gets wrong ("exclude").
// "featured" and "trending" are only created here; pipeline/weekly-trending.ts fills them.
//
// Usage: npx tsx pipeline/db-lists.ts [--dry]
import fs from "node:fs";
import { MOOD_KEYS, type Recommendation } from "./schema.ts";

const DRY = process.argv.includes("--dry");
const MIN_SCORE = 80;

type Raw = {
  anilistId: number; title: string; type: string; status: string; chapters: number | null;
  score: number | null; popularity: number; genres: string[]; tags: { name: string; rank: number }[];
};
type Mood = (typeof MOOD_KEYS)[number];

const raw: Raw[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const moods = new Map<number, Recommendation["moods"]>(
  JSON.parse(fs.readFileSync("data/generated/all.json", "utf8")).map((g: Recommendation) => [g.anilistId, g.moods]),
);
const links = new Map<number, { site: string; language: string | null }[]>(
  JSON.parse(fs.readFileSync("data/raw/links.json", "utf8")).map((t: any) => [t.anilistId, t.links]),
);
const publishers: Record<string, { check: boolean; publishers: unknown[] }> = JSON.parse(
  fs.readFileSync("data/raw/th-publishers.json", "utf8"),
);
const manual: Record<string, { pin: number[]; exclude: number[] }> = JSON.parse(
  fs.readFileSync("data/lists-manual.json", "utf8"),
);

const mood = (t: Raw, k: Mood) => moods.get(t.anilistId)?.[k].score ?? 0;
const tagged = (t: Raw, re: RegExp, minRank = 60) => t.tags.some((x) => re.test(x.name) && x.rank >= minRank);
// Kakao Webtoon TH has shut down; publisher rows marked check are unconfirmed
const inThai = (t: Raw) =>
  (links.get(t.anilistId) ?? []).some((l) => l.language === "Thai" && !/kakao/i.test(l.site)) ||
  (publishers[t.anilistId]?.publishers.length > 0 && !publishers[t.anilistId].check);

type Def = { slug: string; title: string; description: string; rule?: (t: Raw) => boolean };
// menu order
const LISTS: Def[] = [
  { slug: "trending", title: "กำลังฮิตตอนนี้", description: "อัปเดตทุกวันจันทร์" },
  {
    slug: "levelup", title: "พระเอกเลเวลอัป ยิ่งอ่านยิ่งเทพ", description: "สายมันส์",
    rule: (t) => t.type === "manhwa" && mood(t, "action") >= 2 &&
      tagged(t, /Dungeon|Video Games|Super Power|Cultivation|Martial Arts|Time Manipulation/),
  },
  { slug: "tissues", title: "เตรียมทิชชู่ให้พร้อม", description: "สายซึ้ง", rule: (t) => mood(t, "cry") >= 3 },
  {
    slug: "romance", title: "โรแมนซ์ที่ไม่น้ำเน่า", description: "ฟินแบบมีสาระ",
    rule: (t) => mood(t, "romance") >= 3 && !tagged(t, /Revenge|Female Harem|Love Triangle|Villainess|Ecchi|Nudity/, 50),
  },
  {
    slug: "bedtime", title: "อ่านชิลๆ ก่อนนอน", description: "ไม่ต้องลุ้น ไม่ต้องเครียด",
    rule: (t) => mood(t, "chill") >= 2 && mood(t, "thrill") <= 1 && mood(t, "action") <= 1,
  },
  {
    slug: "short-reads", title: "จบสั้น อ่านรวดเดียว", description: "ไม่เกิน 60 ตอน ไม่ต้องรอตอนใหม่",
    rule: (t) => t.status === "FINISHED" && !!t.chapters && t.chapters <= 60,
  },
  { slug: "comedy", title: "ฮาจนท้องแข็ง", description: "สายฮา", rule: (t) => mood(t, "comedy") >= 3 },
  { slug: "thriller", title: "ลุ้นจนตัวเกร็ง", description: "สายลุ้น", rule: (t) => mood(t, "thrill") >= 3 },
  { slug: "sports", title: "กีฬาเลือดร้อน", description: "สายกีฬา", rule: (t) => t.genres.includes("Sports") },
  { slug: "thai-legal", title: "มีลิขสิทธิ์ไทย", description: "อ่านถูกลิขสิทธิ์เป็นภาษาไทย", rule: inThai },
];
const FEATURED = { slug: "featured", title: "เรื่องเด่นประจำสัปดาห์", description: null };

const bySlug = new Map(LISTS.map((l) => [l.slug, l]));
for (const slug of Object.keys(manual)) if (!bySlug.get(slug)?.rule) throw new Error(`lists-manual.json: no rule list "${slug}"`);

const known = new Map(raw.map((t) => [t.anilistId, t]));
// best first: score, then popularity
const order = (a: Raw, b: Raw) => (b.score ?? 0) - (a.score ?? 0) || b.popularity - a.popularity;
const members = new Map<string, number[]>();
for (const l of LISTS) {
  if (!l.rule) continue;
  const { pin = [], exclude = [] } = manual[l.slug] ?? {};
  for (const id of [...pin, ...exclude]) if (!known.has(id)) throw new Error(`lists-manual.json ${l.slug}: unknown id ${id}`);
  const out = new Set(exclude);
  const picked = raw.filter(
    (t) => !out.has(t.anilistId) && (pin.includes(t.anilistId) || ((t.score ?? 0) >= MIN_SCORE && l.rule!(t))),
  );
  members.set(l.slug, picked.sort(order).map((t) => t.anilistId));
}

for (const l of LISTS) {
  const ids = members.get(l.slug);
  if (!ids) { console.log(`${l.slug.padEnd(12)} (filled weekly)`); continue; }
  const manga = ids.filter((id) => known.get(id)!.type === "manga").length;
  console.log(`${l.slug.padEnd(12)} ${String(ids.length).padStart(3)} (manga ${manga}, manhwa ${ids.length - manga}) | ${l.title}`);
}
if (DRY) process.exit(0);

const { sql, closeDb } = await import("./db.ts");
await sql.begin(async (tx) => {
  const rows = [
    ...LISTS.map((l, i) => ({ slug: l.slug, title: l.title, description: l.description, sort: i + 1, published: true })),
    { ...FEATURED, sort: 0, published: true },
  ];
  const ids = await tx<{ id: number; slug: string }[]>`insert into lists ${tx(rows)}
    on conflict (slug) do update set title = excluded.title, description = excluded.description,
      sort = excluded.sort, published = excluded.published
    returning id, slug`;
  const listId = new Map(ids.map((r) => [r.slug, r.id]));
  for (const [slug, titleIds] of members) {
    const id = listId.get(slug)!;
    await tx`delete from list_items where list_id = ${id}`;
    // titles not in the DB yet (import not run) would break the foreign key
    await tx`insert into list_items (list_id, anilist_id, position)
      select ${id}, t.anilist_id, n.position
      from unnest(${titleIds}::int[]) with ordinality as n(anilist_id, position)
      join titles t on t.anilist_id = n.anilist_id`;
  }
  // lists dropped from LISTS stay in the DB but leave the menu
  const keep = [...listId.keys()];
  await tx`update lists set published = false where slug <> all(${keep})`;
});
console.log("saved");
await closeDb();
