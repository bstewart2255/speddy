/**
 * Shared plumbing for the sim-district scripts: env loading, admin client,
 * preflight checks (spec §8), sim auth-user resolution, and small helpers.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import {
  ALL_SIM_EMAILS,
  DISTRICT,
  SCHOOLS,
  SIM_EMAIL_DOMAIN,
  SUPABASE_PROJECT_REF,
} from './manifest';

config({ path: '.env.local' });

export type Admin = SupabaseClient;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name} (expected in .env.local).`);
    process.exit(1);
  }
  return value;
}

export function createAdmin(): Admin {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Preflight (a): the URL's project ref must equal the manifest pin. */
export function assertProjectRef(): void {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const host = new URL(url).hostname; // <ref>.supabase.co
  const ref = host.split('.')[0];
  if (ref !== SUPABASE_PROJECT_REF) {
    console.error(
      `Preflight FAILED: connected project ref "${ref}" does not match the manifest pin ` +
        `"${SUPABASE_PROJECT_REF}". Refusing to touch this database.`,
    );
    process.exit(1);
  }
}

/** Preflight (c): destructive scripts require an explicit --yes. */
export function requireYesFlag(scriptName: string): void {
  if (!process.argv.includes('--yes')) {
    console.error(
      `${scriptName} is destructive and requires an explicit --yes flag.\n` +
        `  npm run ${scriptName} -- --yes`,
    );
    process.exit(1);
  }
}

/** Resolve sim auth users (manifest identity = email) → { email → user id }. */
export async function resolveSimAuthUsers(admin: Admin): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && email.endsWith(`@${SIM_EMAIL_DOMAIN}`)) found.set(email, user.id);
    }
    if (data.users.length < perPage) break;
  }
  return found;
}

/**
 * Preflight (b): the sentinel. Either the sim district exists with the exact
 * expected name (normal reseed), or — bootstrap only — the ENTIRE sim
 * namespace is verifiably absent. A missing sentinel with leftover rows means
 * a half-failed prior seed: fail and direct to teardown.
 */
export async function assertSentinel(admin: Admin): Promise<'exists' | 'bootstrap'> {
  const { data: district, error } = await admin
    .from('districts')
    .select('id, name')
    .eq('id', DISTRICT.id)
    .maybeSingle();
  if (error) throw new Error(`Sentinel query failed: ${error.message}`);

  if (district) {
    if (district.name !== DISTRICT.name) {
      console.error(
        `Preflight FAILED: district ${DISTRICT.id} exists but is named "${district.name}", ` +
          `expected "${DISTRICT.name}". Refusing to proceed.`,
      );
      process.exit(1);
    }
    return 'exists';
  }

  // Bootstrap path: manifest-wide zero-state check.
  const problems: string[] = [];
  const { count: schoolCount, error: schoolErr } = await admin
    .from('schools')
    .select('id', { count: 'exact', head: true })
    .in('id', SCHOOLS.map(s => s.id));
  if (schoolErr) throw new Error(`Zero-state school check failed: ${schoolErr.message}`);
  if ((schoolCount ?? 0) > 0) problems.push(`${schoolCount} SIM school row(s)`);

  const simUsers = await resolveSimAuthUsers(admin);
  if (simUsers.size > 0) problems.push(`${simUsers.size} @${SIM_EMAIL_DOMAIN} auth user(s)`);

  const { count: profileCount, error: profileErr } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .like('email', `%@${SIM_EMAIL_DOMAIN}`);
  if (profileErr) throw new Error(`Zero-state profile check failed: ${profileErr.message}`);
  if ((profileCount ?? 0) > 0) problems.push(`${profileCount} sim profile row(s)`);

  if (problems.length > 0) {
    console.error(
      `Preflight FAILED: sentinel district ${DISTRICT.id} is absent but the namespace is not empty ` +
        `(${problems.join(', ')}). A previous seed likely half-failed. Run sim:teardown first.`,
    );
    process.exit(1);
  }
  return 'bootstrap';
}

/** Expected sim emails, for teardown/verify sweeps. */
export function expectedSimEmails(): string[] {
  return ALL_SIM_EMAILS.map(e => e.toLowerCase());
}

/** Chunk an array (Supabase .in() lists and bulk inserts stay bounded). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Insert rows in batches; throws on the first error. */
export async function bulkInsert(admin: Admin, table: string, rows: Record<string, unknown>[]): Promise<number> {
  let inserted = 0;
  for (const batch of chunk(rows, 400)) {
    const { error } = await admin.from(table).insert(batch);
    if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

/** Delete by column ∈ ids, chunked; returns deleted row count. */
export async function deleteWhereIn(admin: Admin, table: string, column: string, ids: string[]): Promise<number> {
  let total = 0;
  for (const batch of chunk(ids, 150)) {
    const { count, error } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .in(column, batch);
    if (error) throw new Error(`delete from ${table} (${column}) failed: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

/** Count rows where column ∈ ids, chunked (read-only, for verify). */
export async function countWhereIn(admin: Admin, table: string, column: string, ids: string[]): Promise<number> {
  let total = 0;
  for (const batch of chunk(ids, 150)) {
    const { count, error } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(column, batch);
    if (error) throw new Error(`count on ${table} (${column}) failed: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

/** Weekdays (Mon-Fri) within ±days of `center`, as ISO dates. */
export function weekdayWindow(center: Date, days: number): { iso: string; dayOfWeek: number; inPast: boolean }[] {
  const out: { iso: string; dayOfWeek: number; inPast: boolean }[] = [];
  for (let offset = -days; offset <= days; offset++) {
    const d = new Date(Date.UTC(center.getUTCFullYear(), center.getUTCMonth(), center.getUTCDate() + offset));
    const dow = d.getUTCDay(); // 0=Sun..6=Sat
    if (dow >= 1 && dow <= 5) {
      out.push({ iso: d.toISOString().slice(0, 10), dayOfWeek: dow, inPast: offset < 0 });
    }
  }
  return out;
}

export function addDays(date: Date, days: number): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

export function minutesAfter(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
