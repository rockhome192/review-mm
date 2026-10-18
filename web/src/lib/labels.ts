import type { LengthKey, MoodKey, TitleType } from "./types";

export const MOOD_LABELS: Record<MoodKey, string> = {
  action: "มันส์ระเบิด",
  romance: "ฟินใจละลาย",
  cry: "ซึ้งกินใจ",
  thrill: "ลุ้นระทึก",
  comedy: "ฮาไม่ไหว",
  chill: "ชิลๆ",
};

// Each passes WCAG AA (>= 4.5) with paper-colored text on top.
export const MOOD_COLORS: Record<MoodKey, string> = {
  action: "#b23a22",
  romance: "#a0405f",
  cry: "#2b3a55",
  thrill: "#5b4a8a",
  comedy: "#7d5f12",
  chill: "#2f5d55",
};

export const MOOD_LEVELS = ["", "มีบ้าง", "ชัดเจน", "จุดเด่น"];

export const TYPE_LABELS: Record<TitleType, string> = { manga: "มังงะ", manhwa: "มังฮวา" };
export const TYPE_ORIGIN: Record<TitleType, string> = { manga: "ญี่ปุ่น", manhwa: "เกาหลี" };

export const STATUS_LABELS: Record<string, string> = {
  RELEASING: "กำลังลง",
  FINISHED: "จบแล้ว",
  HIATUS: "พักการลง",
  NOT_YET_RELEASED: "ยังไม่เริ่มลง",
  CANCELLED: "ยกเลิก",
};

export const LENGTH_LABELS: Record<LengthKey, string> = {
  short: "จบสั้น ≤100",
  mid: "กลางๆ 100–200",
  long: "มหากาพย์ 200+",
};

export const WARNING_LABELS: Record<string, string> = {
  violence: "ความรุนแรง",
  gore: "ฉากเลือดสาด",
  sexual: "เนื้อหาทางเพศ",
  nudity: "ภาพโป๊เปลือย",
  suicide: "การฆ่าตัวตาย",
  abuse: "การทารุณ",
};

export const LINK_KIND_LABELS = {
  th_read: "อ่านออนไลน์ภาษาไทย",
  th_buy: "ซื้อฉบับรวมเล่มภาษาไทย",
  en_official: "ฉบับภาษาอังกฤษ",
} as const;

/** "มังงะ · 140 ตอน · จบแล้ว" */
export function metaLine(t: { type: TitleType; chapters: number | null; status: string | null }) {
  const parts = [TYPE_LABELS[t.type]];
  if (t.chapters) parts.push(`${t.chapters} ตอน`);
  if (t.status) parts.push(STATUS_LABELS[t.status] ?? t.status);
  return parts.join(" · ");
}
