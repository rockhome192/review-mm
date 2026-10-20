// Pick up to 3 "ถ้าชอบเรื่องนี้" cards per title. Candidates are AniList's
// "readers also liked" (data/raw/anilist-recs.json, from fetch-recs.ts), limited
// to titles on our site so every card opens a page.
// Score = reader votes (log) + how alike the two titles are (tags, genres, moods),
// then link-shape fixes: a card that points straight back costs points, titles
// nobody recommends yet get a bonus, over-used titles get a small penalty.
// Writes data/generated/recs.json; db-import uses it instead of ifYouLike.
//
// Usage: npx tsx pipeline/pick-recs.ts [--dry]
import fs from "node:fs";
import { MOOD_KEYS } from "./schema.ts";

const N = 3;
const MIN_VOTES = 3; // 1–2 votes is one person's opinion
const SIM_WEIGHT = 3; // similarity is 0–1; votes run ~1.6 (3 votes) to ~8 (250)
const MIN_SIM = 0.1; // below this the two titles share almost nothing (e.g. a parody)
const OUT = "data/generated/recs.json";

const raw: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const gen: any[] = JSON.parse(fs.readFileSync("data/generated/all.json", "utf8"));
const fetched: any[] = JSON.parse(fs.readFileSync("data/raw/anilist-recs.json", "utf8"));

const byId = new Map(raw.map((t) => [t.anilistId, t]));
// pairs the card writer marked as a weak fit (rec-prompt.md); never offered again
const EXCLUDE = "data/generated/recs-exclude.json";
const excluded = new Set<string>(
  fs.existsSync(EXCLUDE)
    ? JSON.parse(fs.readFileSync(EXCLUDE, "utf8")).map((p: any) => `${p.anilistId}:${p.recAnilistId}`)
    : [],
);
const moodsOf = new Map(gen.map((g) => [g.anilistId, MOOD_KEYS.map((k) => g.moods[k].score as number)]));

const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
};
const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? dot / n : 0;
};
const tagSet = (t: any) => new Set<string>(t.tags.filter((x: any) => x.rank >= 60).map((x: any) => x.name));

/** 0–1: tags 40%, genres 30%, mood profile 30% */
function similarity(a: number, b: number) {
  const [ta, tb] = [byId.get(a), byId.get(b)];
  return 0.4 * jaccard(tagSet(ta), tagSet(tb)) +
    0.3 * jaccard(new Set(ta.genres), new Set(tb.genres)) +
    0.3 * cosine(moodsOf.get(a)!, moodsOf.get(b)!);
}

type Cand = { id: number; votes: number; sim: number; base: number };
const cands = new Map<number, Cand[]>();
for (const f of fetched) {
  cands.set(f.anilistId, f.recs
    .filter((r: any) => byId.has(r.anilistId) && r.anilistId !== f.anilistId &&
      !excluded.has(`${f.anilistId}:${r.anilistId}`) &&
      r.format !== "NOVEL" && !r.isAdult && r.votes >= MIN_VOTES)
    .map((r: any) => {
      const sim = similarity(f.anilistId, r.anilistId);
      return { id: r.anilistId, votes: r.votes, sim, base: Math.log2(r.votes) + SIM_WEIGHT * sim };
    })
    .filter((c: Cand) => c.sim >= MIN_SIM));
}

type Picks = Map<number, number[]>;

function indegree(picks: Picks, skip?: number) {
  const d = new Map<number, number>();
  for (const [a, s] of picks) if (a !== skip) for (const id of s) d.set(id, (d.get(id) ?? 0) + 1);
  return d;
}

function score(a: number, c: Cand, picks: Picks, deg: Map<number, number>) {
  let s = c.base;
  // it points back at us: fine while its page has another way out, but if we are
  // its only card, its readers just bounce between the two pages
  const theirs = picks.get(c.id) ?? [];
  if (theirs.includes(a)) {
    const exit = theirs.some((o) => o !== a && !picks.get(o)?.includes(c.id));
    s -= exit ? 0.5 : 5;
  }
  const d = deg.get(c.id) ?? 0;
  if (d === 0) s += 1;
  s -= 0.4 * Math.max(0, d - 3);
  return s;
}

