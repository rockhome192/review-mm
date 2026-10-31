// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { jaccard, cosine, indegree, score, type Cand, type Picks } from "./rec-scoring.ts";

const cand = (id: number, base = 10): Cand => ({ id, votes: 0, sim: 0, base });

test("jaccard and cosine", () => {
  assert.equal(jaccard(new Set(["a", "b"]), new Set(["b", "c"])), 1 / 3);
  assert.equal(jaccard(new Set(), new Set()), 0);
  assert.equal(cosine([1, 0], [2, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0); // no mood scores: no similarity, not NaN
});

test("indegree counts incoming cards and can leave one title out", () => {
  const picks: Picks = new Map([[1, [3]], [2, [3, 4]]]);
  assert.deepEqual([...indegree(picks)], [[3, 2], [4, 1]]);
  assert.deepEqual([...indegree(picks, 2)], [[3, 1]]);
});

test("a title nobody recommends yet gets a bonus", () => {
  assert.equal(score(1, cand(2), new Map(), new Map()), 11);
});

test("a card pointing back costs 5 when we are its only way out, 0.5 when it has another", () => {
  const deg = new Map([[2, 1]]);
  assert.equal(score(1, cand(2), new Map([[2, [1]]]), deg), 5);
  assert.equal(score(1, cand(2), new Map([[2, [1, 3]], [3, []]]), deg), 9.5);
});

test("a title with more than 3 incoming cards loses 0.4 per extra card", () => {
  assert.equal(score(1, cand(2), new Map(), new Map([[2, 5]])), 10 - 0.8);
});
