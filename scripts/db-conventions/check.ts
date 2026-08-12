/**
 * SPE-441 — CI guard for the database hardening conventions.
 *
 * Three conventions in this codebase have each been established by a deliberate
 * sweep, documented in a migration comment, and then broken again by the next
 * migration to touch the same surface — in one case within 48 hours. Every
 * instance was caught late (by an advisor run or a review bot), never by a gate.
 * This is the gate.
 *
 * The conventions, and the incident behind each:
 *
 *   R1  search-path-pg-temp
 *       A public-schema SECURITY DEFINER function must pin `search_path` with
 *       `pg_temp` LAST. Postgres searches pg_temp implicitly first unless it is
 *       named explicitly, so a caller who can create temp objects could shadow an
 *       unqualified relation reference under definer privileges.
 *       Swept by 20260721_zz_harden_security_definer_search_path.sql (SPE-289);
 *       broken two days later by the Groups v2 phase-2 RPCs, one of which
 *       re-CREATE OR REPLACEd a function the sweep had already hardened.
 *
 *   R2  policy-explicit-role
 *       CREATE POLICY must name its role with `TO authenticated` (or narrower).
 *       The statement defaults to `TO public`, which includes `anon`.
 *       Swept by 20260531_scope_public_select_policies_to_authenticated.sql;
 *       silently reverted on `profiles` — a FERPA-relevant table — by a later
 *       DROP/CREATE rewrite, caught only by a review bot on PR #805.
 *
 *   R3  policy-inlined-auth-fn
 *       A policy must call `auth.uid()` as `(select auth.uid())` so Postgres
 *       evaluates it once per query instead of once per row. Bare calls are what
 *       the `auth_rls_initplan` advisor flags; that count went from 36 to 56
 *       between SPE-8 being filed and the 2026-08-12 grooming pass, with no sweep
 *       in between — every new one arrived with a newly shipped feature.
 *
 * ## How it fails
 *
 * A ratchet, not a cliff. `baseline.json` records the violations that already
 * existed when this landed, so the gate fails only on violations a change
 * *introduces*. Existing debt is tracked (and counted) rather than blocking every
 * PR until someone clears it — the sweeps that clear it are separate tickets
 * (SPE-8, SPE-279).
 *
 * As debt is cleared the baseline should shrink: run with --update-baseline after
 * a sweep and commit the smaller file.
 *
 * The baseline count is NOT comparable to a Supabase advisor count and is much
 * larger. This reads 359 migration files, so it sees every policy ever written —
 * including ones long since dropped or replaced by a later migration. The advisor
 * sees only what is live in the database today. Use the advisor to measure real
 * debt; use this to stop new debt arriving.
 *
 * ## Usage
 *
 *   npm run lint:db                    # check (also runs inside npm test)
 *   npm run lint:db -- --update-baseline
 *   npm run lint:db -- --list          # print every finding, baselined or not
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
export const BASELINE_PATH = join(process.cwd(), 'scripts', 'db-conventions', 'baseline.json');

export type RuleId = 'search-path-pg-temp' | 'policy-explicit-role' | 'policy-inlined-auth-fn';

export interface Finding {
  rule: RuleId;
  file: string;
  /** Function or policy name — stable across reformatting, unlike a line number. */
  identifier: string;
  line: number;
  detail: string;
}

/** Stable identity for baselining. Deliberately excludes the line number. */
export function keyOf(f: Finding): string {
  return `${f.rule}::${f.file}::${f.identifier}`;
}

interface Statement {
  text: string;
  offset: number;
}

/**
 * Split SQL into statements with comments stripped.
 *
 * Hand-rolled rather than regexed because every one of these matters here:
 * dollar-quoted function bodies contain semicolons and policy-shaped text;
 * migration comments in this repo quote the very conventions we check (the
 * SPE-394 migration has a literal "TO authenticated, NOT public" in a comment,
 * which a naive grep reads as compliance); and string literals contain both.
 */
