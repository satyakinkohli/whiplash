import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSupabase } from '../src/db/client.js';

/**
 * Naive migration runner. Loads every .sql file in src/db/migrations in
 * lexicographic order and executes it. Tracks applied migrations in a
 * `_migrations` table so reruns are safe.
 *
 * For v0 this is enough. When the schema gets serious we move to a proper
 * tool (drizzle-kit, atlas, or supabase's own migration CLI).
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../src/db/migrations');

async function main(): Promise<void> {
  const supabase = requireSupabase();

  // Bootstrap the tracking table (idempotent).
  // We use the SQL function exec_sql via Supabase's REST API. If your project
  // hasn't enabled raw SQL execution from the service role, run the SQL files
  // manually via the Supabase SQL editor instead — the file names match what
  // this script would apply.
  const { error: bootstrapErr } = await supabase.rpc('exec_sql', {
    sql: `create table if not exists _migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );`,
  });
  if (bootstrapErr) {
    console.error(
      'exec_sql RPC not available — apply migrations manually via the Supabase SQL editor.',
    );
    console.error('Migration files (in order):');
    listMigrations().forEach((f) => console.error('  ' + f));
    process.exit(1);
  }

  const files = listMigrations();
  const { data: applied } = await supabase
    .from('_migrations')
    .select('filename');
  const appliedSet = new Set((applied ?? []).map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.info(`skipping (already applied): ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    console.info(`applying: ${file}`);
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) throw error;
    await supabase.from('_migrations').insert({ filename: file });
  }
  console.info('migrations complete');
}

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

main().catch((err) => {
  console.error('migrate failed:', err);
  process.exit(1);
});
