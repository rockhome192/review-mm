import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every page is prerendered and never revalidated (data changes mean a new build),
// so the prerendered HTML is served straight from static assets: no R2/KV, and the
// Worker never needs the Supabase keys at runtime.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
