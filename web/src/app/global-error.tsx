"use client"; // replaces the root layout when the layout itself fails, so it brings its own <html>

import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="th">
      <body className="flex min-h-screen flex-col items-start gap-4 px-4 py-20 font-sans sm:px-7">
        <title>หน้านี้โหลดไม่สำเร็จ · อ่านอะไรดี.</title>
        <h1 className="text-[32px] font-extrabold">หน้านี้โหลดไม่สำเร็จ</h1>
        <p className="text-base text-soft">มีบางอย่างผิดพลาด ลองโหลดใหม่อีกครั้ง</p>
        <button
          onClick={() => retry()}
          className="rounded-lg border-[1.5px] border-ink bg-ink px-[18px] py-2.5 text-[15px] font-semibold text-paper"
        >
          ลองอีกครั้ง
        </button>
      </body>
    </html>
  );
}
