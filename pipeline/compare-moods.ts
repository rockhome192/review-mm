// Compare AI mood scores (data/generated/all.json) with the crowd estimate
// (data/crowd/crowd-*.json). Prints per-mood agreement and bias, and writes the
// titles where they disagree on what the site would show to data/crowd/conflicts.md.
//
// "Shown" = score >= 2 (see pickMoods in schema.ts), so that is the line that matters.
// Usage: npx tsx pipeline/compare-moods.ts
import fs from "node:fs";
import { MOOD_KEYS, MOOD_LABELS } from "./schema.ts";

const all = JSON.parse(fs.readFileSync("data/generated/all.json", "utf8"));
const top = JSON.parse(fs.readFileSync("data/raw/anilist-top.json", "utf8"));
const crowd = fs
  .readdirSync("data/crowd")
  .filter((f) => /^crowd-.*\.json$/.test(f))
  .flatMap((f) => JSON.parse(fs.readFileSync(`data/crowd/${f}`, "utf8")));

const name = (id: number) => top.find((t: any) => t.anilistId === id)?.title ?? id;
const shown = (s: number) => s >= 2;

type Row = { id: number; mood: string; ai: number; crowd: number; conf: string; aiWhy: string; crowdWhy: string };
const rows: Row[] = [];
for (const c of crowd) {
  const g = all.find((x: any) => x.anilistId === c.anilistId);
  if (!g) continue;
  for (const k of MOOD_KEYS)
    rows.push({
      id: c.anilistId, mood: k, ai: g.moods[k].score, crowd: c.moods[k].score, conf: c.confidence,
      aiWhy: g.moods[k].reason, crowdWhy: c.moods[k].evidence,
    });
}

console.log(`${crowd.length} titles compared\n`);
console.log("mood            agree(shown)  AI-only  crowd-only  exact  mean(AI-crowd)");
for (const k of MOOD_KEYS) {
  const r = rows.filter((x) => x.mood === k);
  const agree = r.filter((x) => shown(x.ai) === shown(x.crowd)).length;
  const aiOnly = r.filter((x) => shown(x.ai) && !shown(x.crowd)).length;
  const crowdOnly = r.filter((x) => !shown(x.ai) && shown(x.crowd)).length;
  const exact = r.filter((x) => x.ai === x.crowd).length;
  const bias = r.reduce((s, x) => s + x.ai - x.crowd, 0) / (r.length || 1);
  console.log(
    `${(k + " " + MOOD_LABELS[k]).padEnd(16)}${`${Math.round((100 * agree) / r.length)}%`.padStart(12)}` +
      `${String(aiOnly).padStart(9)}${String(crowdOnly).padStart(12)}${`${Math.round((100 * exact) / r.length)}%`.padStart(7)}` +
      `${bias.toFixed(2).padStart(16)}`,
  );
}

// Conflicts worth a human look: the site would show it one way, readers point the other
// way, and the gap is at least 2. Readers under-mention obvious moods, so a 1-point gap
// is mostly noise. Low-confidence crowd rows are listed last, since that side is thin.
const conflicts = rows.filter((x) => shown(x.ai) !== shown(x.crowd) && Math.abs(x.ai - x.crowd) >= 2);
const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
conflicts.sort((a, b) => order[a.conf] - order[b.conf] || Math.abs(b.ai - b.crowd) - Math.abs(a.ai - a.crowd));

let md = `# AI vs คนอ่าน: อารมณ์ที่ขัดกัน\n\n${conflicts.length} จุด จาก ${crowd.length} เรื่อง (ขัดกัน = ฝั่งหนึ่งให้ ≥2 คือขึ้นเว็บ อีกฝั่งให้ ≤1 และห่างกันอย่างน้อย 2)\n`;
for (const conf of ["high", "medium", "low"]) {
  const list = conflicts.filter((x) => x.conf === conf);
  if (!list.length) continue;
  md += `\n## หลักฐานจากคนอ่าน: ${conf} (${list.length})\n`;
  for (const x of list)
    md += `\n**${name(x.id)}** (${x.id}) · ${MOOD_LABELS[x.mood as keyof typeof MOOD_LABELS]}: AI ${x.ai} / คนอ่าน ${x.crowd}\n` +
      `- AI: ${x.aiWhy}\n- คนอ่าน: ${x.crowdWhy}\n`;
}
fs.writeFileSync("data/crowd/conflicts.md", md);
console.log(`\n${conflicts.length} conflicts -> data/crowd/conflicts.md`);