export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = [];
  let buf = '';
  let stmtStart = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < n && sql.slice(i, i + 2) !== '*/') i++;
      i += 2;
      continue;
    }
    if (sql[i] === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      buf += sql.slice(start, i);
      continue;
    }
    if (sql[i] === '"') {
      const start = i;
      i++;
      while (i < n && sql[i] !== '"') i++;
      i++;
      buf += sql.slice(start, i);
      continue;
    }
    if (sql[i] === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (tag) {
        const start = i;
        i += tag[0].length;
        const end = sql.indexOf(tag[0], i);
        i = end === -1 ? n : end + tag[0].length;
        buf += sql.slice(start, i);
        continue;
      }
    }
    if (sql[i] === ';') {
      if (buf.trim()) out.push({ text: buf.trim(), offset: stmtStart });
      buf = '';
      i++;
      stmtStart = i;
      continue;
    }
    if (!buf.trim() && /\s/.test(sql[i])) stmtStart = i + 1;
    buf += sql[i];
    i++;
  }
  if (buf.trim()) out.push({ text: buf.trim(), offset: stmtStart });
  return out;
}

function lineAt(sql: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < sql.length; i++) if (sql[i] === '\n') line++;
  return line;
}

/**
 * A function's attributes minus its body.
 *
 * Removes the dollar-quoted body rather than truncating at it: both
 * `... SECURITY DEFINER SET search_path = x AS $$ body $$` and
 * `... AS $$ body $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = x` are
 * legal, and the second form is used by a dozen-odd migrations here. Truncating
 * at the first dollar quote reports those as unpinned when they are pinned.
 * Dropping the body also stops a `SET search_path` written *inside* a body from
 * reading as the function's own pin.
 */
function functionAttributes(text: string): string {
  return text.replace(/\$([A-Za-z_0-9]*)\$[\s\S]*?\$\1\$/g, ' ');
}

const SEARCH_PATH_RE =
  /\bset\s+search_path\s*(?:=|\bto\b)\s*([^;]*?)(?=\s+\bas\b|\s+\blanguage\b|\s+\bsecurity\b|\s+\bstable\b|\s+\bimmutable\b|\s+\bvolatile\b|\s+\bstrict\b|\s+\bparallel\b|\s+\bcost\b|\s+\brows\b|\s+\bset\b|\s*$)/i;

/**
 * Note on `CREATE` followed by `ALTER FUNCTION … SET search_path` in the same
 * migration: that does pin the function, but this rule still reports the CREATE.
 *
 * Recognising it safely means matching the ALTER to the right function, and only
 * the argument types can do that — `f(text)` and `f(integer)` share a name and an
 * arity, so pinning one would otherwise suppress the finding on the other. That
 * comparison needs type normalisation across two different syntaxes (CREATE
 * carries parameter names, modes and defaults; ALTER carries bare types), which
 * is more machinery than the case deserves and a bug source in its own right.
 *
 * So it fails closed instead: write the pin into the CREATE, or baseline the
 * finding with a note. A missing suppression is visible and cheap; a wrong one
 * silently hides an unpinned SECURITY DEFINER function, which is the failure
 * this whole file exists to prevent.
 */
