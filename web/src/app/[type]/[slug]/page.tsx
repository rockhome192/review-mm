import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { getCatalog, getTitle } from "@/lib/data";
import {
  LINK_KIND_LABELS,
  MOOD_COLORS,
  MOOD_LABELS,
  MOOD_LEVELS,
  STATUS_LABELS,
  TYPE_LABELS,
  TYPE_ORIGIN,
  WARNING_LABELS,
  metaLine,
} from "@/lib/labels";
import { MOOD_KEYS, type Title } from "@/lib/types";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getCatalog()).map((t) => ({ type: t.type, slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[type]/[slug]">): Promise<Metadata> {
  const { type, slug } = await params;
  const t = await getTitle(type, slug);
  if (!t) return {};
  return {
    title: `${t.title} — ${TYPE_LABELS[t.type]}แนะนำ`,
    description: t.hook,
    openGraph: { title: t.title, description: t.hook, images: t.cover ? [t.cover] : [] },
  };
}

/** Moods shown in the hero: clearly mentioned, strongest first, at most 3. */
const heroMoods = (t: Title) =>
  MOOD_KEYS.filter((k) => t.moods[k].score >= 2)
    .sort((a, b) => t.moods[b].score - t.moods[a].score)
    .slice(0, 3);

export default async function TitlePage({ params }: PageProps<"/[type]/[slug]">) {
  const { type, slug } = await params;
  const t = await getTitle(type, slug);
  if (!t) notFound();

  const catalog = await getCatalog();
  const byId = new Map(catalog.map((x) => [x.id, x]));
  const shown = MOOD_KEYS.filter((k) => t.moods[k].score > 0).sort((a, b) => t.moods[b].score - t.moods[a].score);
  const quiet = MOOD_KEYS.filter((k) => t.moods[k].score === 0);
  const hero = heroMoods(t);
  const thai = t.links.filter((l) => l.kind !== "en_official");
  const english = t.links.filter((l) => l.kind === "en_official");
  const altTitles = [t.titleNative, t.titleRomaji !== t.title ? t.titleRomaji : null].filter(Boolean).join(" · ");

  const info = [
    { k: "ประเภท", v: `${TYPE_LABELS[t.type]} (${TYPE_ORIGIN[t.type]})` },
    { k: "สถานะ", v: t.status ? (STATUS_LABELS[t.status] ?? t.status) : "ไม่ทราบ" },
    { k: "จำนวนตอน", v: t.chapters ? `${t.chapters} ตอน` : "ยังไม่มีตัวเลขแน่นอน" },
    ...(t.startYear ? [{ k: "เริ่มลง", v: String(t.startYear) }] : []),
    { k: "คำเตือน", v: t.warnings.length ? t.warnings.map((w) => WARNING_LABELS[w] ?? w).join(", ") : "ไม่มี" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-10 px-4 pt-5 pb-16 sm:px-7">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-10">
        <nav aria-label="breadcrumb" className="flex flex-wrap gap-2 text-[13px] text-soft">
          <Link href="/" className="underline">
            หน้าแรก
          </Link>
          <span aria-hidden>›</span>
          <Link href={`/?type=${t.type}`} className="underline">
            {TYPE_LABELS[t.type]}
          </Link>
          <span aria-hidden>›</span>
          <span className="text-ink">{t.title}</span>
        </nav>

        <section className="-mt-4 flex flex-wrap items-start gap-8 border-b border-line pb-9">
          <Cover src={t.cover} color={t.coverColor} title={t.title} eager className="w-[190px] flex-none" />
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
            <div className="flex flex-wrap gap-1.5 text-[13px]">
              <span className="rounded-full bg-ink px-[11px] py-0.5 font-semibold whitespace-nowrap text-paper">
                {TYPE_LABELS[t.type]}
              </span>
              {[t.status && STATUS_LABELS[t.status], t.startYear && `เริ่มปี ${t.startYear}`, ...t.tags]
                .filter(Boolean)
                .map((chip) => (
                  <span key={String(chip)} className="rounded-full border border-ink px-[11px] py-0.5 whitespace-nowrap">
                    {chip}
                  </span>
                ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="font-serif text-[clamp(30px,3.6vw,42px)] leading-[1.12] font-extrabold tracking-tight text-balance">
                {t.title}
              </h1>
              {altTitles && <div className="text-[15px] text-soft">{altTitles}</div>}
            </div>
            <p className="font-serif text-[19px] leading-relaxed font-semibold text-pretty">{t.hook}</p>
            {hero.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-soft">อ่านแล้วรู้สึก</span>
                {hero.map((k) => (
                  <span
                    key={k}
                    className="rounded-full px-3 py-[3px] font-semibold whitespace-nowrap text-paper"
                    style={{ background: MOOD_COLORS[k] }}
                  >
                    {MOOD_LABELS[k]}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              {hero.length > 0 && (
                <Link
                  href={`/?moods=${hero.join(",")}&random=1&from=${t.id}`}
                  className="rounded-lg border-[1.5px] border-ink bg-ink px-[18px] py-2.5 text-[15px] font-semibold text-paper hover:border-accent-ink hover:bg-accent-ink hover:text-white"
                >
                  สุ่มเรื่องที่อารมณ์คล้ายกัน ✦
                </Link>
              )}
              <CopyLinkButton />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl font-extrabold">ทำไมน่าอ่าน</h2>
          <p className="max-w-[64ch] text-base leading-[1.8] text-pretty">{t.body}</p>
          {t.caveat && (
            <div className="flex max-w-[64ch] flex-col gap-1 rounded-[10px] border-[1.5px] border-dashed border-ink px-[18px] py-3.5">
              <div className="text-sm font-semibold">ก่อนเริ่มอ่าน</div>
              <div className="text-sm leading-relaxed text-soft">{t.caveat}</div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-2xl font-extrabold">อารมณ์ตอนอ่าน</h2>
            <span className="text-[13px] text-soft">สรุปจากรีวิวและความเห็นของคนอ่าน</span>
          </div>
          <ul className="flex flex-col border-t-[1.5px] border-ink">
            {shown.map((k) => {
              const { score, reason } = t.moods[k];
              return (
                <li
                  key={k}
                  className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-line py-3.5 sm:grid-cols-[110px_150px_minmax(0,1fr)]"
                >
                  <div className="text-[15px] font-semibold">{MOOD_LABELS[k]}</div>
                  <div className="flex flex-col gap-[5px]" aria-label={`${MOOD_LEVELS[score]} (${score} จาก 3)`}>
                    <div className="flex gap-1" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-2.5 flex-1 rounded-[2px]"
                          style={{ background: i < score ? MOOD_COLORS[k] : "var(--color-off)" }}
                        />
                      ))}
                    </div>
                    <div className="text-xs text-soft">{MOOD_LEVELS[score]}</div>
                  </div>
                  <div className="col-span-2 text-sm leading-normal text-pretty text-[#2e2a24] sm:col-span-1">{reason}</div>
                </li>
              );
            })}
          </ul>
          {quiet.length > 0 && (
            <div className="text-[13px] text-soft">ไม่ค่อยมีคนพูดถึง: {quiet.map((k) => MOOD_LABELS[k]).join(", ")}</div>
          )}
        </section>

        {t.recs.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-2xl font-extrabold">ถ้าชอบเรื่องนี้ ลองอ่าน</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
              {t.recs.map((r) => {
                const other = r.id ? byId.get(r.id) : undefined;
                const card = (
                  <>
                    {other ? (
                      <div
                        className="relative aspect-[3/2] overflow-hidden rounded"
                        style={{ background: other.coverColor }}
                      >
                        {other.cover && (
                          // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer
                          <img src={other.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
                        )}
                      </div>
                    ) : (
                      // not in our catalog yet: a plain title block, like the design's color cards
                      <div className="flex aspect-[3/2] items-end rounded bg-panel p-2.5 font-serif text-[17px] leading-tight font-extrabold">
                        {r.title}
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <div className="text-base font-semibold">{r.title}</div>
                      {other && <div className="text-xs text-soft">{metaLine(other)}</div>}
                    </div>
                    {r.same && (
                      <div className="text-[13px] leading-normal">
                        <span className="font-semibold text-accent-ink">เหมือนกันตรง:</span> {r.same}
                      </div>
                    )}
                    {r.diff && <div className="text-[13px] leading-normal text-soft">ต่างตรง: {r.diff}</div>}
                  </>
                );
                return (
                  <li key={r.title}>
                    {other ? (
                      <Link
                        href={other.href}
                        className="flex h-full flex-col gap-2.5 rounded-[10px] border-[1.5px] border-ink p-3 hover:bg-panel hover:text-ink"
                      >
                        {card}
                      </Link>
                    ) : (
                      <div className="flex h-full flex-col gap-2.5 rounded-[10px] border-[1.5px] border-ink p-3">
                        {card}
                        <div className="mt-auto text-xs text-soft">ยังไม่มีรีวิวในเว็บ</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <aside className="flex min-w-[260px] flex-[1_1_300px] lg:flex-[0_1_300px] flex-col gap-4 lg:sticky lg:top-[88px] lg:mt-9">
        {t.links.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[10px] bg-ink p-[18px] text-paper">
            <h2 className="font-serif text-[19px] font-extrabold">อ่านแบบถูกลิขสิทธิ์</h2>
            {[
              { label: thai.length ? LINK_KIND_LABELS.th_read : null, links: thai },
              { label: LINK_KIND_LABELS.en_official, links: english },
            ]
              .filter((g) => g.links.length)
              .map((g) => (
                <div key={g.label} className="flex flex-col gap-2">
                  <div className="text-xs text-[#bfb7a9]">{g.label}</div>
                  {g.links.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel={l.is_affiliate ? "sponsored noopener" : "noopener"}
                      className="flex items-center justify-between gap-2 rounded-lg border-[1.5px] border-[#8a8276] px-3 py-2.5 text-sm hover:border-paper hover:text-paper"
                    >
                      <span>{l.site}</span>
                      <span aria-hidden>↗</span>
                    </a>
                  ))}
                </div>
              ))}
            {t.links.some((l) => l.is_affiliate) && (
              <div className="text-xs text-[#bfb7a9]">บางลิงก์เป็น affiliate เราได้ค่าคอมมิชชันเล็กน้อยโดยราคาไม่เปลี่ยน</div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-0.5 rounded-[10px] border-[1.5px] border-ink bg-panel p-[18px]">
          <h2 className="mb-2 font-serif text-[19px] font-extrabold">ข้อมูลเรื่อง</h2>
          <dl>
            {info.map((i) => (
              <div key={i.k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2.5 border-b border-[#d3cab8] py-[7px] text-sm">
                <dt className="text-soft">{i.k}</dt>
                <dd>{i.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
