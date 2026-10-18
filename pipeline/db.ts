// Direct Postgres connection for pipeline scripts (bypasses RLS; server-side only).
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI sets env vars directly
}

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL is not set (add it to .env.local)");

export const sql = postgres(url, {
  ssl: "require",
  prepare: false, // works with both the session and transaction pooler
  onnotice: () => {},
});

export const closeDb = () => sql.end({ timeout: 5 });
