/**
 * SPE-116 — report drift between the database's functions and this repo's migrations.
 *
 * The premise of `supabase/migrations/` is that it reproduces the database. It
 * does not, and nothing was watching. A function created through the dashboard,
 * or edited in place by a `CREATE OR REPLACE` that never landed in a file, is
 * invisible: it works in production forever and simply does not exist in a
 * database built from this repo.
 *
 * That is not hypothetical. SPE-305's batch RPC was rewritten in place at some
 * uncaptured point, and the rewrite introduced a `uuid = text` comparison that
 * made it throw on every call. Nobody noticed for months, because the only copy
 * of the broken body lived in the database — the committed migration still
 * showed the working version.
 *
 * ## Running it
 *
 *     npm run db:drift -- <snapshot.json>
 *
 * The snapshot is the database side of the comparison. This repo has no
 * Postgres driver (only @supabase/supabase-js, which cannot read pg_catalog),
 * so the snapshot is produced separately and fed in — rather than adding a
 * dependency for a script that runs occasionally. Get it by running
 * `SNAPSHOT_SQL` below against the project (Supabase MCP `execute_sql`, the SQL
 * editor, or psql) and saving the resulting JSON array.
 *
 * ## What it reports
 *
 *   MISSING   in the database, no CREATE in any migration — the repo cannot
 *             rebuild it. Worst case, and the SPE-116 backlog.
 *   ORPHANED  a migration creates it but the database has none — usually a
 *             later DROP, listed so it is a decision rather than a surprise.
 *
 * Exits 1 if anything is MISSING, so this can gate CI once the backlog is clear.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * Run this against the database to produce the snapshot. `body_md5` collapses
 * runs of whitespace before hashing, so reformatting a body is not drift while
 * a changed identifier, literal or statement is.
 */
export const SNAPSHOT_SQL = `
select p.proname as name,
       p.oid::regprocedure::text as signature,
       p.prosecdef as security_definer,
       md5(btrim(regexp_replace(p.prosrc, '\\s+', ' ', 'g'))) as body_md5,
       (select count(*) from pg_trigger t
          where t.tgfoid = p.oid and not t.tgisinternal) as trigger_uses
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f','p')
order by p.proname;
`.trim();

export interface DbFunction {
  name: string;
  signature: string;
  security_definer: boolean;
  body_md5: string;
  trigger_uses: number;
}

export interface DriftReport {
  missing: DbFunction[];
  orphaned: string[];
}

/**
 * Every function name a migration file creates.
 *
 * The opening paren is required so prose in a comment ("create a function to
 * ...") is not mistaken for a definition — without it this over-reports and the
 * MISSING list silently shrinks, which is the one failure mode that matters
 * here.
 */
export function functionsDefinedInMigrations(dir = MIGRATIONS_DIR): Set<string> {
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8');
    // No dotAll flag: the pattern spans newlines via \s, never a bare dot.
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) found.add(m[1].toLowerCase());
  }
  return found;
}

export function buildReport(db: DbFunction[], inMigrations: Set<string>): DriftReport {
  const dbNames = new Set(db.map(f => f.name));
  // One entry per overload would repeat a name; MISSING is per signature
  // because each overload needs its own CREATE.
  return {
    missing: db.filter(f => !inMigrations.has(f.name)),
    orphaned: [...inMigrations].filter(n => !dbNames.has(n)).sort(),
  };
}

export function formatReport(report: DriftReport): string {
  const { missing, orphaned } = report;
  const lines: string[] = [];

  lines.push(`MISSING from migrations — the database has it, the repo cannot rebuild it (${missing.length})`);
  if (!missing.length) lines.push('  none');
  for (const f of missing) {
    const tags = [
      f.security_definer ? 'SECURITY DEFINER' : null,
      f.trigger_uses > 0 ? `${f.trigger_uses} trigger(s) — LIVE` : null,
    ].filter(Boolean);
    lines.push(`  ${f.signature}${tags.length ? `  [${tags.join(', ')}]` : ''}`);
  }

  lines.push('');
  lines.push(`ORPHANED — a migration creates it, the database has none (${orphaned.length})`);
  if (!orphaned.length) lines.push('  none');
  for (const name of orphaned) lines.push(`  ${name}`);

  return lines.join('\n');
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npm run db:drift -- <snapshot.json>\n');
    console.error('Produce the snapshot by running this against the database:\n');
    console.error(SNAPSHOT_SQL);
    process.exit(2);
  }

  let db: DbFunction[];
  try {
    db = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`Could not read snapshot at ${path}: ${(err as Error).message}`);
    process.exit(2);
  }
  if (!Array.isArray(db) || (db.length && typeof db[0]?.name !== 'string')) {
    console.error(`${path} is not a snapshot — expected the JSON array SNAPSHOT_SQL returns.`);
    process.exit(2);
  }

  const inMigrations = functionsDefinedInMigrations();
  const report = buildReport(db, inMigrations);
  console.log(formatReport(report));
  console.log(`\n${db.length} functions in the database, checked against supabase/migrations.`);

  // A snapshot covering only part of the database makes every unlisted function
  // look ORPHANED. That reads as alarming and means nothing, so say so rather
  // than let the number be misread.
  if (db.length * 2 < inMigrations.size) {
    console.warn(
      `\nNOTE: the snapshot lists ${db.length} functions but the migrations define ${inMigrations.size}. ` +
      `This looks like a partial snapshot — ORPHANED is inflated and should be ignored. ` +
      `MISSING is still accurate for the functions the snapshot does cover.`,
    );
  }

  if (report.missing.length) {
    console.error(`\nFAIL: ${report.missing.length} function(s) exist only in the database (SPE-116).`);
    process.exit(1);
  }
  console.log('\nOK: every database function has a CREATE in the migrations.');
}

if (require.main === module) main();
