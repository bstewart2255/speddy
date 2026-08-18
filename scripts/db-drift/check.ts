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
 * showed the working version. Detecting *that* is why bodies are compared here
 * and not just names.
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
 *   MISSING   the database has it, no migration creates it — the repo cannot
 *             rebuild it. Worst case, and the SPE-116 backlog.
 *   DRIFTED   both have it, but the body a fresh rebuild would produce differs
 *             from the body the database is actually running. Someone edited it
 *             in place. This is the SPE-305 shape.
 *   ORPHANED  a migration creates it but the database has none — usually a
 *             later DROP, listed so it is a decision rather than a surprise.
 *
 * Exits 1 if anything is MISSING or DRIFTED, so this can gate CI once the
 * backlog is clear.
 */

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * Run this against the database to produce the snapshot. `body_md5` collapses
 * runs of whitespace before hashing, so reformatting a body is not drift while
 * a changed identifier, literal or statement is. `normalizeBody` below applies
 * the identical rule to the repo side.
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

/** What the migrations would produce for one function name. */
export interface MigrationFunction {
  /** Body of the LAST definition across sorted files — what a rebuild ends at. */
  bodyMd5: string | null;
  /**
   * Distinct normalised argument lists seen for this name.
   *
   * Distinct, not a count of CREATE statements: a signature that was created
   * once and `CREATE OR REPLACE`d twice is one overload, not three. Counting
   * statements would let historical revisions of `f(uuid)` stand in as coverage
   * for a live `f(text)` that no migration defines.
   *
   * These are compared only against each other, never against pg_proc's
   * spelling, so type aliases need no mapping. The residual imprecision is that
   * `varchar` and `character varying` for the same signature look like two —
   * which under-reports rather than over-reports, and is the safe direction.
   */
  argSignatures: Set<string>;
}

export interface DriftedFunction {
  db: DbFunction;
  migrationBodyMd5: string;
}

export interface DriftReport {
  missing: DbFunction[];
  drifted: DriftedFunction[];
  orphaned: string[];
  /**
   * Overloads the migrations demonstrably do not all define. Counts as a
   * failure alongside missing and drifted — reporting a known rebuild gap and
   * then exiting 0 would be the false-clean this tool exists to prevent.
   */
  underCovered: Array<{ signature: string; reason: string }>;
  /** Bodies not compared for a benign reason, with why — never silently skipped. */
  notCompared: Array<{ name: string; reason: string }>;
}

/** The whitespace rule the SQL side uses, so the two hashes are comparable. */
export function normalizeBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

const md5 = (s: string): string => createHash('md5').update(s).digest('hex');

/**
 * Body of a dollar-quoted function definition starting at `from`.
 *
 * Returns null when the definition is not a plain `AS $tag$ ... $tag$` — a DO
 * block, a string-literal body, or anything else this does not model. Callers
 * report those as not-compared rather than guessing, because a wrong DRIFTED is
 * worse than an absent one: it trains people to ignore the report.
 *
 * `to` bounds the search to the current statement, and is not optional in
 * practice. Without it a definition with a non-dollar body (`AS 'select 1'`)
 * scans past its own statement, finds the `$tag$` of the NEXT function in the
 * file, and hands back that function's body — so the first one carries a
 * foreign hash and is reported DRIFTED. Callers pass the start of the following
 * CREATE.
 *
 * One residual limit: a body containing the literal text `CREATE FUNCTION` (in
 * an EXECUTE string, say) shortens the window and yields null. That direction
 * is safe — NOT COMPARED rather than a wrong DRIFTED.
 */
/**
 * Blank out SQL comments so a commented-out definition is not read as a real one.
 *
 * `-- CREATE FUNCTION legacy() ...` matches the definition pattern perfectly,
 * and counting it would mark a database-only function as covered — the precise
 * false-clean this tool exists to prevent. (Prose like "-- Create function to
 * find schools" is already excluded by requiring the opening paren; a genuinely
 * commented-out statement is not.)
 *
 * Two properties matter:
 *   - Replacement is space-for-space so every index still lines up, and bodies
 *     can still be sliced out of the ORIGINAL string by offset.
 *   - Dollar-quoted regions are copied through untouched. A function body may
 *     legitimately contain `--`, and blanking inside one would change the body
 *     and produce phantom DRIFTED reports.
 *
 * Exported for tests.
 */
