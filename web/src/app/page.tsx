import type { Metadata } from "next";
import { getCatalog, getLists, toCard } from "@/lib/data";
import { HomeClient, type Featured } from "./HomeClient";

// filter views (?type, ?moods, ?list) are the same page to a search engine
export const metadata: Metadata = { alternates: { canonical: "/" } };

const FEATURED_SLUG = "featured";
// Without a "featured" list, each week shows PER_TYPE titles of each type, drawn
// from the POOL best-scored of that type. The deploy workflow rebuilds every Monday.
const PER_TYPE = 2;
const POOL = 30;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const BANGKOK_MS = 7 * 3600 * 1000;
const MONDAY_EPOCH = Date.UTC(1970, 0, 5);

/** Same shuffle for the same seed (mulberry32 + Fisher–Yates). */
function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** This week's picks: no title repeats until the whole pool has come up, then a new order. */
function weeklyPicks<T extends { id: number; type: string; score: number | null }>(catalog: T[]): T[] {
  const week = Math.floor((Date.now() + BANGKOK_MS - MONDAY_EPOCH) / WEEK_MS);
  const weeksPerCycle = POOL / PER_TYPE;
  const cycle = Math.floor(week / weeksPerCycle);
  const start = (week % weeksPerCycle) * PER_TYPE;
  return ["manga", "manhwa"].flatMap((type) => {
    const pool = catalog
      .filter((t) => t.type === type)
      // id breaks score ties, so the pool doesn't shift when popularity order does
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id - b.id)
      .slice(0, POOL);
    return shuffled(pool, cycle).slice(start, start + PER_TYPE);
  });
}

export default async function Home() {
  const [catalog, lists] = await Promise.all([getCatalog(), getLists()]);
  const byId = new Map(catalog.map((t) => [t.id, t]));

  // "เรื่องเด่นประจำสัปดาห์" is the list with slug "featured"; until one is
  // published, rotate through well-scored titles week by week.
  const featuredList = lists.find((l) => l.slug === FEATURED_SLUG);
  const featuredTitles = featuredList
    ? featuredList.ids.flatMap((id) => byId.get(id) ?? [])
    : weeklyPicks(catalog);
  const featured: Featured[] = featuredTitles.map((t) => ({
    href: t.href,
    title: t.title,
    type: t.type,
    cover: t.cover,
    coverColor: t.coverColor,
    hook: t.hook,
    tags: t.tags,
  }));

  return (
    <HomeClient
      titles={catalog.map(toCard)}
      featured={featured}
      lists={lists
        .filter((l) => l.slug !== FEATURED_SLUG)
        .map((l) => ({ ...l, ids: l.ids.filter((id) => byId.has(id)) }))
        .filter((l) => l.ids.length)}
    />
  );
}
