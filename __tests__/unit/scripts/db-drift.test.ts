/**
 * SPE-116: the drift checker's comparison logic.
 *
 * The failure mode worth guarding is over-matching. If the migration scanner
 * counts prose in a comment ("create a function to ...") as a definition, the
 * MISSING list silently shrinks and the checker reports clean while the repo
 * still cannot rebuild the database — the exact silence this script exists to
 * end. All data is fictional.
 */

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildReport,
  formatReport,
  functionsDefinedInMigrations,
  type DbFunction,
} from '@/scripts/db-drift/check';

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spe116-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

const fn = (over: Partial<DbFunction> & { name: string }): DbFunction => ({
  signature: `${over.name}()`,
  security_definer: false,
  body_md5: 'd41d8cd98f00b204e9800998ecf8427e',
  trigger_uses: 0,
  ...over,
});

describe('functionsDefinedInMigrations (SPE-116)', () => {
  it('finds CREATE and CREATE OR REPLACE, schema-qualified or not', () => {
    const dir = migrationsDir({
      '20260101_a.sql': 'CREATE FUNCTION handle_signup() RETURNS trigger AS $$ BEGIN END $$;',
      '20260102_b.sql': 'create or replace function public.sync_rows(uuid) returns void as $$ $$;',
      '20260103_c.sql': 'CREATE OR REPLACE FUNCTION "quoted_name"() RETURNS void AS $$ $$;',
    });
    expect(functionsDefinedInMigrations(dir)).toEqual(
      new Set(['handle_signup', 'sync_rows', 'quoted_name']),
    );
  });

  it('does not mistake prose in a comment for a definition', () => {
    const dir = migrationsDir({
      '20260101_a.sql': [
        '-- We create a function to keep the mirror in sync, and another',
        '-- CREATE FUNCTION with no parens mentioned in passing.',
        'CREATE FUNCTION real_one() RETURNS void AS $$ $$;',
      ].join('\n'),
    });
    // "to" and "with" would both be captured without the required paren.
    expect(functionsDefinedInMigrations(dir)).toEqual(new Set(['real_one']));
  });

  it('ignores non-sql files', () => {
    const dir = migrationsDir({
      'notes.md': 'CREATE FUNCTION should_be_ignored() RETURNS void AS $$ $$;',
      '20260101_a.sql': 'CREATE FUNCTION counted() RETURNS void AS $$ $$;',
    });
    expect(functionsDefinedInMigrations(dir)).toEqual(new Set(['counted']));
  });
});

describe('buildReport (SPE-116)', () => {
  it('flags a database function with no CREATE anywhere as MISSING', () => {
    const report = buildReport(
      [fn({ name: 'handle_new_user', trigger_uses: 1, security_definer: true }), fn({ name: 'covered' })],
      new Set(['covered']),
    );
    expect(report.missing.map(f => f.name)).toEqual(['handle_new_user']);
    expect(report.orphaned).toEqual([]);
  });

  it('reports every overload of a missing function, since each needs its own CREATE', () => {
    const report = buildReport(
      [
        fn({ name: 'upsert_bell_schedule', signature: 'upsert_bell_schedule(uuid,uuid)' }),
        fn({ name: 'upsert_bell_schedule', signature: 'upsert_bell_schedule(uuid,text)' }),
      ],
      new Set(),
    );
    expect(report.missing.map(f => f.signature)).toEqual([
      'upsert_bell_schedule(uuid,uuid)',
      'upsert_bell_schedule(uuid,text)',
    ]);
  });

  it('flags a migration-only function as ORPHANED, not MISSING', () => {
    const report = buildReport([fn({ name: 'still_here' })], new Set(['still_here', 'dropped_later']));
    expect(report.missing).toEqual([]);
    expect(report.orphaned).toEqual(['dropped_later']);
  });

  it('reports nothing when the repo and database agree', () => {
    const report = buildReport([fn({ name: 'a' }), fn({ name: 'b' })], new Set(['a', 'b']));
    expect(report).toEqual({ missing: [], orphaned: [] });
  });
});

describe('formatReport (SPE-116)', () => {
  it('marks a live trigger function so it cannot be skimmed past', () => {
    const out = formatReport(
      buildReport([fn({ name: 'handle_new_user', trigger_uses: 1, security_definer: true })], new Set()),
    );
    expect(out).toContain('SECURITY DEFINER');
    expect(out).toContain('1 trigger(s) — LIVE');
  });

  it('says "none" rather than printing an empty list', () => {
    expect(formatReport({ missing: [], orphaned: [] })).toContain('none');
  });
});
