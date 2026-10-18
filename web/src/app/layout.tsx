import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans_Thai, Noto_Serif_Thai } from "next/font/google";
import { ListsMenu } from "@/components/ListsMenu";
import { getLists } from "@/lib/data";
import "./globals.css";

const plex = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});

const serif = Noto_Serif_Thai({
  variable: "--font-noto-serif-thai",
  subsets: ["thai", "latin"],
  weight: ["600", "800"],
});

export const metadata: Metadata = {
  title: { default: "อ่านอะไรดี. — แนะนำมังงะและมังฮวาตามอารมณ์", template: "%s · อ่านอะไรดี." },
  description: "เลือกมังงะและมังฮวาตามอารมณ์ที่อยากรู้สึก สรุปจากเสียงของคนอ่านจริง พร้อมช่องทางอ่านแบบถูกลิขสิทธิ์",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // the lists section is hidden until a list is published, so is its menu link
  const menuLists = (await getLists())
    .filter((l) => l.slug !== "featured" && l.ids.length)
    .map((l) => ({ slug: l.slug, title: l.title, description: l.description, count: l.ids.length }));
  return (
    <html lang="th" className={`${plex.variable} ${serif.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <header className="sticky top-0 z-10 border-b-[1.5px] border-ink bg-paper">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3.5 sm:px-7">
            <Link href="/" className="font-serif text-2xl font-extrabold tracking-tight">
              อ่านอะไรดี<span className="text-accent">.</span>
            </Link>
            <nav className="flex items-center gap-3.5 text-[15px] sm:gap-[18px] font-medium whitespace-nowrap">
              <Link href="/?type=manga">มังงะ</Link>
              <Link href="/?type=manhwa">มังฮวา</Link>
              {menuLists.length > 0 && <ListsMenu lists={menuLists} />}
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-auto border-t-[1.5px] border-ink">
          <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-2.5 px-4 py-[22px] text-[13px] text-soft sm:px-7">
            <span>อ่านอะไรดี. — แนะนำมังงะและมังฮวา จากเสียงของคนอ่าน</span>
            <span>ข้อมูลเรื่องจาก AniList · ความเห็นคนอ่านจาก MangaUpdates · สนับสนุนการอ่านผ่านช่องทางที่มีลิขสิทธิ์</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
