/**
 * SPE-116: the drift checker's comparison logic.
 *
 * Two failure modes are worth guarding, both of which make the checker report
 * clean while the repo still cannot rebuild the database — the exact silence it
 * exists to end:
 *
 *   - over-matching the migration scan, so prose in a comment counts as a
 *     definition and MISSING shrinks;
 *   - comparing names only, so a body edited in place (the SPE-305 shape) is
 *     invisible.
 *
 * All data is fictional.
 */

import { createHash } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  argSignatureAt,
  blankSqlComments,
  buildReport,
  formatReport,
  functionsDefinedInMigrations,
  normalizeBody,
  type DbFunction,
} from '@/scripts/db-drift/check';

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spe116-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

const bodyHash = (body: string): string =>
  createHash('md5').update(normalizeBody(body)).digest('hex');

const fn = (over: Partial<DbFunction> & { name: string }): DbFunction => ({
  signature: `${over.name}()`,
  security_definer: false,
  body_md5: 'unset',
  trigger_uses: 0,
  ...over,
});

const define = (name: string, body: string): string =>
  `CREATE OR REPLACE FUNCTION public.${name}() RETURNS void AS $function$${body}$function$;`;

describe('blankSqlComments (SPE-116)', () => {
  it('blanks a commented-out definition so it is not read as real', () => {
    const sql = '-- CREATE FUNCTION legacy() RETURNS void AS $$ x $$;\nCREATE FUNCTION live() ...';
    const out = blankSqlComments(sql);
    expect(out).not.toContain('legacy');
    expect(out).toContain('CREATE FUNCTION live()');
  });

  it('keeps every index aligned so bodies can still be sliced from the original', () => {
    const sql = '-- gone\nCREATE FUNCTION f() AS $$ body $$;';
    const out = blankSqlComments(sql);
    expect(out).toHaveLength(sql.length);
    expect(out.indexOf('CREATE')).toBe(sql.indexOf('CREATE'));
  });

  it('leaves comment characters INSIDE a function body untouched', () => {
    // Blanking here would change the body and produce a phantom DRIFTED report.
    const sql = 'CREATE FUNCTION f() AS $function$ BEGIN -- keep me\n RETURN 1; END $function$;';
    expect(blankSqlComments(sql)).toContain('-- keep me');
  });

  it('handles nested block comments', () => {
    const sql = '/* outer /* inner */ still comment */ CREATE FUNCTION after() (';
    const out = blankSqlComments(sql);
    expect(out).not.toContain('inner');
    expect(out).toContain('CREATE FUNCTION after()');
  });
});

describe('argSignatureAt (SPE-116)', () => {
  it('reads a balanced argument list, including types that carry parens', () => {
    const sql = 'CREATE FUNCTION f(a numeric(10,2), b text)';
    expect(argSignatureAt(sql, sql.indexOf('('))).toBe('a numeric(10,2),b text');
  });

  it('normalises whitespace and case so one signature is not counted twice', () => {
    const a = 'f(  UUID ,\n  Text )';
    const b = 'f(uuid, text)';
    expect(argSignatureAt(a, a.indexOf('('))).toBe(argSignatureAt(b, b.indexOf('(')));
  });

  it('returns null when the parens never close', () => {
    const sql = 'CREATE FUNCTION f(a uuid';
    expect(argSignatureAt(sql, sql.indexOf('('))).toBeNull();
  });
});

describe('functionsDefinedInMigrations — coverage guards (SPE-116)', () => {
  it('does not count a commented-out definition as coverage', () => {
    // The false-clean this tool exists to prevent: a live database-only
    // function looking covered because an old definition is commented out.
    const dir = migrationsDir({
      '20260101_a.sql': `-- ${define('legacy', ' old body ')}\n${define('live_one', ' x ')}`,
    });
    expect([...functionsDefinedInMigrations(dir).keys()]).toEqual(['live_one']);
  });

  it('counts distinct signatures, not repeated revisions of the same one', () => {
    // Two revisions of f(uuid) must not stand in as coverage for f(text).
    const dir = migrationsDir({
      '20260101_a.sql': 'CREATE FUNCTION f(a uuid) RETURNS void AS $$ v1 $$;',
      '20260102_b.sql': 'CREATE OR REPLACE FUNCTION f(a uuid) RETURNS void AS $$ v2 $$;',
    });
    expect(functionsDefinedInMigrations(dir).get('f')?.argSignatures).toEqual(new Set(['a uuid']));
  });

  it('records each genuinely distinct overload', () => {
    const dir = migrationsDir({
      '20260101_a.sql': [
        'CREATE FUNCTION f(a uuid) RETURNS void AS $$ x $$;',
        'CREATE FUNCTION f(a text) RETURNS void AS $$ y $$;',
      ].join('\n'),
    });
    expect(functionsDefinedInMigrations(dir).get('f')?.argSignatures).toEqual(
      new Set(['a uuid', 'a text']),
    );
  });
});

