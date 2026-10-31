// The scoring rules behind pick-recs.ts, kept free of file reads so they can be tested
// (rec-scoring.test.ts).

/** Shared items over all items, 0–1. Two empty sets score 0. */
export const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
};

/** Cosine of two equal-length vectors, 0 when either is all zeros. */
export const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? dot / n : 0;
};

export type Cand = { id: number; votes: number; sim: number; base: number };
/** Title id → the ids its cards point to. */
export type Picks = Map<number, number[]>;

/** How many cards point at each title, leaving out the cards of `skip`. */
export function indegree(picks: Picks, skip?: number) {
  const d = new Map<number, number>();
  for (const [a, s] of picks) if (a !== skip) for (const id of s) d.set(id, (d.get(id) ?? 0) + 1);
  return d;
}

/** Score of candidate `c` for a card on title `a`, given everyone else's current picks. */
export function score(a: number, c: Cand, picks: Picks, deg: Map<number, number>) {
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
