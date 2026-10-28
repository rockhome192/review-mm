// Weekly (GitHub Actions, Monday before the deploy): fill the home page's
// "เรื่องเด่นประจำสัปดาห์" (list "featured") and the list "trending" from what is
// trending on AniList now, among the titles on the site.
// Featured = PER_TYPE manga + PER_TYPE manhwa, skipping titles featured in the
// last SKIP_WEEKS weeks. A week that already has picks is left alone, so
// re-runs and retries don't reshuffle it. If AniList is down nothing is
// written: the site keeps last week's picks.
//
// Runs as weekly_bot (supabase/migrations/0004_weekly_bot.sql), not the owner.
// The lists themselves are created by db-lists.ts.
//
// Usage: npx tsx pipeline/weekly-trending.ts [--dry] [--force]
import { sql, closeDb } from "./db.ts";

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force"); // redo this week's picks
const PER_TYPE = 2;
const SKIP_WEEKS = 4;
const TRENDING_SIZE = 20;
const PAGES = 3; // 150 most-trending of ours is plenty to find both

/** Monday of this week in Bangkok, as YYYY-MM-DD. */
function mondayBangkok(now = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  bkk.setUTCDate(bkk.getUTCDate() - ((bkk.getUTCDay() + 6) % 7));
  return bkk.toISOString().slice(0, 10);
}

async function anilist(query: string, variables: object) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after") ?? 60);
        console.log(`rate limited, waiting ${wait}s`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await res.json();
      if (!res.ok || body.errors) throw new Error(`AniList ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
      return body.data;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`AniList failed (attempt ${attempt}), retrying: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, attempt * 20_000));
    }
  }
}

const week = mondayBangkok();
const catalog = await sql<{ anilist_id: number; type: string }[]>`
  select t.anilist_id, t.type from titles t
  join blurbs b on b.anilist_id = t.anilist_id and b.status = 'published'
  left join overrides o on o.anilist_id = t.anilist_id
  where not coalesce(o.hidden, false)`;
const typeOf = new Map(catalog.map((t) => [t.anilist_id, t.type]));

const lists = await sql<{ id: number; slug: string }[]>`select id, slug from lists where slug in ('featured', 'trending')`;
const listId = new Map(lists.map((l) => [l.slug, l.id]));
if (!listId.has("featured") || !listId.has("trending")) throw new Error("run db-lists.ts first: featured/trending lists missing");

const done = await sql`select 1 from internal.featured_history where week = ${week} limit 1`;
if (done.length && !FORCE) {
  console.log(`week ${week} already picked; --force to redo`);
  await closeDb();
  process.exit(0);
}

const QUERY = `query ($ids: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    media(id_in: $ids, type: MANGA, sort: TRENDING_DESC) { id trending }
  }
}`;
const ids = [...typeOf.keys()];
const trending: number[] = [];
for (let page = 1; page <= PAGES; page++) {
  const data = await anilist(QUERY, { ids, page });
  const media: { id: number; trending: number }[] = data.Page.media;
  // trending 0 = no activity at all lately: not "hot", whatever the order says
  trending.push(...media.filter((m) => m.trending > 0).map((m) => m.id));
  if (media.length < 50) break;
}

const recent = new Set(
  (await sql<{ anilist_id: number }[]>`select anilist_id from internal.featured_history
    where week >= ${week}::date - ${SKIP_WEEKS * 7}::int and week < ${week}::date`).map((r) => r.anilist_id),
);
const featured = ["manga", "manhwa"].flatMap((type) =>
  trending.filter((id) => typeOf.get(id) === type && !recent.has(id)).slice(0, PER_TYPE),
);
const top = trending.slice(0, TRENDING_SIZE);

const show = (list: number[]) => list.join(", ");
console.log(`week ${week}: ${trending.length} of ${ids.length} titles trending`);
console.log(`featured: ${show(featured)}`);
console.log(`trending: ${show(top)}`);
if (featured.length < PER_TYPE * 2) throw new Error(`only ${featured.length} featured picks; nothing written`);
if (DRY) {
  await closeDb();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const [slug, list] of [["featured", featured], ["trending", top]] as const) {
    const id = listId.get(slug)!;
    await tx`delete from list_items where list_id = ${id}`;
    await tx`insert into list_items ${tx(list.map((anilist_id, i) => ({ list_id: id, anilist_id, position: i + 1 })))}`;
  }
  await tx`delete from internal.featured_history where week = ${week}`;
  await tx`insert into internal.featured_history ${tx(featured.map((anilist_id) => ({ week, anilist_id })))}`;
});
console.log("saved");
await closeDb();
