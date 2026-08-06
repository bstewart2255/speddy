/**
 * SPE-332 — `profiles` RLS regression guard, run with REAL signed-in sessions.
 *
 * Why this is a script rather than a jest test: our unit tests mock the Supabase
 * client, so they cannot see RLS at all — they pass identically whether a policy
 * permits a write or denies every write. That blind spot is how a recursive
 * `profiles_update` policy (42P17) sat in production for ~7 months silently
 * breaking every self-serve profile write, and how SPE-320 shipped a broken
 * self-toggle behind three green test files.
 *
 * This signs in as real sim personas and talks to PostgREST — the same path the
 * browser takes — asserting both halves of the contract:
 *
 *   - a user CAN update their own non-privileged profile columns, and
 *   - a user CANNOT change their own role / is_speddy_admin / school / district,
 *     nor write to anyone else's row.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It writes to
 * `rsp.willow`'s profile, so re-seed afterwards to restore a pristine fixture.
 *
 * Usage: npm run sim:verify-rls
 */
import { requireEnv } from './lib';
import { DISTRICT, MAPLE, PERSONAS, derivePassword, simEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');
const service = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

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

async function patchProfile(
  session: Session,
  targetId: string,
  patch: Record<string, unknown>,
) {
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${targetId}`, {
    method: 'PATCH',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* error bodies are not always JSON arrays */
  }
  return {
    status: res.status,
    ok: res.ok,
    rows: Array.isArray(parsed) ? parsed : [],
    body: text,
  };
}

/** Rows a session can SELECT from profiles for one target id. */
async function readProfile(session: Session, targetId: string) {
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${targetId}&select=id`, {
    headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* error bodies are not always JSON arrays */
  }
  return { status: res.status, rows: Array.isArray(parsed) ? parsed : [], body: text };
}

/**
 * Signature of a refusal from profiles_guard_immutable_columns: its SQLSTATE
 * plus the column list it names. Matching both proves the TRIGGER refused —
 * not type coercion, a foreign key, or a plain RLS filter — while staying
 * robust to the exact wording of the message.
 */
function refusedByTrigger(body: string): boolean {
  return body.includes('"code":"42501"') && body.includes('profiles: role, is_speddy_admin');
}

let failures = 0;
function check(ok: boolean, label: string, detail: string): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(56)} ${detail}`);
}

async function main(): Promise<void> {
  const needed = ['rsp.willow', 'slp.itinerant', 'siteadmin.willow', 'district.admin', 'techadmin.district'];
  for (const local of needed) {
    if (!PERSONAS.some((p) => p.emailLocal === local)) {
      throw new Error(`persona '${local}' is no longer in the manifest — update this script`);
    }
  }

  const provider = await signIn('rsp.willow');
  const otherProvider = await signIn('slp.itinerant');
  const siteAdmin = await signIn('siteadmin.willow');
  const uid = provider.user.id;

  console.log('self-service writes (must succeed):');
  const selfWrites: [string, Record<string, unknown>][] = [
    ['daily schedule email toggle', { daily_schedule_email_enabled: true }],
    ['password reset request flag', { password_reset_requested_at: new Date().toISOString() }],
    ['dismiss onboarding banner', { setup_banner_dismissed: true }],
  ];
  for (const [label, patch] of selfWrites) {
    const r = await patchProfile(provider, uid, patch);
    // Assert a row came back, not merely a 2xx. PostgREST reports an
    // RLS-filtered UPDATE as a success with an empty representation, so a
    // status-only check would call a write that persisted NOTHING a pass —
    // exactly the failure this guard exists to catch.
    check(r.ok && r.rows.length === 1, label, `HTTP ${r.status}, ${r.rows.length} row(s)`);
  }

  console.log('self-escalation (must be refused):');
  // Use REAL seeded ids, not synthetic ones. rsp.willow sits at WILLOW, so
  // moving them to MAPLE is a plausible scope change that the trigger must
  // refuse. A made-up id risks being rejected by type coercion or a foreign key
  // instead — the check would still go green while telling us nothing about the
  // trigger. (Raised by Codex on PR #782; its stated cause was off — these
  // columns are varchar(36), so a UUID does fit — but the point stands.)
  const escalations: [string, Record<string, unknown>][] = [
    ['own role', { role: 'district_admin' }],
    ['own is_speddy_admin', { is_speddy_admin: true }],
    ['own school_id', { school_id: MAPLE }],
    ['own district_id', { district_id: `${DISTRICT.id}-OTHER` }],
  ];
  for (const [label, patch] of escalations) {
    const r = await patchProfile(provider, uid, patch);
    // Assert it was refused BY THE TRIGGER, not incidentally by type coercion or
    // a foreign key. Otherwise a badly-chosen test value would keep this check
    // green even if the trigger stopped guarding scope entirely.
    const byTrigger = !r.ok && refusedByTrigger(r.body);
    check(byTrigger, `cannot change ${label}`,
      byTrigger ? `HTTP ${r.status} (trigger)` : `HTTP ${r.status} — ${r.body.slice(0, 90)}`);
  }

  console.log('cross-profile writes:');
  // PostgREST reports an RLS-filtered UPDATE as a success with zero rows, so
  // assert on rows affected rather than on the status code.
  const cross = await patchProfile(provider, otherProvider.user.id, {
    daily_schedule_email_enabled: true,
  });
  check(
    cross.rows.length === 0,
    "provider cannot write another provider's row",
    `${cross.rows.length} row(s) affected`,
  );

  const adminWrite = await patchProfile(siteAdmin, uid, {
    daily_schedule_email_enabled: false,
  });
  check(
    adminWrite.rows.length === 1,
    'site admin CAN write a provider at their school',
    `${adminWrite.rows.length} row(s) affected`,
  );

  // Privilege escalation via the site-admin row grant. RLS gates rows, not
  // columns, so holding write access to a colleague's row previously allowed
  // setting is_speddy_admin on it — turning a school-scoped admin into a global
  // platform admin. Verified exploitable on production before the trigger was
  // widened to cover every authenticated actor (CodeRabbit, PR #782).
  //
  // NB: these must run against a freshly-seeded fixture. If a prior run already
  // escalated the target, the patch is a no-op, the trigger correctly permits it,
  // and the check passes for the wrong reason.
  console.log('site-admin escalation (must be refused):');
  const adminEscalations: [string, Record<string, unknown>][] = [
    ["a colleague's is_speddy_admin", { is_speddy_admin: true }],
    ["a colleague's role", { role: 'district_admin' }],
    ["a colleague's district_id", { district_id: `${DISTRICT.id}-OTHER` }],
  ];
  for (const [label, patch] of adminEscalations) {
    const r = await patchProfile(siteAdmin, uid, patch);
    const byTrigger = !r.ok && refusedByTrigger(r.body);
    check(byTrigger, `site admin cannot set ${label}`,
      byTrigger ? `HTTP ${r.status} (trigger)` : `HTTP ${r.status} — ${r.body.slice(0, 90)}`);
  }

  // ---------------------------------------------------------------------
  // SELECT visibility for DISTRICT-SCOPED staff (SPE-394).
  //
  // profiles_select's district-admin branch matches staff by SCHOOL. A
  // `district_tech` has school_id IS NULL by design, so before SPE-394 that
  // branch could never match and a district admin could not see the tech admin
  // they had just created — verified live: 0 rows, against a control teacher
  // returning 1. A district-scoped branch now covers school-less staff.
  //
  // The negatives below are the point: this widened what a district admin can
  // read, so the guard has to pin where the widening STOPS.
  // ---------------------------------------------------------------------
  console.log('\ndistrict-scoped profile visibility:');

  const districtAdmin = await signIn('district.admin');
  const techAdmin = await signIn('techadmin.district');
  const techId = techAdmin.user.id;

  const daSeesTech = await readProfile(districtAdmin, techId);
  check(daSeesTech.rows.length === 1,
    'district admin sees the school-less tech admin', `${daSeesTech.rows.length} row(s)`);

  // A site admin is school-scoped; the new branch is district_admin-only and
  // must not have handed them district-wide sight.
  const saSeesTech = await readProfile(siteAdmin, techId);
  check(saSeesTech.rows.length === 0,
    'site admin still cannot see the tech admin', `${saSeesTech.rows.length} row(s)`);

  // The tech admin gains nothing: it holds a district grant, but with
  // role='district_tech', which no branch of the policy matches.
  const techSeesProvider = await readProfile(techAdmin, uid);
  check(techSeesProvider.rows.length === 0,
    'tech admin still cannot see other profiles', `${techSeesProvider.rows.length} row(s)`);

  // Cross-district: the widening is pinned to the caller's own grant. This uses
  // a real, FK-valid foreign district — profiles.district_id is FK-constrained,
  // so an invented id silently lands NULL and a NULL district matches nothing,
  // which would make this negative pass no matter what the policy said.
  const FOREIGN_DISTRICT = '0618990'; // John Swett Unified
  const foreign = await fetch(
    `${url}/rest/v1/profiles?district_id=eq.${FOREIGN_DISTRICT}&select=id&limit=1`,
    { headers: { apikey: service, Authorization: `Bearer ${service}` } },
  );
  const foreignRows = (await foreign.json()) as Array<{ id: string }>;
  if (foreignRows?.length) {
    const crossRead = await readProfile(districtAdmin, foreignRows[0].id);
    check(crossRead.rows.length === 0,
      'district admin sees nothing in another district',
      `${crossRead.rows.length} row(s) (target district=${FOREIGN_DISTRICT})`);
  } else {
    check(false, 'fixture sanity: a profile exists in the foreign district',
      `none found in ${FOREIGN_DISTRICT} — check cannot run`);
  }

  if (failures === 0) {
    console.log('\nAll checks passed. Re-seed (npm run sim:reset -- --yes) to restore the fixture.');
  } else {
    console.log(`\n${failures} check(s) failed.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
