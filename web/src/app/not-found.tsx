import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col items-start gap-4 px-4 py-20 sm:px-7">
      <h1 className="font-serif text-[32px] font-extrabold">ไม่เจอหน้านี้</h1>
      <p className="text-base text-soft">เรื่องนี้อาจยังไม่มีในเว็บ หรือลิงก์พิมพ์ผิด</p>
      <Link
        href="/"
        className="rounded-lg border-[1.5px] border-ink bg-ink px-[18px] py-2.5 text-[15px] font-semibold text-paper hover:border-accent-ink hover:bg-accent-ink hover:text-white"
      >
        กลับไปหาเรื่องอ่าน
      </Link>
    </main>
  );
}