function checkFunction(text: string, file: string, line: number): Finding[] {
  const attrs = functionAttributes(text);
  if (!/\bsecurity\s+definer\b/i.test(attrs)) return [];

  const name = /\bfunction\s+(?:public\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i.exec(text);
  const identifier = name ? (name[1] ?? name[2]) : '<unnamed>';
  const sp = SEARCH_PATH_RE.exec(attrs);

  if (!sp) {
    return [{
      rule: 'search-path-pg-temp',
      file,
      identifier,
      line,
      detail: `SECURITY DEFINER function "${identifier}" sets no search_path. Add: SET search_path = public, pg_temp`,
    }];
  }

  const parts = sp[1].split(',').map((p) => p.trim().replace(/["']/g, '')).filter(Boolean);
  if (parts[parts.length - 1]?.toLowerCase() !== 'pg_temp') {
    return [{
      rule: 'search-path-pg-temp',
      file,
      identifier,
      line,
      detail: `SECURITY DEFINER function "${identifier}" has search_path = ${parts.join(', ')} — pg_temp must be listed LAST`,
    }];
  }
  return [];
}

/**
 * The region a TO clause can legally occupy: after `ON <table>`, before
 * USING / WITH CHECK.
 *
 * Scoping matters more than it looks. Searching the whole header finds the "to"
 * in the policy *name* — and "Allow authenticated users to read X" is this
 * repo's dominant naming idiom, so a plain search reports dozens of TO-less
 * policies as compliant. Quoted identifiers are stripped for the same reason.
 */
function policyRoleRegion(text: string): string {
  const on = /\bon\s+(?:public\s*\.\s*)?(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)/i.exec(text);
  const afterTable = on ? text.slice(on.index + on[0].length) : text;
  const clause = /\b(using|with\s+check)\b/i.exec(afterTable);
  const region = clause ? afterTable.slice(0, clause.index) : afterTable;
  return region.replace(/"[^"]*"/g, ' ');
}

function checkPolicy(text: string, file: string, line: number): Finding[] {
  const findings: Finding[] = [];
  // Identifiers may be quoted and contain spaces — this repo has policies named
  // "Admins can view staff hours". Matching only the leading word would collapse
  // several distinct policies onto one baseline key and mask a new violation.
  const name = /\bcreate\s+policy\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i.exec(text);
  const table = /\bon\s+(?:public\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i.exec(text);
  const identifier = `${table ? (table[1] ?? table[2]) : '?'}.${name ? (name[1] ?? name[2]) : '<unnamed>'}`;

  // TO takes a comma-separated list and is the last clause before USING, so
  // everything after it is roles. Reading only the first would let a safe role
  // in front hide an unsafe one behind it — `TO authenticated, anon` is still
  // reachable without signing in.
  const toClause = /\bto\s+([\s\S]+)$/i.exec(policyRoleRegion(text));
  if (!toClause) {
    findings.push({
      rule: 'policy-explicit-role',
      file,
      identifier,
      line,
      detail: `Policy "${identifier}" names no role, so it defaults to TO public (which includes anon). Add: TO authenticated`,
    });
  } else {
    const roles = toClause[1].split(',').map((r) => r.trim().replace(/["']/g, '')).filter(Boolean);
    const unsafe = roles.filter((r) => /^(public|anon)$/i.test(r));
    if (unsafe.length > 0) {
      // Naming the unsafe role explicitly is the same exposure as defaulting to it.
      findings.push({
        rule: 'policy-explicit-role',
        file,
        identifier,
        line,
        detail: `Policy "${identifier}" grants TO ${unsafe.join(', ').toLowerCase()}${
          roles.length > unsafe.length ? ` (in the list: ${roles.join(', ')})` : ''
        }, which is reachable without signing in. Use TO authenticated (or narrower)`,
      });
    }
  }

  // Strip the compliant form, then anything left is a bare per-row call. The
  // optional alias covers `(select auth.uid() as uid)` — how Postgres deparses
  // the compliant form, and so what anyone copying out of pg_policies will paste.
  const stripped = text.replace(
    /\(\s*select\s+auth\s*\.\s*(uid|role|jwt|email)\s*\(\s*\)(\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\)/gi,
    '',
  );
  const bare = /\bauth\s*\.\s*(uid|role|jwt|email)\s*\(/i.exec(stripped);
  if (bare) {
    findings.push({
      rule: 'policy-inlined-auth-fn',
      file,
      identifier,
      line,
      detail: `Policy "${identifier}" calls auth.${bare[1]}() directly — it is re-evaluated per row. Wrap it: (select auth.${bare[1]}())`,
    });
  }
  return findings;
}

/**
 * One slice per CREATE POLICY in a statement.
 *
 * A DO block is a single dollar-quoted statement that can hold many policies —
 * 20250715_add_missing_rls_policies.sql has 35 across 8 blocks. Checking the
 * statement once would examine the first policy in each block, blame its name
 * for any later violation, and let a compliant first policy launder every
 * violating one behind it.
 */
function policySlices(text: string): string[] {
  const re = /\bcreate\s+policy\b/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) starts.push(m.index);
  return starts.map((start, i) => {
    const slice = text.slice(start, i + 1 < starts.length ? starts[i + 1] : text.length);
    // Inside a DO block each EXECUTE ends at a semicolon; at top level the
    // splitter already removed them, so this is a no-op there.
    const end = slice.indexOf(';');
    return end === -1 ? slice : slice.slice(0, end);
  });
}

export function scanFile(sql: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const statements = splitStatements(sql);

  for (const stmt of statements) {
    const line = lineAt(sql, stmt.offset);
    if (/\bcreate\s+(or\s+replace\s+)?function\b/i.test(stmt.text)) {
      // A CREATE POLICY inside a function body defines what a later *call* does,
      // not a policy this migration creates — so it is deliberately not checked.
      findings.push(...checkFunction(stmt.text, file, line));
    } else {
      for (const slice of policySlices(stmt.text)) {
        findings.push(...checkPolicy(slice, file, line));
      }
    }
  }
  return findings;
}

export function scanAll(dir: string = MIGRATIONS_DIR): Finding[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const findings: Finding[] = [];
  for (const file of files) {
    findings.push(...scanFile(readFileSync(join(dir, file), 'utf8'), file));
  }
  return findings;
}

export function loadBaseline(path: string = BASELINE_PATH): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return new Set<string>(parsed.violations ?? []);
  } catch {
    return new Set<string>();
  }
}

export interface CheckResult {
  all: Finding[];
  introduced: Finding[];
  staleBaselineKeys: string[];
}

export function runCheck(dir?: string, baselinePath?: string): CheckResult {
  const all = scanAll(dir);
  const baseline = loadBaseline(baselinePath);
  const liveKeys = new Set(all.map(keyOf));
  return {
    all,
    introduced: all.filter((f) => !baseline.has(keyOf(f))),
    staleBaselineKeys: [...baseline].filter((k) => !liveKeys.has(k)),
  };
}

const RULE_HELP: Record<RuleId, string> = {
  'search-path-pg-temp': 'SET search_path = public, pg_temp   (pg_temp LAST)',
  'policy-explicit-role': 'CREATE POLICY ... TO authenticated   (never the TO public default)',
  'policy-inlined-auth-fn': 'USING ((select auth.uid()) = ...)   (not a bare auth.uid())',
};

function report(findings: Finding[]): void {
  const byRule = new Map<RuleId, Finding[]>();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule)!.push(f);
  }
  for (const [rule, group] of byRule) {
    console.error(`\n  ${rule} — expected: ${RULE_HELP[rule]}`);
    for (const f of group) console.error(`    ${f.file}:${f.line}  ${f.detail}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const { all, introduced, staleBaselineKeys } = runCheck();

  if (args.includes('--update-baseline')) {
    const violations = all.map(keyOf).sort();
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          $comment:
            'SPE-441 — pre-existing violations of the DB hardening conventions, recorded so the ' +
            'gate fails only on newly introduced ones. Regenerate with: npm run lint:db -- --update-baseline. ' +
            'This list should only ever shrink.',
          generated: new Date().toISOString().slice(0, 10),
          violations,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Baseline updated: ${violations.length} known violations.`);
    return;
  }

  const listAll = args.includes('--list');
  if (listAll) {
    console.error(`All ${all.length} findings across supabase/migrations:`);
    report(all);
  }

  if (staleBaselineKeys.length > 0) {
    console.log(
      `Note: ${staleBaselineKeys.length} baseline entr${staleBaselineKeys.length === 1 ? 'y no longer exists' : 'ies no longer exist'} — ` +
        'debt was cleared. Prune with: npm run lint:db -- --update-baseline',
    );
  }

  if (introduced.length === 0) {
    console.log(`db conventions OK — 0 new violations (${all.length} known, tracked in baseline.json).`);
    return;
  }

  console.error(
    `\ndb conventions: ${introduced.length} new violation${introduced.length === 1 ? '' : 's'} ` +
      'introduced by this change.\n' +
      'These conventions have each been swept once and broken again — see scripts/db-conventions/check.ts ' +
      'for the incident behind each rule.',
  );
  if (!listAll) report(introduced);
  console.error(
    '\nIf a violation is deliberate and justified, add its key to scripts/db-conventions/baseline.json ' +
      'with a note in the PR explaining why.\n',
  );
  process.exit(1);
}

if (process.argv[1] && /db-conventions[\\/]check\.ts$/.test(process.argv[1])) {
  main();
}
