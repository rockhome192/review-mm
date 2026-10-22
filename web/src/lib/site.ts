// The public address of the site, for canonical URLs, the sitemap and Open Graph.
// Unset (local builds, preview deploys) means "not the real site": robots.ts then
// blocks crawlers so a preview never gets indexed under the wrong address.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || null;

export const SITE_NAME = "อ่านอะไรดี.";

/** AniList's 460px cover in place of the 230px one the pages show, for link previews. */
export const largeCover = (url: string) => url.replace("/cover/medium/", "/cover/large/");
