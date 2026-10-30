import type { MetadataRoute } from "next";
import { getCatalog, getListPages } from "@/lib/data";
import { listHref } from "@/lib/lists";
import { SITE_URL, largeCover } from "@/lib/site";

// Home, one page per curated list and one per title. Filter views (?type, ?moods, ?list)
// are left out: they all canonicalize to the home page.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_URL) return [];
  const [catalog, lists] = await Promise.all([getCatalog(), getListPages()]);
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...lists.map((l) => ({ url: `${SITE_URL}${listHref(l.slug)}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...catalog.map((t) => ({
      url: `${SITE_URL}${t.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      ...(t.cover ? { images: [largeCover(t.cover)] } : {}),
    })),
  ];
}
