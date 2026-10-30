// What each list page says about itself. The members come from Supabase (pipeline/db-lists.ts
// picks them by rule, plus hand pins from data/lists-manual.json that skip the rule), so the
// intros describe the idea of the list and never promise a hard cutoff. "mood" names the mood
// whose reason is shown under each title.
import type { MoodKey } from "./types";

export type ListPage = { intro: string; mood?: MoodKey };

/** Lists that get their own page. "featured" has none: it only feeds the home page hero. */
export const LIST_PAGES: Record<string, ListPage> = {
  trending: {
    intro: "เรื่องที่คนบน AniList กำลังอ่านและพูดถึงเยอะที่สุดในสัปดาห์นี้ คัดเฉพาะเรื่องที่มีหน้าแนะนำในเว็บแล้ว อัปเดตทุกวันจันทร์",
  },
  levelup: {
    intro: "มังฮวาสายพระเอกเก่งขึ้นเรื่อยๆ ทั้งดันเจี้ยน ระบบเกม ฝึกยุทธ์ และย้อนเวลา เลือกเรื่องที่ฉากบู๊มันส์จริงและคะแนนดี ใต้แต่ละเรื่องบอกว่ามันส์ตรงไหน",
    mood: "action",
  },
  tissues: {
    intro: "เรื่องที่ซึ้งจนน้ำตาซึม ทั้งดราม่าครอบครัว มิตรภาพ และการสูญเสีย ใต้แต่ละเรื่องบอกว่าซึ้งตรงไหน",
    mood: "cry",
  },
  romance: {
    intro: "โรแมนซ์ที่ฟินแบบไม่ต้องทนดราม่าเกินเหตุ ตัดแนวแก้แค้น ฮาเร็ม รักสามเส้า และแฟนเซอร์วิสหนักๆ ออก ใต้แต่ละเรื่องบอกว่าฟินตรงไหน",
    mood: "romance",
  },
  bedtime: {
    intro: "เรื่องอ่านสบายที่ไม่มีฉากลุ้นหนักหรือบู๊ดุเดือด เหมาะอ่านก่อนนอนหรือตอนอยากพักสมอง ใต้แต่ละเรื่องบอกว่าชิลแบบไหน",
    mood: "chill",
  },
  "short-reads": {
    intro: "เรื่องที่จบแล้วและไม่ยาวมาก ส่วนใหญ่ไม่เกิน 60 ตอน อ่านรวดเดียวจบได้ในวันหยุด ไม่ต้องรอตอนใหม่",
  },
  comedy: {
    intro: "เรื่องที่ฮาจนต้องวางมือถือก่อนหัวเราะ ทั้งมุกหน้าตาย มุกตัวละครป่วน และคอมเมดี้ชีวิตประจำวัน ใต้แต่ละเรื่องบอกว่าฮาแบบไหน",
    mood: "comedy",
  },
  thriller: {
    intro: "เรื่องที่ลุ้นจนตัวเกร็ง ทั้งแนวปริศนา เอาชีวิตรอด และเกมจิตวิทยา ใต้แต่ละเรื่องบอกว่าลุ้นตรงไหน",
    mood: "thrill",
  },
  sports: {
    intro: "มังงะและมังฮวาแนวกีฬาที่คะแนนดี ทั้งวอลเลย์บอล บาสเกตบอล ฟุตบอล และอื่นๆ",
  },
  "thai-legal": {
    intro: "เรื่องที่มีฉบับภาษาไทยแบบถูกลิขสิทธิ์ ทั้งเล่มจากสำนักพิมพ์ไทยและแอปอ่านออนไลน์ ลิงก์ร้านอยู่ในหน้าของแต่ละเรื่อง",
  },
};

export const listHref = (slug: string) => `/list/${slug}`;
