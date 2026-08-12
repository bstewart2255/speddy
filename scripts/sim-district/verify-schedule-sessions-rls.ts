/**
 * SPE-8 — `schedule_sessions` RLS visibility guard, run with REAL signed-in sessions.
 *
 * Why a script and not a jest test: our unit tests mock the Supabase client, so
 * they cannot see RLS at all — they pass identically whether a policy returns
 * every row or none. This signs in as real sim personas and talks to PostgREST,
 * the same path the browser takes.
 *
 * Built for the SPE-8 sweep, which rewrites the two admin SELECT policies on
 * `schedule_sessions` to call `(select auth.uid())` instead of a bare
 * `auth.uid()`. That rewrite is supposed to be *semantically inert* — it only
 * changes how often Postgres evaluates the function, never what it returns. The
 * job here is to prove that rather than assume it, because "obviously inert" RLS
 * edits are exactly how `profiles_update` broke every self-serve profile write
 * for ~7 months (SPE-332).
 *
 * ## Usage
 *
 *   npm run sim:verify-schedule-sessions-rls -- --save before.json   # capture
 *   ...apply the migration...
 *   npm run sim:verify-schedule-sessions-rls -- --expect before.json # must match
 *
 * `--expect` fails on ANY difference in the visible row set, per persona. It
 * compares the actual set of session ids, not a count — a policy that swapped
 * one row for another would keep the count identical and must still fail.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Read-only: it
 * never writes, so it is safe to run against the fixture repeatedly.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { assertProjectRef, requireEnv } from './lib';
import { derivePassword, simEmail, persona } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');
assertProjectRef();

/**
 * Personas whose visibility is governed by the policies under test, plus the
 * ones that must NOT gain visibility from them.
 */
const SUBJECTS = [
  { key: 'dana', why: 'district_admin — reads via the district admin policy being rewritten' },
  { key: 'priya', why: 'site_admin @ Willow — reads via the site admin policy being rewritten' },
  { key: 'elena', why: 'site_admin @ Maple — second site, for cross-school isolation' },
  { key: 'theo', why: 'district_tech — must gain nothing from either admin policy' },
  { key: 'rachel', why: 'resource provider @ Willow — regression check on the untouched provider path' },
] as const;

interface Session {
  access_token: string;
  user: { id: string };
}

async function signIn(emailLocal: string): Promise<Session> {
  const email = simEmail(emailLocal);
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: derivePassword(secret, email) }),
  });
  const body = await res.json();
  if (!body?.access_token) {
    throw new Error(`sim login failed for ${emailLocal} — is the district seeded?`);
  }
  return body as Session;
}

/**
 * Every schedule_sessions id this session can SELECT.
 *
 * Paginated deliberately: PostgREST caps an unbounded select at 1000 rows, and a
 * silent truncation would make two different result sets look identical.
 */
async function visibleSessionIds(session: Session): Promise<string[]> {
  const page = 1000;
  const ids: string[] = [];
  for (let offset = 0; ; offset += page) {
    const res = await fetch(
      `${url}/rest/v1/schedule_sessions?select=id&order=id.asc&limit=${page}&offset=${offset}`,
      {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${session.access_token}`,
          Prefer: 'count=exact',
        },
      },
    );
    if (!res.ok) {
      throw new Error(`select failed (${res.status}): ${await res.text()}`);
    }
    const rows = (await res.json()) as { id: string }[];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < page) break;
  }
  return ids.sort();
}

interface Fingerprint {
  count: number;
  /** Hash of the sorted id list — catches a swapped row that leaves the count intact. */
  digest: string;
  ids: string[];
}

function fingerprint(ids: string[]): Fingerprint {
  return {
    count: ids.length,
    digest: createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 16),
    ids,
  };
}

function isSubset(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.every((x) => set.has(x));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // Note the -1 guard: `args[indexOf(flag) + 1]` silently resolves to args[0]
  // when the flag is absent, which made an absent --expect read the --save flag
  // itself as a filename.
  const flagValue = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const saveTo = flagValue('--save');
  const expectFrom = flagValue('--expect');
  for (const [flag, value] of [['--save', saveTo], ['--expect', expectFrom]] as const) {
    if (args.includes(flag) && !value) throw new Error(`${flag} needs a file path`);
  }

  const result: Record<string, Fingerprint> = {};
  for (const subject of SUBJECTS) {
    const p = persona(subject.key);
    const session = await signIn(p.emailLocal);
    const ids = await visibleSessionIds(session);
    result[subject.key] = fingerprint(ids);
    console.log(`  ${p.fullName.padEnd(24)} ${String(ids.length).padStart(5)} sessions   ${subject.why}`);
  }

  const failures: string[] = [];

  // Invariants that must hold regardless of the rewrite. These encode intent, so
  // they would also catch a policy that is inert but was wrong to begin with.
  if (result.dana.count === 0) {
    failures.push('district_admin (dana) sees 0 sessions — the district admin policy returns nothing');
  }
  if (result.priya.count === 0) {
    failures.push('site_admin (priya) sees 0 sessions — the site admin policy returns nothing');
  }
  if (result.rachel.count === 0) {
    failures.push('provider (rachel) sees 0 sessions — the provider path regressed');
  }
  if (!isSubset(result.priya.ids, result.dana.ids)) {
    failures.push("site_admin sees sessions the district_admin cannot — school scope escapes its district");
  }
  if (result.priya.ids.some((id) => result.elena.ids.includes(id))) {
    failures.push('site admins at different schools share visible sessions — cross-school isolation broken');
  }

  if (expectFrom) {
    const before = JSON.parse(readFileSync(expectFrom, 'utf8')) as Record<string, Fingerprint>;
    for (const subject of SUBJECTS) {
      const a = before[subject.key];
      const b = result[subject.key];
      if (!a) {
        failures.push(`${subject.key}: no baseline recorded`);
        continue;
      }
      if (a.digest !== b.digest) {
        const gained = b.ids.filter((id) => !a.ids.includes(id));
        const lost = a.ids.filter((id) => !b.ids.includes(id));
        failures.push(
          `${subject.key}: visible set CHANGED (${a.count} -> ${b.count}); ` +
            `gained ${gained.length}, lost ${lost.length}`,
        );
      }
    }
    if (failures.length === 0) {
      console.log(`\nVisible sets identical to ${expectFrom} for all ${SUBJECTS.length} personas.`);
    }
  }

  if (saveTo) {
    writeFileSync(saveTo, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nBaseline written to ${saveTo}`);
  }

  if (failures.length > 0) {
    console.error('\nFAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nschedule_sessions RLS OK.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
