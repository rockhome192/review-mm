"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Cover } from "@/components/Cover";
import { LENGTH_LABELS, MOOD_LABELS, TYPE_LABELS, metaLine } from "@/lib/labels";
import { MOOD_KEYS, type CardTitle, type LengthKey, type List, type MoodKey, type TitleType } from "@/lib/types";

export type Featured = {
  href: string;
  title: string;
  type: TitleType;
  cover: string | null;
  coverColor: string;
  hook: string;
  tags: string[];
};

type Filters = { type: TitleType | "all"; moods: MoodKey[]; length: LengthKey | "any" };
const NO_FILTERS: Filters = { type: "all", moods: [], length: "any" };
/** A title "has" a mood when readers clearly mention it. */
const MOOD_MIN = 2;

function match(titles: CardTitle[], f: Filters) {
  return titles
    .filter(
      (t) =>
        (f.type === "all" || t.type === f.type) &&
        (f.length === "any" || t.length === f.length) &&
        (!f.moods.length || f.moods.some((m) => t.moodScores[m] >= MOOD_MIN)),
    )
    .map((t) => ({ t, fit: f.moods.reduce((s, m) => s + (t.moodScores[m] >= MOOD_MIN ? t.moodScores[m] : 0), 0) }))
    .sort((a, b) => b.fit - a.fit || b.t.popularity - a.t.popularity)
    .map((x) => x.t);
}

/** ?type=&moods=&length= mirror the filters, so the URL is shareable and survives refresh. */
function toQuery(f: Filters) {
  const q = new URLSearchParams();
  if (f.type !== "all") q.set("type", f.type);
  if (f.moods.length) q.set("moods", f.moods.join(","));
  if (f.length !== "any") q.set("length", f.length);
  return q.toString();
}

function fromQuery(params: URLSearchParams): Filters {
  const type = params.get("type");
  const length = params.get("length");
  return {
    type: type === "manga" || type === "manhwa" ? type : "all",
    moods: (params.get("moods") ?? "").split(",").filter((m): m is MoodKey => MOOD_KEYS.includes(m as MoodKey)),
    length: length === "short" || length === "mid" || length === "long" ? length : "any",
  };
}

/**
 * Applies URL changes that came from outside the filter panel: header nav,
 * the logo (empty query = reset), back/forward, and "สุ่มเรื่องที่อารมณ์คล้ายกัน"
 * (?random=1) on detail pages. URLs this page wrote itself are skipped.
 */
function ParamSync({ writtenRef, onChange }: { writtenRef: React.RefObject<string>; onChange: (f: Filters, random: boolean) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    const query = params.toString();
    if (query === writtenRef.current) return;
    writtenRef.current = query;
    onChange(fromQuery(params), params.get("random") === "1");
  }, [params, writtenRef, onChange]);
  return null;
}

