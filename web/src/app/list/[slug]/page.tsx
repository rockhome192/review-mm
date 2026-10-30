import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { getListPages } from "@/lib/data";
import { MOOD_COLORS, MOOD_LABELS, metaLine } from "@/lib/labels";
import { listHref } from "@/lib/lists";
import { SITE_NAME, SITE_URL, largeCover } from "@/lib/site";
import type { Title } from "@/lib/types";

export const dynamicParams = false;

async function getListPage(slug: string) {
  const all = await getListPages();
  const list = all.find((l) => l.slug === slug);
  return list ? { list, others: all.filter((l) => l.slug !== slug) } : null;
}

export async function generateStaticParams() {
  return (await getListPages()).map((l) => ({ slug: l.slug }));
}

const pageTitle = (l: { title: string; titles: Title[] }) => `${l.title}: มังงะ มังฮวาแนะนำ ${l.titles.length} เรื่อง`;

export async function generateMetadata({ params }: PageProps<"/list/[slug]">): Promise<Metadata> {
  const found = await getListPage((await params).slug);
  if (!found) return {};
  const { list } = found;
  const href = listHref(list.slug);
  const cover = list.titles.find((t) => t.cover)?.cover;
  return {
    title: pageTitle(list),
    description: list.intro,
    alternates: { canonical: href },
    // the top title's cover, so a shared link shows a picture
    openGraph: { title: list.title, description: list.intro, url: href, images: cover ? [largeCover(cover)] : [] },
  };
}

/** schema.org: the list as an ItemList of our title pages, and the breadcrumb trail. */
function jsonLd(l: { slug: string; title: string; intro: string; titles: Title[] }) {
  const base = SITE_URL ?? "";
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: l.title,
    description: l.intro,
    url: `${base}${listHref(l.slug)}`,
    numberOfItems: l.titles.length,
    itemListElement: l.titles.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}${t.href}`, name: t.title })),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${base}/` },
      { "@type": "ListItem", position: 2, name: l.title },
    ],
  };
  // "<" escaped so a title can never close the script tag
  return JSON.stringify([list, crumbs]).replace(/</g, "\\u003c");
}

export default async function ListPage({ params }: PageProps<"/list/[slug]">) {
  const found = await getListPage((await params).slug);
  if (!found) notFound();
  const { list, others } = found;

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-9 px-4 pt-5 pb-16 sm:px-7">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(list) }} />
      <nav aria-label="breadcrumb" className="flex flex-wrap gap-2 text-[13px] text-soft">
        <Link href="/" className="underline">
          หน้าแรก
        </Link>
        <span aria-hidden>›</span>
        <span className="text-ink">{list.title}</span>
      </nav>

      <header className="-mt-4 flex flex-col gap-3 border-b border-line pb-8">
        <div className="text-[13px] text-soft">ลิสต์คัดสรร · {list.titles.length} เรื่อง</div>
        <h1 className="font-serif text-[clamp(30px,3.6vw,42px)] leading-[1.12] font-extrabold tracking-tight text-balance">
          {list.title}
        </h1>
        <p className="max-w-[64ch] text-base leading-[1.8] text-pretty">{list.intro}</p>
      </header>

      <ol className="flex flex-col">
        {list.titles.map((t, i) => {
          const reason = list.mood && t.moods[list.mood].score > 0 ? t.moods[list.mood].reason : null;
          return (
            <li key={t.id} className="border-b border-line py-6 first:pt-0">
              <Link href={t.href} className="group flex items-start gap-5 hover:text-ink">
                <Cover
                  src={t.cover}
                  color={t.coverColor}
                  title={t.title}
                  eager={i < 3}
                  className="w-[92px] flex-none sm:w-[112px]"
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-serif text-[21px] leading-snug font-extrabold group-hover:underline">
                      <span className="mr-2 text-soft">{i + 1}.</span>
                      {t.title}
                    </h2>
                    <div className="text-xs text-soft">{metaLine(t)}</div>
                  </div>
                  <p className="text-[15px] leading-relaxed text-pretty">{t.hook}</p>
                  {reason && list.mood && (
                    <p className="text-sm leading-normal text-pretty text-[#2e2a24]">
                      <span className="font-semibold" style={{ color: MOOD_COLORS[list.mood] }}>
                        {MOOD_LABELS[list.mood]}:
                      </span>{" "}
                      {reason}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      {others.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl font-extrabold">ลิสต์อื่นที่น่าอ่าน</h2>
          <ul className="flex flex-wrap gap-2.5">
            {others.map((l) => (
              <li key={l.slug}>
                <Link
                  href={listHref(l.slug)}
                  className="block rounded-full border-[1.5px] border-ink px-4 py-1.5 text-[15px] hover:bg-ink hover:text-paper"
                >
                  {l.title} <span className="text-soft">· {l.titles.length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
