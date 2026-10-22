import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/data";
import { SITE_URL, largeCover } from "@/lib/site";

// Home and one page per title. Filter views (?type, ?moods, ?list) are left out:
// they all canonicalize to the home page.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_URL) return [];
  const catalog = await getCatalog();
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...catalog.map((t) => ({
      url: `${SITE_URL}${t.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      ...(t.cover ? { images: [largeCover(t.cover)] } : {}),
    })),
  ];
}