describe('functionsDefinedInMigrations (SPE-116)', () => {
  it('finds CREATE and CREATE OR REPLACE, schema-qualified or not', () => {
    const dir = migrationsDir({
      '20260101_a.sql': 'CREATE FUNCTION handle_signup() RETURNS trigger AS $$ BEGIN END $$;',
      '20260102_b.sql': 'create or replace function public.sync_rows(uuid) returns void as $$ x $$;',
      '20260103_c.sql': 'CREATE OR REPLACE FUNCTION "quoted_name"() RETURNS void AS $$ y $$;',
    });
    expect([...functionsDefinedInMigrations(dir).keys()].sort())
      .toEqual(['handle_signup', 'quoted_name', 'sync_rows']);
  });

  it('does not mistake prose in a comment for a definition', () => {
    const dir = migrationsDir({
      '20260101_a.sql': [
        '-- We create a function to keep the mirror in sync, and another',
        '-- CREATE FUNCTION with no parens mentioned in passing.',
        define('real_one', ' BEGIN END; '),
      ].join('\n'),
    });
    // "to" and "with" would both be captured without the required paren.
    expect([...functionsDefinedInMigrations(dir).keys()]).toEqual(['real_one']);
  });

  it('takes the LAST definition, because that is where a rebuild lands', () => {
    const dir = migrationsDir({
      '20260101_a.sql': define('evolving', ' first '),
      '20260103_c.sql': define('evolving', ' third '),
      '20260102_b.sql': define('evolving', ' second '),
    });
    const found = functionsDefinedInMigrations(dir).get('evolving');
    expect(found).toEqual({ bodyMd5: bodyHash(' third '), argSignatures: new Set(['']) });
  });

  it('records a body it cannot parse as null rather than guessing', () => {
    const dir = migrationsDir({
      '20260101_a.sql': "CREATE FUNCTION odd_one() RETURNS void AS 'select 1' LANGUAGE sql;",
    });
    expect(functionsDefinedInMigrations(dir).get('odd_one')?.bodyMd5).toBeNull();
  });

  it('does not let a non-dollar-quoted definition steal the next function\'s body', () => {
    // The scan used to run to end-of-file, so odd_one picked up later_one's
    // $function$ body and got reported DRIFTED against a body that was never
    // its own. The single-function test above passes either way, which is why
    // both definitions have to live in one file here.
    const dir = migrationsDir({
      '20260101_a.sql': [
        "CREATE FUNCTION odd_one() RETURNS void AS 'select 1' LANGUAGE sql;",
        define('later_one', ' BEGIN END; '),
      ].join('\n'),
    });
    const found = functionsDefinedInMigrations(dir);
    expect(found.get('odd_one')?.bodyMd5).toBeNull();
    expect(found.get('later_one')?.bodyMd5).toBe(bodyHash(' BEGIN END; '));
  });

  it('ignores non-sql files', () => {
    const dir = migrationsDir({
      'notes.md': define('should_be_ignored', ' x '),
      '20260101_a.sql': define('counted', ' x '),
    });
    expect([...functionsDefinedInMigrations(dir).keys()]).toEqual(['counted']);
  });
});

describe('buildReport — MISSING (SPE-116)', () => {
  it('flags a database function with no CREATE anywhere', () => {
    const report = buildReport(
      [fn({ name: 'handle_new_user', trigger_uses: 1, security_definer: true }), fn({ name: 'covered', body_md5: 'h' })],
      new Map([['covered', { bodyMd5: 'h', argSignatures: new Set(['']) }]]),
    );
    expect(report.missing.map(f => f.name)).toEqual(['handle_new_user']);
    expect(report.orphaned).toEqual([]);
  });

  it('flags a migration-only function as ORPHANED, not MISSING', () => {
    const report = buildReport(
      [fn({ name: 'still_here', body_md5: 'h' })],
      new Map([
        ['still_here', { bodyMd5: 'h', argSignatures: new Set(['']) }],
        ['dropped_later', { bodyMd5: 'z', argSignatures: new Set(['']) }],
      ]),
    );
    expect(report.missing).toEqual([]);
    expect(report.orphaned).toEqual(['dropped_later']);
  });
});

