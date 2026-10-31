"use client"; // error boundaries must be client components

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col items-start gap-4 px-4 py-20 sm:px-7">
      <h1 className="font-serif text-[32px] font-extrabold">หน้านี้โหลดไม่สำเร็จ</h1>
      <p className="text-base text-soft">มีบางอย่างผิดพลาด ลองโหลดใหม่อีกครั้ง หรือกลับไปหน้าแรก</p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => retry()}
          className="rounded-lg border-[1.5px] border-ink bg-ink px-[18px] py-2.5 text-[15px] font-semibold text-paper hover:border-accent-ink hover:bg-accent-ink hover:text-white"
        >
          ลองอีกครั้ง
        </button>
        <Link
          href="/"
          className="rounded-lg border-[1.5px] border-ink px-[18px] py-2.5 text-[15px] font-semibold hover:border-accent-ink hover:text-accent-ink"
        >
          กลับไปหาเรื่องอ่าน
        </Link>
      </div>
    </main>
  );
}