export function blankSqlComments(sql: string): string {
  const out = sql.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  let i = 0;
  while (i < sql.length) {
    const dollar = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i, i + 64));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      i = close === -1 ? sql.length : close + tag.length;
      continue;
    }
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      blank(i, end);
      i = end;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      // Postgres block comments nest.
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.startsWith('/*', j)) { depth++; j += 2; }
        else if (sql.startsWith('*/', j)) { depth--; j += 2; }
        else j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * The argument list of a definition whose name ends at `openParen`, normalised.
 *
 * Balanced-paren scan, because types carry their own parens (`numeric(10,2)`)
 * and defaults can too. Returns null if the parens never close.
 */
export function argSignatureAt(sql: string, openParen: number): string | null {
  let depth = 0;
  for (let i = openParen; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) {
        return sql
          .slice(openParen + 1, i)
          .replace(/\s+/g, ' ')
          // Normalise around commas too, or `f(uuid , text)` and
          // `f(uuid, text)` count as two distinct signatures and the
          // overload check under-reports.
          .replace(/\s*,\s*/g, ',')
          .trim()
          .toLowerCase();
      }
    }
  }
  return null;
}

function dollarQuotedBody(sql: string, from: number, to: number = sql.length): string | null {
  const open = /\bas\s+(\$[A-Za-z0-9_]*\$)/gi;
  open.lastIndex = from;
  const m = open.exec(sql);
  if (!m || m.index >= to) return null;
  const tag = m[1];
  const start = m.index + m[0].length;
  const end = sql.indexOf(tag, start);
  return end === -1 || end > to ? null : sql.slice(start, end);
}

/**
 * Every function name the migrations create, with the body a rebuild lands on.
 *
 * Files are read in sorted order and later definitions overwrite earlier ones,
 * which is how migrations actually apply — so a function created once and
 * `CREATE OR REPLACE`d twice is compared against the third body, not the first.
 *
 * The opening paren in the pattern is required so prose in a comment ("create a
 * function to ...") is not mistaken for a definition. Without it this
 * over-reports and the MISSING list silently shrinks, which is the one failure
 * mode that matters here.
 */
export function functionsDefinedInMigrations(dir = MIGRATIONS_DIR): Map<string, MigrationFunction> {
  const found = new Map<string, MigrationFunction>();

  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    // Match against the comment-blanked text so a commented-out definition is
    // not counted; slice bodies from `sql`, which the blanking keeps aligned.
    const scannable = blankSqlComments(sql);
    // No dotAll flag: the pattern spans newlines via \s, never a bare dot.
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    const matches = [...scannable.matchAll(re)];
    for (const [idx, m] of matches.entries()) {
      const name = m[1].toLowerCase();
      // Bound each body to its own statement — see dollarQuotedBody.
      const nextCreate = matches[idx + 1]?.index ?? sql.length;
      const body = dollarQuotedBody(sql, m.index!, nextCreate);
      const args = argSignatureAt(scannable, m.index! + m[0].length - 1);
      const prev = found.get(name);
      const argSignatures = prev?.argSignatures ?? new Set<string>();
      if (args !== null) argSignatures.add(args);
      found.set(name, {
        bodyMd5: body === null ? null : md5(normalizeBody(body)),
        argSignatures,
      });
    }
  }
  return found;
}