const top = (c: Cand[], f: (x: Cand) => number) =>
  [...c].sort((x, y) => f(y) - f(x)).slice(0, N).map((x) => x.id);

// start from the best base scores, then re-pick one title at a time until nothing changes
const picks: Picks = new Map([...cands].map(([a, c]) => [a, top(c, (x) => x.base)]));
let pass = 0;
for (let changed = true; changed && pass < 20; pass++) {
  changed = false;
  for (const [a, c] of cands) {
    const deg = indegree(picks, a);
    const next = top(c, (x) => score(a, x, picks, deg));
    if (next.join() !== picks.get(a)!.join()) { picks.set(a, next); changed = true; }
  }
}

// --refill: keep the published cards (their same/diff text is written) and only
// fill the slots of excluded cards with the best remaining candidates
if (process.argv.includes("--refill")) {
  const byTitle = new Map(raw.map((t) => [t.title, t.anilistId]));
  const old: any[] = JSON.parse(fs.readFileSync(OUT, "utf8"));
  for (const r of old) picks.set(r.anilistId,
    r.recs.map((n: string) => byTitle.get(n)!).filter((id: number) => !excluded.has(`${r.anilistId}:${id}`)));
  for (const [a, c] of cands) {
    const kept = picks.get(a) ?? [];
    if (kept.length >= N) continue;
    const deg = indegree(picks, a);
    const extra = top(c.filter((x) => !kept.includes(x.id)), (x) => score(a, x, picks, deg)).slice(0, N - kept.length);
    picks.set(a, [...kept, ...extra]);
  }
}

const cand = (a: number, id: number) => cands.get(a)!.find((c) => c.id === id)!;

function stats(label: string, p: Picks) {
  let cards = 0, recip = 0, allBack = 0, votes = 0, sim = 0, scored = 0;
  const perTitle = [0, 0, 0, 0];
  const deg = indegree(p);
  for (const [a, s] of p) {
    cards += s.length;
    perTitle[s.length]++;
    const back = s.filter((b) => p.get(b)?.includes(a));
    recip += back.length;
    if (s.length && back.length === s.length) allBack++;
    for (const b of s) {
      const c = cands.get(a)?.find((x) => x.id === b);
      if (c) { votes += c.votes; sim += c.sim; scored++; }
    }
  }
  const most = [...deg].sort((x, y) => y[1] - x[1]).slice(0, 5)
    .map(([id, c]) => `${byId.get(id).title} ${c}`).join(" | ");
  console.log(`${label}: cards ${cards}, titles with 3/2/1/0 cards ${perTitle.slice().reverse().join("/")}, ` +
    `mutual pairs ${recip / 2}, titles whose cards all point back ${allBack}, ` +
    `titles recommended somewhere ${deg.size}/${raw.length}` +
    (scored ? `, avg votes ${(votes / scored).toFixed(0)}, avg similarity ${(sim / scored).toFixed(2)}` : "") +
    `\n  most used: ${most}`);
}

// the writer's old cards, kept to on-site titles so the numbers compare
const byName = new Map<string, number>();
for (const t of raw) for (const n of [t.title, t.titleRomaji]) if (n) byName.set(n.toLowerCase(), t.anilistId);
stats("before (ifYouLike, on-site only)", new Map(gen.map((g) => [g.anilistId,
  g.ifYouLike.map((n: string) => byName.get(n.toLowerCase())).filter(Boolean)])));
stats(`picked (${pass} passes)`, picks);

// the weakest fits, to eyeball
const weak = [...picks].flatMap(([a, s]) => s.map((b) => ({ a, b, ...cand(a, b) })))
  .sort((x, y) => x.sim - y.sim).slice(0, 8);
console.log("lowest similarity:\n" + weak.map((w) =>
  `  ${byId.get(w.a).title} → ${byId.get(w.b).title} (votes ${w.votes}, sim ${w.sim.toFixed(2)})`).join("\n"));

if (!process.argv.includes("--dry")) {
  fs.writeFileSync(OUT, JSON.stringify([...picks].map(([anilistId, s]) =>
    ({ anilistId, recs: s.map((id) => byId.get(id).title) })), null, 2) + "\n");
  console.log(`wrote ${OUT}`);
}
