// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Recommendation, MOOD_KEYS, findCitation, pickMoods } from "./schema.ts";

const moods = (scores: number[]) =>
  Object.fromEntries(MOOD_KEYS.map((k, i) => [k, { score: scores[i], reason: "เหตุผล" }])) as Recommendation["moods"];

const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  anilistId: 1,
  hook: "เด็กหนุ่มที่ตื่นมาพบว่าตัวเองเลเวลอัปได้คนเดียว",
  body: "เริ่มจากนักล่าที่อ่อนที่สุด แล้วค่อยๆ ไต่ขึ้นไปทีละขั้น จนคนรอบตัวตามไม่ทัน",
  caveat: null,
  ifYouLike: [],
  tagsTh: ["แอ็กชัน", "แฟนตาซี"],
  moods: moods([3, 0, 1, 2, 0, 0]),
  contentWarnings: ["violence"],
  confidence: "high",
  usedOutsideKnowledge: false,
  ...over,
});

test("a well-formed blurb passes the schema", () => {
  assert.equal(Recommendation.safeParse(rec()).success, true);
});

test("the schema rejects a hook over 140 characters and a mood score over 3", () => {
  assert.equal(Recommendation.safeParse(rec({ hook: "ก".repeat(141) })).success, false);
  assert.equal(Recommendation.safeParse(rec({ moods: moods([4, 0, 0, 0, 0, 0]) })).success, false);
});

test("findCitation catches blurbs that quote reviews or readers", () => {
  assert.equal(findCitation(rec({ body: "รีวิวบอกว่าตอนจบดีมาก" })), "รีวิว");
  assert.equal(findCitation(rec({ hook: "คนอ่านบอกว่าเลิกอ่านไม่ได้" })), "คนอ่านบอก");
  assert.equal(findCitation(rec({ body: "เรื่องที่หลายคนอ่านแล้วร้องไห้" })), "หลายคนอ่าน");
});

test("findCitation allows what the story does to a reader, and opinions in the caveat", () => {
  assert.equal(findCitation(rec({ body: "ฉากลาจากที่ทำเอาคนอ่านน้ำตาซึมไปทั้งเล่ม" })), null);
  assert.equal(findCitation(rec({ caveat: "บางคนว่าช่วงกลางเรื่องยืดไปหน่อย" })), null);
  assert.equal(findCitation(rec({ caveat: "รีวิวส่วนใหญ่ว่าช่วงกลางยืด" })), "รีวิว");
});

test("pickMoods shows scores of 2 and up, strongest first, at most 3", () => {
  assert.deepEqual(pickMoods(rec({ moods: moods([2, 3, 0, 2, 1, 2]) })), ["romance", "action", "thrill"]);
  assert.deepEqual(pickMoods(rec({ moods: moods([1, 1, 0, 0, 1, 0]) })), []);
});
