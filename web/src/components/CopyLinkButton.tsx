"use client";

import { useState } from "react";

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
      className="rounded-lg border-[1.5px] border-ink px-[18px] py-2.5 text-[15px] font-semibold hover:bg-panel"
      aria-live="polite"
    >
      {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
    </button>
  );
}