describe('buildReport — DRIFTED, the SPE-305 shape (SPE-116)', () => {
  it('catches a body edited in place even though the name is present', () => {
    const report = buildReport(
      [fn({ name: 'batch_rpc', body_md5: bodyHash(' uss.site_id = p_school_site ') })],
      new Map([['batch_rpc', { bodyMd5: bodyHash(' ps.school_site = p_school_site '), argSignatures: new Set(['']) }]]),
    );
    expect(report.missing).toEqual([]);
    expect(report.drifted.map(d => d.db.name)).toEqual(['batch_rpc']);
  });

  it('does not call reformatting drift', () => {
    const report = buildReport(
      [fn({ name: 'tidy', body_md5: bodyHash('BEGIN   RETURN 1;   END') })],
      new Map([['tidy', { bodyMd5: bodyHash('BEGIN\n  RETURN 1;\nEND'), argSignatures: new Set(['']) }]]),
    );
    expect(report.drifted).toEqual([]);
  });

  it('reports an unparseable body as not-compared instead of drifted', () => {
    const report = buildReport(
      [fn({ name: 'odd_one', body_md5: 'whatever' })],
      new Map([['odd_one', { bodyMd5: null, argSignatures: new Set(['']) }]]),
    );
    expect(report.drifted).toEqual([]);
    expect(report.notCompared[0].reason).toMatch(/dollar-quoted/);
  });
});

describe('buildReport — overloads (SPE-116)', () => {
  it('says so when a name has more overloads than CREATEs, rather than reporting it covered', () => {
    const report = buildReport(
      [
        fn({ name: 'upsert_bell_schedule', signature: 'upsert_bell_schedule(uuid,uuid)', body_md5: 'a' }),
        fn({ name: 'upsert_bell_schedule', signature: 'upsert_bell_schedule(uuid,text)', body_md5: 'b' }),
      ],
      new Map([['upsert_bell_schedule', { bodyMd5: 'a', argSignatures: new Set(['uuid,uuid']) }]]),
    );
    expect(report.missing).toEqual([]);
    expect(report.underCovered).toHaveLength(2);
    expect(report.underCovered[0].reason).toMatch(/2 overloads.*1 distinct signature.*cannot be rebuilt/);
  });

  it('does not claim per-signature body matching when overloads share a name', () => {
    const report = buildReport(
      [
        fn({ name: 'both', signature: 'both(uuid)', body_md5: 'a' }),
        fn({ name: 'both', signature: 'both(text)', body_md5: 'b' }),
      ],
      new Map([['both', { bodyMd5: 'a', argSignatures: new Set(['uuid','text']) }]]),
    );
    expect(report.drifted).toEqual([]);
    expect(report.underCovered).toEqual([]);
    expect(report.notCompared.every(n => /overloads share this name/.test(n.reason))).toBe(true);
  });
});

describe('formatReport (SPE-116)', () => {
  it('marks a live trigger function so it cannot be skimmed past', () => {
    const out = formatReport(
      buildReport([fn({ name: 'handle_new_user', trigger_uses: 1, security_definer: true })], new Map()),
    );
    expect(out).toContain('SECURITY DEFINER');
    expect(out).toContain('1 trigger(s) — LIVE');
  });

  it('shows both hashes for a drifted function', () => {
    const out = formatReport(
      buildReport(
        [fn({ name: 'batch_rpc', body_md5: 'aaaa' })],
        new Map([['batch_rpc', { bodyMd5: 'bbbb', argSignatures: new Set(['']) }]]),
      ),
    );
    expect(out).toContain('database: aaaa');
    expect(out).toContain('migrations: bbbb');
  });

  it('says "none" under each empty section rather than printing a bare heading', () => {
    const out = formatReport({ missing: [], drifted: [], orphaned: [], underCovered: [], notCompared: [] });
    // Match the list entry exactly — the ORPHANED heading itself ends in
    // "the database has none", which a substring count would pick up too.
    const emptyLists = out.split('\n').filter(line => line === '  none');
    expect(emptyLists).toHaveLength(4);
    // And nothing is reported when the two sides agree.
    expect(out).not.toContain('NOT COMPARED');
  });
});
