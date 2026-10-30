"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MenuList = { slug: string; href: string; title: string; description: string | null; count: number };

/** Header "ลิสต์คัดสรร ▾": each list opens its own page (/list/<slug>), or the home page filtered to it. */
export function ListsMenu({ lists }: { lists: MenuList[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 hover:text-accent-ink"
      >
        ลิสต์คัดสรร
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open && (
        <ul className="absolute right-0 mt-3 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-paper py-1.5 whitespace-normal shadow-[4px_4px_0_var(--color-ink)]">
          {lists.map((l) => (
            <li key={l.slug}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 hover:bg-panel hover:text-ink"
              >
                <div className="font-serif text-[15px] leading-snug font-extrabold">{l.title}</div>
                <div className="text-xs font-normal text-soft">
                  {l.count} เรื่อง{l.description ? ` · ${l.description}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
