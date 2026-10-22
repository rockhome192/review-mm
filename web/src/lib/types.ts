export const MOOD_KEYS = ["action", "romance", "cry", "thrill", "comedy", "chill"] as const;
export type MoodKey = (typeof MOOD_KEYS)[number];
export type TitleType = "manga" | "manhwa";
export type LengthKey = "short" | "mid" | "long";

/** Row shapes as PostgREST returns them (see supabase/migrations). */
export type TitleRow = {
  anilist_id: number;
  slug: string;
  title: string;
  title_romaji: string | null;
  title_native: string | null;
  type: TitleType;
  status: string | null;
  chapters: number | null;
  volumes: number | null;
  start_year: number | null;
  score: number | null;
  popularity: number | null;
  genres: string[];
  cover_url: string | null;
  cover_color: string | null;
  anilist_url: string | null;
  blurbs: {
    hook: string;
    body: string;
    caveat: string | null;
    tags_th: string[];
    content_warnings: string[];
  };
  moods: { mood: MoodKey; score: number; reason: string }[];
  recommendations: {
    position: number;
    rec_title: string;
    rec_anilist_id: number | null;
    same: string | null;
    diff: string | null;
  }[];
  reading_links: {
    kind: "th_read" | "th_buy" | "en_official";
    site: string;
    url: string;
    is_affiliate: boolean;
    sort: number;
  }[];
  overrides: {
    chapters: number | null;
    status: string | null;
    premise: string | null;
    hidden: boolean;
  } | null;
};

/** One title with overrides applied, as pages use it. */
export type Title = {
  id: number;
  slug: string;
  href: string;
  title: string;
  titleRomaji: string | null;
  titleNative: string | null;
  type: TitleType;
  status: string | null;
  chapters: number | null;
  length: LengthKey | null;
  startYear: number | null;
  score: number | null;
  popularity: number;
  cover: string | null;
  coverColor: string;
  anilistUrl: string | null;
  hook: string;
  body: string;
  caveat: string | null;
  tags: string[];
  warnings: string[];
  moods: Record<MoodKey, { score: number; reason: string }>;
  recs: { title: string; id: number | null; same: string | null; diff: string | null }[];
  links: TitleRow["reading_links"];
};

/** The slice of a Title the home page ships to the browser. */
export type CardTitle = Pick<
  Title,
  "id" | "href" | "title" | "type" | "status" | "chapters" | "length" | "cover" | "coverColor" | "popularity"
> & { moodScores: Record<MoodKey, number> };

export type List = { slug: string; title: string; description: string | null; ids: number[] };
