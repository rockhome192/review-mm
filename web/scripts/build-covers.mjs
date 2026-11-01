// Resize every visible title's AniList cover to a small WebP in public/covers/, so the
// site serves covers itself instead of hot-linking AniList's PNG/JPG (about 96 KB down
// to about 22 KB for a ~190px slot). Run before the build: lib/data.ts uses a local
// file when one exists and falls back to the AniList URL when it doesn't, so a cover
// that fails here never breaks the build.
//
// Files are named after the AniList file (bx106130-yPNeuSu75ey1.webp). A new cover on
// AniList has a new name, so a file never has to change and can be cached forever.
// .cover-cache/ keeps the results between runs (CI restores it), so only new covers
// are downloaded.
//
// Usage (in web/): npm run covers   — needs NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
import { mkdir, readdir, copyFile, rm, access } from "node:fs/promises";
import sharp from "sharp";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CACHE = ".cover-cache";
const OUT = "public/covers";
const WIDTH = 320; // biggest slot is ~300px (home's featured cover); cards are ~190px
const QUALITY = 72;
const CONCURRENCY = 6;

/** "…/cover/medium/bx106130-yPNeuSu75ey1.jpg" → "bx106130-yPNeuSu75ey1" */
const coverName = (url) => url.split("/").pop().replace(/\.\w+$/, "");

async function coverUrls() {
  const urls = new Set();
  for (let offset = 0; ; offset += 500) {
    const res = await fetch(`${URL}/rest/v1/titles?select=cover_url&cover_url=not.is.null&order=anilist_id&limit=500&offset=${offset}`, {
      headers: { apikey: KEY },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const page = await res.json();
    if (!page.length) return [...urls];
    for (const r of page) urls.add(r.cover_url);
  }
}

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      if (attempt >= 3) throw e; // network error or timeout
    }
    if (res?.ok) return Buffer.from(await res.arrayBuffer());
    if (res && (res.status === 404 || attempt >= 3)) throw new Error(`HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt)); // 429 or 5xx: back off and retry
  }
}

async function makeCover(url) {
  const file = `${CACHE}/${coverName(url)}.webp`;
  try {
    await access(file);
    return "cached";
  } catch {}
  // the DB holds AniList's "large" field, whose files sit under /medium/ at 230px wide;
  // the /large/ copy is 460px, so resizing it down to 320 stays sharp
  const big = url.replace("/cover/medium/", "/cover/large/");
  let src;
  try {
    src = await download(big);
  } catch {
    src = await download(url);
  }
  await sharp(src).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(file);
  return "new";
}

async function main() {
  if (!URL || !KEY) {
    console.warn("covers: NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not set, skipping (the site will use AniList URLs)");
    return;
  }
  await mkdir(CACHE, { recursive: true });
  const urls = await coverUrls();
  const count = { cached: 0, new: 0, failed: 0 };
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let url; (url = queue.shift()); ) {
        try {
          count[await makeCover(url)]++;
        } catch (e) {
          count.failed++;
          console.warn(`covers: ${url} failed (${e.message}), the site keeps the AniList URL`);
        }
      }
    }),
  );

  // public/covers holds exactly this run's covers, so removed titles don't linger
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const wanted = new Set(urls.map((u) => `${coverName(u)}.webp`));
  const files = (await readdir(CACHE)).filter((f) => wanted.has(f));
  await Promise.all(files.map((f) => copyFile(`${CACHE}/${f}`, `${OUT}/${f}`)));
  console.log(`covers: ${files.length}/${urls.length} ready (${count.new} new, ${count.cached} cached, ${count.failed} failed)`);
}

await main();
