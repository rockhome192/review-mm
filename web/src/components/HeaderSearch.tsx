"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const INPUT_CLASS =
  "w-full rounded-lg border-[1.5px] border-ink bg-paper px-3.5 py-1.5 text-[15px] font-normal placeholder:text-muted";

/**
 * Header title search. On the home page it filters as you type, keeping the
 * other filters in the URL; elsewhere Enter opens the home page with ?q=.
 */
export function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onHome = pathname === "/";
  const urlQ = onHome ? (params.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQ);
  const [seenQ, setSeenQ] = useState(urlQ);

  // follow the URL when something else changes q (ล้างตัวเลือก, the logo, back/forward);
  // the URL holds the trimmed text, so a trailing space mid-typing isn't a change
  if (urlQ !== seenQ) {
    setSeenQ(urlQ);
    if (value.trim() !== urlQ) setValue(urlQ);
  }

  const go = (q: string, replace: boolean) => {
    const next = new URLSearchParams(onHome ? params : undefined);
    next.delete("list"); // a search runs over every title, not inside a list
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    const query = next.toString();
    const href = query ? `/?${query}` : "/";
    if (replace) router.replace(href, { scroll: false });
    else router.push(href);
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value, onHome);
      }}
      className="order-last w-full sm:order-none sm:w-auto sm:max-w-xs sm:flex-1"
    >
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (onHome) go(e.target.value, true);
        }}
        placeholder="ค้นหาชื่อเรื่อง"
        aria-label="ค้นหาชื่อเรื่อง"
        className={INPUT_CLASS}
      />
    </form>
  );
}

/** Same box, shown before the URL is readable (static render). */
export function HeaderSearchFallback() {
  return (
    <div className="order-last w-full sm:order-none sm:w-auto sm:max-w-xs sm:flex-1">
      <input type="search" placeholder="ค้นหาชื่อเรื่อง" aria-label="ค้นหาชื่อเรื่อง" disabled className={INPUT_CLASS} />
    </div>
  );
}
