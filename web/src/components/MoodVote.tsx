"use client";

import { useState, useSyncExternalStore } from "react";
import type { MoodKey } from "@/lib/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const noop = () => () => {};
function readVote(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** "ตรงไหม? 👍 👎" on one mood row. Insert-only into mood_votes; one vote per browser per row. */
export function MoodVote({ id, mood, score }: { id: number; mood: MoodKey; score: number }) {
  const storageKey = `mood-vote:${id}:${mood}`;
  // read after hydration only (server snapshot is null), so static HTML always shows the buttons
  const saved = useSyncExternalStore(noop, () => readVote(storageKey), () => null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  async function vote(agree: boolean) {
    if (!URL || !KEY || state !== "idle" || saved) return;
    setState("sending");
    try {
      const res = await fetch(`${URL}/rest/v1/mood_votes`, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ anilist_id: id, mood, agree, score_shown: score }),
      });
      if (!res.ok) throw new Error(String(res.status));
      try {
        localStorage.setItem(storageKey, agree ? "up" : "down");
      } catch {}
      setState("done");
    } catch {
      setState("idle"); // let them try again
    }
  }

  if (state === "done" || saved) return <span className="text-xs text-soft">ขอบคุณที่บอก</span>;

  const btn =
    "grid size-8 place-items-center rounded-md border border-line text-sm hover:border-ink disabled:opacity-50";
  return (
    <div className="flex items-center gap-1.5" aria-live="polite">
      <span className="mr-0.5 text-xs text-soft">ตรงไหม?</span>
      <button className={btn} onClick={() => vote(true)} disabled={state === "sending"} aria-label="ตรง">
        👍
      </button>
      <button className={btn} onClick={() => vote(false)} disabled={state === "sending"} aria-label="ไม่ตรง">
        👎
      </button>
    </div>
  );
}
