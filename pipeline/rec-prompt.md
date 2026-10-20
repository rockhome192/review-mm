# "ถ้าชอบเรื่องนี้ ลองอ่าน" card text

Each title page shows up to 3 cards for other titles on our site. Under each card the site shows:

> **เหมือนกันตรง:** `same`
> ต่างตรง: `diff`

You write `same` and `diff` for one card at a time: the reader is on the PAGE title and the card
points to the CARD title. Input comes from `pipeline/rec-input.ts`: both titles' facts, tags, our
blurb and the reader moods (score 0–3 with a reason).

## same — why a fan of the PAGE title will like the CARD title
- One concrete shared thing a fan would care about: the kind of protagonist, a relationship
  dynamic, a mechanic, the tone, what the story makes you feel.
  ดี: "พระเอกไต่จากศูนย์ด้วยระบบแบบเกมเหมือนกัน" · "สายสัมพันธ์พ่อลูกที่ต้องเดินทางไปด้วยกัน"
- **A shared genre alone doesn't count** ("แฟนตาซีเหมือนกัน", "แนวแอ็กชันเหมือนกัน").
- Write about the CARD title, so the line still reads right on its own.

## diff — what's different, so the reader picks knowingly
- One honest difference that matters when choosing: heavier/lighter, funnier, slower, longer or
  still releasing, a different setting or kind of protagonist, more romance, more gore.
  ดี: "หนักและมืดกว่ามาก มีฉากเลือดสาด" · "จบแล้วใน 49 ตอน อ่านรวดเดียวได้"
- Base it on the data (moods, status, chapters, tags, caveat). Say it plainly, not as a put-down.

## Both
- Short Thai, one sentence each, at most ~60 characters. It sits under a narrow card.
- Voice of a friend recommending; natural Thai, not translated phrasing.
- Speak for yourself: never "คนอ่านชม…", "รีวิวบอก…", "แฟนๆ ว่า…".
- Banned overused phrases: "ลุ้นจนลืมหายใจ", "วางไม่ลง", "ห้ามพลาด", "ครบทุกรส", "อ่านเพลิน".
- Don't start with the title names; a character name is fine when it helps.
- Only facts from the input. If you add anything else, set `usedOutsideKnowledge: true`.
- No spoilers beyond the premise. Never mention reviews, tags, scores or our data.
- `fit: "weak"` only when a fan of the PAGE title would likely feel misled by the card: the two
  share nothing but a broad genre AND the feel is clearly different (moods, tone). Weak cards get
  swapped for another title, so don't use it for "similar but not identical".
  Each card shows how many readers recommended the pair. Many votes (20+) mean readers found a
  real link even if the data is thin: find it (same author style, theme, protagonist's journey)
  and mark weak only if you truly see none.

## Output
A JSON array (2-space indent), one object per card, in input order:
```json
{ "anilistId": 30656, "recAnilistId": 30002, "same": "...", "diff": "...", "fit": "ok", "usedOutsideKnowledge": false }
```
`anilistId` is the PAGE title, `recAnilistId` the CARD title. Shape: `RecText` in `pipeline/schema.ts`.

## Review
The reviewer checks every card against the rules above and the input, and writes `RecReview`
objects (one per card, same order): `verdict: "revise"` with a `problem` and a `fix` when
- `same` is only a shared genre, or `diff` is vague ("แนวต่างกันนิดหน่อย"),
- either line claims something the input doesn't support, or spoils,
- the Thai is unnatural or longer than ~60 characters,
- `fit` is wrong (marked ok but nothing real in common, or weak when there clearly is).
Otherwise `verdict: "pass"` with `problem`/`fix` null.