export function buildReport(
  db: DbFunction[],
  inMigrations: Map<string, MigrationFunction>,
): DriftReport {
  const dbNames = new Set(db.map(f => f.name));
  const overloads = new Map<string, number>();
  for (const f of db) overloads.set(f.name, (overloads.get(f.name) ?? 0) + 1);

  const missing: DbFunction[] = [];
  const drifted: DriftedFunction[] = [];
  const underCovered: Array<{ signature: string; reason: string }> = [];
  const notCompared: Array<{ name: string; reason: string }> = [];

  for (const f of db) {
    const mig = inMigrations.get(f.name);
    if (!mig) {
      missing.push(f);
      continue;
    }

    // Overloads share a name, so "the migration body" is ambiguous — and a name
    // with fewer distinct signatures in the migrations than overloads in the
    // database is partly un-rebuildable, which name-level matching would hide.
    const n = overloads.get(f.name) ?? 1;
    if (n > 1) {
      const defined = mig.argSignatures.size;
      if (defined < n) {
        underCovered.push({
          signature: f.signature,
          reason: `${n} overloads in the database, ${defined} distinct signature(s) in migrations — at least one overload cannot be rebuilt`,
        });
      } else {
        notCompared.push({
          name: f.signature,
          reason: `${n} overloads share this name; bodies not matched per signature`,
        });
      }
      continue;
    }

    if (mig.bodyMd5 === null) {
      notCompared.push({ name: f.signature, reason: 'definition is not a plain dollar-quoted body' });
      continue;
    }
    if (mig.bodyMd5 !== f.body_md5) drifted.push({ db: f, migrationBodyMd5: mig.bodyMd5 });
  }

  return {
    missing,
    drifted,
    orphaned: [...inMigrations.keys()].filter(n => !dbNames.has(n)).sort(),
    underCovered,
    notCompared,
  };
}

export function formatReport(report: DriftReport): string {
  const { missing, drifted, orphaned, underCovered, notCompared } = report;
  const lines: string[] = [];

  const tagsFor = (f: DbFunction): string => {
    const tags = [
      f.security_definer ? 'SECURITY DEFINER' : null,
      f.trigger_uses > 0 ? `${f.trigger_uses} trigger(s) — LIVE` : null,
    ].filter(Boolean);
    return tags.length ? `  [${tags.join(', ')}]` : '';
  };

  lines.push(`MISSING — the database has it, no migration creates it (${missing.length})`);
  if (!missing.length) lines.push('  none');
  for (const f of missing) lines.push(`  ${f.signature}${tagsFor(f)}`);

  lines.push('');
  lines.push(`DRIFTED — edited in place; a rebuild would produce a different body (${drifted.length})`);
  if (!drifted.length) lines.push('  none');
  for (const d of drifted) {
    lines.push(`  ${d.db.signature}${tagsFor(d.db)}`);
    lines.push(`      database: ${d.db.body_md5}   migrations: ${d.migrationBodyMd5}`);
  }

  lines.push('');
  lines.push(`UNDER-COVERED — an overload the migrations do not define (${underCovered.length})`);
  if (!underCovered.length) lines.push('  none');
  for (const u of underCovered) lines.push(`  ${u.signature}\n      ${u.reason}`);

  lines.push('');
  lines.push(`ORPHANED — a migration creates it, the database has none (${orphaned.length})`);
  if (!orphaned.length) lines.push('  none');
  for (const name of orphaned) lines.push(`  ${name}`);

  if (notCompared.length) {
    lines.push('');
    lines.push(`NOT COMPARED — present in both, body not checked (${notCompared.length})`);
    for (const n of notCompared) lines.push(`  ${n.name}\n      ${n.reason}`);
  }

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
      `MISSING and DRIFTED are still accurate for the functions the snapshot covers.`,
    );
  }

  const broken = report.missing.length + report.drifted.length + report.underCovered.length;
  if (broken) {
    console.error(
      `\nFAIL: ${report.missing.length} function(s) exist only in the database, ` +
      `${report.drifted.length} differ from what a rebuild would produce, ` +
      `${report.underCovered.length} overload(s) are not defined (SPE-116).`,
    );
    process.exit(1);
  }
  console.log('\nOK: every database function is reproducible from the migrations.');
}

if (require.main === module) main();
