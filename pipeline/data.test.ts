// Checks the generated content in the repo, the same rules validate.ts warns about,
// so a bad merge or hand edit fails CI before it is imported. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Recommendation, MoodResult, BANNED_PHRASES, findCitation } from "./schema.ts";

const all: unknown[] = JSON.parse(fs.readFileSync("data/generated/all.json", "utf8"));

test("every blurb in all.json passes the schema, once per title", () => {
  const ids = new Set<number>();
  for (const item of all) {
    const r = Recommendation.parse(item);
    assert.ok(!ids.has(r.anilistId), `${r.anilistId} appears twice`);
    ids.add(r.anilistId);
  }
});

test("no blurb uses a banned phrase or cites reviews", () => {
  const bad = (all as Recommendation[]).flatMap((r) => {
    const text = `${r.hook} ${r.body} ${r.caveat ?? ""}`;
    const found = [...BANNED_PHRASES.filter((b) => text.includes(b)), findCitation(r)].filter(Boolean);
    return found.length ? [`${r.anilistId}: ${found.join(", ")}`] : [];
  });
  assert.deepEqual(bad, []);
});

test("every mood file parses", () => {
  for (const f of fs.readdirSync("data/moods").filter((f) => /^moods-.*\.json$/.test(f)))
    for (const item of JSON.parse(fs.readFileSync(`data/moods/${f}`, "utf8")))
      assert.ok(MoodResult.safeParse(item).success, `${f} ${item.anilistId}`);
});
