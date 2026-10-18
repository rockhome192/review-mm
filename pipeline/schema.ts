// Shape of one generated recommendation. Shared by the Claude Code test run and
// the Batch API pipeline, so results from either are interchangeable.
import { z } from "zod";

export const MOOD_KEYS = ["action", "romance", "cry", "thrill", "comedy", "chill"] as const;
export const MOOD_LABELS: Record<(typeof MOOD_KEYS)[number], string> = {
  action: "มันส์ระเบิด",
  romance: "ฟินใจละลาย",
  cry: "ซึ้งกินใจ",
  thrill: "ลุ้นระทึก",
  comedy: "ฮาไม่ไหว",
  chill: "ชิลๆ",
};

export const WARNING_KEYS = ["violence", "gore", "sexual", "nudity", "suicide", "abuse"] as const;

const MoodScore = z.object({
  score: z.number().int().min(0).max(3),
  reason: z.string().min(1),
});

export const Recommendation = z.object({
  anilistId: z.number().int(),
  hook: z.string().min(10).max(140),
  body: z.string().min(20).max(320),
  caveat: z.string().max(160).nullable(),
  ifYouLike: z.array(z.string()).max(2),
  tagsTh: z.array(z.string()).min(2).max(4),
  moods: z.object(Object.fromEntries(MOOD_KEYS.map((k) => [k, MoodScore])) as {
    [K in (typeof MOOD_KEYS)[number]]: typeof MoodScore;
  }),
  contentWarnings: z.array(z.enum(WARNING_KEYS)),
  confidence: z.enum(["high", "medium", "low"]),
  usedOutsideKnowledge: z.boolean(),
});
export type Recommendation = z.infer<typeof Recommendation>;

/** Step B output (pipeline/mood-prompt.md). Replaces the writer's moods in all.json. */
export const MoodResult = z.object({
  anilistId: z.number().int(),
  moods: z.object(
    Object.fromEntries(
      MOOD_KEYS.map((k) => [k, MoodScore.extend({ evidence: z.string() })]),
    ) as { [K in (typeof MOOD_KEYS)[number]]: ReturnType<typeof MoodScore.extend<{ evidence: z.ZodString }>> },
  ),
  textCount: z.number().int(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type MoodResult = z.infer<typeof MoodResult>;

export const REVIEW_CRITERIA = [
  "premise", "opening", "body", "facts", "caveat", "moods", "copy", "spoiler", "thai", "voice",
] as const;

/** Reviewer verdict on one Recommendation. See pipeline/review-prompt.md. */
export const Review = z.object({
  anilistId: z.number().int(),
  verdict: z.enum(["pass", "revise"]),
  issues: z.array(
    z.object({
      criterion: z.enum(REVIEW_CRITERIA),
      severity: z.enum(["major", "minor"]),
      problem: z.string().min(1),
      fix: z.string().min(1),
    }),
  ),
});
export type Review = z.infer<typeof Review>;

/** Moods shown on the site: score >= 2, strongest first, at most 3. */
export function pickMoods(r: Recommendation) {
  return MOOD_KEYS.filter((k) => r.moods[k].score >= 2)
    .sort((a, b) => r.moods[b].score - r.moods[a].score)
    .slice(0, 3);
}
