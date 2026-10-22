import type { Metadata } from "next";
import { getCatalog, getLists, toCard } from "@/lib/data";
import { HomeClient, type Featured } from "./HomeClient";

// filter views (?type, ?moods, ?list) are the same page to a search engine
export const metadata: Metadata = { alternates: { canonical: "/" } };

const FEATURED_SLUG = "featured";
const FEATURED_FALLBACK = 4;

export default async function Home() {
  const [catalog, lists] = await Promise.all([getCatalog(), getLists()]);
  const byId = new Map(catalog.map((t) => [t.id, t]));

  // "เรื่องเด่นประจำสัปดาห์" is the list with slug "featured"; until one is
  // published, show the best-scored titles.
  const featuredList = lists.find((l) => l.slug === FEATURED_SLUG);
  const featuredTitles = featuredList
    ? featuredList.ids.flatMap((id) => byId.get(id) ?? [])
    : [...catalog].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, FEATURED_FALLBACK);
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
