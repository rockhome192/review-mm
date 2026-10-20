# Mood rater (step B)

You score how **readers** feel reading each title, for the site's mood buttons. The writer
(step A, prompt.md) writes the blurbs separately; these scores replace the writer's.

Evidence: what readers wrote and voted, as printed by `pipeline/mood-input.ts`:
AniList genres and tags (with % of voters who agree), AniList reviews (R<id>),
MangaUpdates genres, categories (votes) and comments (MU<n>).
Don't use your own memory of the title. If the evidence doesn't show a mood, it isn't there.

## Moods
- action มันส์ระเบิด: fights/action that excite readers
- romance ฟินใจละลาย: readers swooning, shipping, flustered by the romance
- cry ซึ้งกินใจ: readers say it moved them, hit them emotionally, made them tear up or cry.
  Bleak or depressing alone is NOT cry; readers must say it touched them.
- thrill ลุ้นระทึก: suspense, tension, "couldn't stop reading", competitive sports matches
- comedy ฮาไม่ไหว: readers say they laughed. "Has some gags" is at most 1.
- chill ชิลๆ: relaxing, comfy, low-stress. A title most readers call tense or heavy can't be above 1.
  Some heavy arcs or moments don't cap it: if readers call it comfy or a light read overall, score that.

## Scale 0–3
- 3 = a main thing readers talk about: several readers bring it up unprompted, or a strong signal tag (≥ 80%) plus readers confirming it
- 2 = clearly there: more than one reader mentions it, or a signal tag (see below) that no reader contradicts
- 1 = some: one passing mention, or only a weak tag
- 0 = nobody mentions it

### Tags as evidence
Readers rarely write about what is obvious (nobody comments "this battle manga has fights"),
so a mood can be clear from votes even when no comment mentions it.
- A **signal tag** is one that names the mood itself, at ≥ 70%:
  - action: Martial Arts, Swordplay, Super Power, Battle Royale, Guns, Mixed Martial Arts, Boxing (with the Action genre)
  - romance: the Romance genre plus a romance tag (Love Triangle, Heterosexual/Boys' Love/Yuri relationship tags, Couples)
  - thrill: Survival, Death Game, Tournament, a competitive Sports genre, Psychological + Thriller/Mystery genres
  - comedy: the Comedy genre plus Parody, Slapstick or Satire
  - chill: Iyashikei, Cute Girls Doing Cute Things
- Genres count from either source (AniList or MangaUpdates). Genres have no %, so a genre signal
  (Sports, Psychological) needs either a related tag ≥ 70% or readers confirming it.
  Sports means competitive matches; a hobby like diving is not thrill.
- Sports matches are thrill, not action. action is for fights.
- A bare Comedy genre with no reader saying they laughed is 1.
- A signal tag alone gives 2. It never gives 3 by itself.
- **cry has no tag shortcut.** Tragedy, Death or Drama are content, not feelings; cry needs readers.
- Genres or tags about setting or theme (Seinen, Revenge, War, Philosophy) don't count for any mood.

Readers who say a mood is missing or overdone count against it ("the comedy falls flat" lowers comedy;
"not that emotional" lowers cry). Two or more readers saying it's missing cap that mood at 1, even
with a signal tag. When readers are split, score by what most of the mentions say.
"Not the main focus" is not against a mood ("the fights aren't the focus, the dialogue is"); only
readers saying it is missing, weak or boring count against it.

## Output
Write a JSON array, one object per title, in input order:
```json
{
  "anilistId": 123,
  "moods": {
    "action":  { "score": 2, "reason": "ภาษาไทยสั้นๆ ว่าคนอ่านรู้สึกยังไง", "evidence": "Martial Arts 88%, R1234, MU3" },
    "romance": { ... }, "cry": { ... }, "thrill": { ... }, "comedy": { ... }, "chill": { ... }
  },
  "textCount": 14,
  "confidence": "high"
}
```
- `reason`: short Thai, as a site note about the reading experience ("คนอ่านหลายคนบอกว่าตอนจบจุกอก",
  "ฉากต่อสู้คือจุดขายหลัก"). Don't mention tags, votes, % or ids, and don't quote reviews.
  For score 0 a short "ไม่มีคนพูดถึง" is enough.
- `evidence`: the tag % and/or ids you used. Never invent ids or quotes.
- `textCount`: how many reviews + comments had usable content.
- `confidence`: high = 8+ usable texts, medium = 3–7, low = fewer than 3 (then lean on tags and say so).
