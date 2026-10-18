// Apply supabase/migrations/*.sql in order, each once, in its own transaction.
// Reads SUPABASE_DB_URL from .env.local; never prints it.
//
// Usage: npx tsx pipeline/db-migrate.ts
import fs from "node:fs";
import path from "node:path";
import { sql, closeDb } from "./db.ts";

const DIR = "supabase/migrations";

await sql`create schema if not exists internal`;
await sql`create table if not exists internal.schema_migrations (
  name text primary key, applied_at timestamptz not null default now())`;

const applied = new Set(
  (await sql<{ name: string }[]>`select name from internal.schema_migrations`).map((r) => r.name),
);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

for (const f of files) {
  if (applied.has(f)) continue;
  const body = fs.readFileSync(path.join(DIR, f), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into internal.schema_migrations (name) values (${f})`;
  });
  console.log(`applied ${f}`);
}
console.log(`${files.length} migrations, ${files.length - applied.size} new`);
await closeDb();