export function HomeClient({ titles, featured, lists }: { titles: CardTitle[]; featured: Featured[]; lists: List[] }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [picked, setPicked] = useState<number | null>(null);
  const [listSlug, setListSlug] = useState<string | null>(null);
  const [feat, setFeat] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);
  const writtenRef = useRef("");

  // Keep the URL in step with the panel (replace, not push: filter clicks aren't history).
  useEffect(() => {
    const query = toQuery(filters);
    if (query === writtenRef.current) return;
    writtenRef.current = query;
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
  }, [filters]);

  const pool = useMemo(() => match(titles, filters), [titles, filters]);
  const list = lists.find((l) => l.slug === listSlug);
  const byId = useMemo(() => new Map(titles.map((t) => [t.id, t])), [titles]);
  let results = list ? list.ids.flatMap((id) => byId.get(id) ?? []) : pool;
  if (picked) results = [...results.filter((t) => t.id === picked), ...results.filter((t) => t.id !== picked)];

  const hasFilters = filters.type !== "all" || filters.moods.length > 0 || filters.length !== "any";
  const scrollToResults = () =>
    requestAnimationFrame(() => {
      const el = resultsRef.current;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
    });
  const update = (p: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPicked(null);
    setListSlug(null);
  };
  const pickRandom = (from: CardTitle[]) => {
    if (!from.length) return;
    let p = from[Math.floor(Math.random() * from.length)];
    if (from.length > 1 && p.id === picked) p = from.find((x) => x.id !== picked)!;
    setListSlug(null);
    setPicked(p.id);
    scrollToResults();
  };

  const onParams = useMemo(
    () => (f: Filters, random: boolean) => {
      setFilters(f);
      setListSlug(null);
      setPicked(null);
      if (random) {
        pickRandom(match(titles, f));
        // drop ?random=1 so a refresh doesn't pick again
        writtenRef.current = toQuery(f);
        window.history.replaceState(null, "", writtenRef.current ? `/?${writtenRef.current}` : "/");
      } else if (toQuery(f)) scrollToResults();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per URL change
    [titles],
  );

  const F = featured[feat];

  return (
    <main>
      <Suspense fallback={null}>
        <ParamSync writtenRef={writtenRef} onChange={onParams} />
      </Suspense>

      <section className="border-b-[1.5px] border-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap">
          {F && (
            <div className="grid min-w-0 flex-[3_1_520px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-start gap-8 px-4 py-11 sm:px-7">
              <Link href={F.href} className="block w-full max-w-[300px]">
                <Cover src={F.cover} color={F.coverColor} title={F.title} eager />
              </Link>
              <div className="flex min-h-full flex-col gap-3.5">
                <div className="text-[13px] font-semibold tracking-[0.12em] text-accent-ink">
                  ★ เรื่องเด่นประจำสัปดาห์ · {TYPE_LABELS[F.type]}
                </div>
                <h1 className="font-serif text-[clamp(28px,3.4vw,40px)] leading-[1.15] font-extrabold tracking-tight text-balance">
                  {F.title}
                </h1>
                <p className="text-base leading-[1.75] text-pretty">{F.hook}</p>
                <div className="flex flex-wrap gap-2">
                  {F.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-ink px-[11px] py-0.5 text-[13px] whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-3.5 pt-2">
                  <Link
                    href={F.href}
                    className="rounded-lg border-[1.5px] border-ink px-[18px] py-[9px] text-[15px] font-semibold hover:bg-ink hover:text-paper"
                  >
                    อ่านรีวิวเต็ม →
                  </Link>
                  {featured.length > 1 && (
                    <div className="ml-auto flex items-center gap-2">
                      <RoundButton label="เรื่องก่อนหน้า" onClick={() => setFeat((feat + featured.length - 1) % featured.length)}>
                        ‹
                      </RoundButton>
                      <span className="min-w-9 text-center text-[13px] text-muted">
                        {feat + 1} / {featured.length}
                      </span>
                      <RoundButton label="เรื่องถัดไป" onClick={() => setFeat((feat + 1) % featured.length)}>
                        ›
                      </RoundButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px] border-ink bg-panel px-4 py-9 sm:px-7 lg:border-l-[1.5px]">
            <h2 className="font-serif text-[26px] leading-tight font-extrabold">ไม่รู้จะอ่านอะไร?</h2>

            <Field label="ประเภท">
              <div className="flex overflow-hidden rounded-lg border-[1.5px] border-ink">
                {(["all", "manhwa", "manga"] as const).map((k, i) => (
                  <button
                    key={k}
                    aria-pressed={filters.type === k}
                    onClick={() => update({ type: k })}
                    className={`flex-1 px-2.5 py-2 text-sm font-medium whitespace-nowrap ${i < 2 ? "border-r-[1.5px] border-ink" : ""} ${
                      filters.type === k ? "bg-ink text-paper" : ""
                    }`}
                  >
                    {k === "all" ? "ได้หมด" : TYPE_LABELS[k]}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="อารมณ์ (เลือกได้หลายอัน)">
              <div className="flex flex-wrap gap-2">
                {MOOD_KEYS.map((k) => {
                  const on = filters.moods.includes(k);
                  return (
                    <button
                      key={k}
                      aria-pressed={on}
                      onClick={() => update({ moods: on ? filters.moods.filter((x) => x !== k) : [...filters.moods, k] })}
                      className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
                        on ? "border-accent-ink bg-accent-ink text-white" : "border-ink"
                      }`}
                    >
                      {MOOD_LABELS[k]}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="ความยาว">
              <div className="grid grid-cols-2 gap-1.5">
                {(["any", "short", "mid", "long"] as const).map((k) => (
                  <button
                    key={k}
                    aria-pressed={filters.length === k}
                    onClick={() => update({ length: k })}
                    className={`rounded-lg border-[1.5px] border-ink px-2 py-1.5 text-[13px] whitespace-nowrap ${
                      filters.length === k ? "bg-ink text-paper" : ""
                    }`}
                  >
                    {k === "any" ? "ได้หมด" : LENGTH_LABELS[k]}
                  </button>
                ))}
              </div>
            </Field>

            <div className="mt-1 flex flex-col gap-2">
              <button
                onClick={() => {
                  setListSlug(null);
                  scrollToResults();
                }}
                className="rounded-lg border-[1.5px] border-ink bg-ink p-3 text-base font-semibold text-paper hover:border-accent-ink hover:bg-accent-ink"
              >
                ดู {pool.length} เรื่องที่ตรงใจ
              </button>
              <button
                onClick={() => pickRandom(pool)}
                disabled={!pool.length}
                className="w-full rounded-lg border-[1.5px] border-ink p-2.5 text-[15px] font-semibold hover:bg-paper disabled:opacity-40"
              >
                สุ่มให้หนึ่งเรื่อง ✦
              </button>
            </div>
          </aside>
        </div>
      </section>

      <section ref={resultsRef} className="mx-auto flex w-full max-w-[1240px] flex-col gap-[22px] px-4 pt-10 pb-5 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-serif text-[26px] font-extrabold">
            {list ? list.title : hasFilters ? "ผลลัพธ์ของคุณ" : "เรื่องแนะนำทั้งหมด"}
          </h2>
          <div className="flex items-baseline gap-4 text-sm text-muted" aria-live="polite">
            <span>
              {list
                ? `ลิสต์คัดสรร · ${results.length} เรื่อง`
                : `${results.length} เรื่อง${filters.moods.length ? " · เรียงตามความตรงใจ" : ""}`}
            </span>
            {(hasFilters || list) && (
              <button
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setPicked(null);
                  setListSlug(null);
                }}
                className="text-sm text-accent-ink underline"
              >
                ล้างตัวเลือก
              </button>
            )}
          </div>
        </div>

        {results.length === 0 ? (
          <div className="rounded-[10px] border-[1.5px] border-dashed border-ink p-10 text-center text-base text-muted">
            ยังไม่มีเรื่องที่ตรงทุกข้อ ลองเปลี่ยนความยาวหรือประเภทดูนะ
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-[26px]">
            {results.map((t) => (
              <li key={t.id} className="relative">
                <Link href={t.href} className="flex flex-col gap-[9px]">
                  <Cover
                    src={t.cover}
                    color={t.coverColor}
                    title={t.title}
                    className={picked === t.id ? "outline-[3px] outline-offset-4 outline-accent outline-solid" : ""}
                  />
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[15px] leading-snug font-semibold">{t.title}</div>
                    <div className="text-xs text-muted">{metaLine(t)}</div>
                  </div>
                </Link>
                {picked === t.id && (
                  <div className="absolute -top-2.5 -right-1.5 rounded-full bg-accent-ink px-2.5 py-1 text-xs font-semibold text-white">
                    สุ่มได้เรื่องนี้!
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {lists.length > 0 && (
        <section id="lists" className="mx-auto flex w-full max-w-[1240px] scroll-mt-20 flex-col gap-[18px] px-4 pt-5 pb-16 sm:px-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t-[1.5px] border-ink pt-8">
            <h2 className="font-serif text-[26px] font-extrabold">ลิสต์คัดสรร</h2>
            <span className="text-sm text-muted">กดเพื่อดูทุกเรื่องในลิสต์</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {lists.map((l) => (
              <button
                key={l.slug}
                aria-pressed={listSlug === l.slug}
                onClick={() => {
                  setListSlug(l.slug);
                  setPicked(null);
                  scrollToResults();
                }}
                className={`flex items-center gap-3 rounded-[10px] border-[1.5px] border-ink py-2.5 pr-4 pl-2.5 ${
                  listSlug === l.slug ? "bg-ink text-paper" : ""
                }`}
              >
                <div className="flex gap-[3px]">
                  {l.ids.slice(0, 3).map((id) => (
                    <div key={id} className="h-9 w-3.5 rounded-[3px]" style={{ background: byId.get(id)?.coverColor }} />
                  ))}
                </div>
                <div className="text-left">
                  <div className="font-serif text-base leading-snug font-extrabold">{l.title}</div>
                  <div className="text-xs opacity-75">
                    {l.ids.length} เรื่อง{l.description ? ` · ${l.description}` : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] text-soft">{label}</div>
      {children}
    </div>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="h-9 w-9 rounded-full border-[1.5px] border-ink text-base hover:bg-ink hover:text-paper"
    >
      {children}
    </button>
  );
}
