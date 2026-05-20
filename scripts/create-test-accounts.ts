/**
 * Creates the canonical Hayward Unified test accounts:
 *   - district-test@husd.us  → district_admin (scope: Hayward Unified)
 *   - admin-test@husd.us     → site_admin    (scope: Schafer Park Elementary)
 *   - provider-test@husd.us  → resource      (school: Schafer Park Elementary)
 *
 * Also ensures the parent district and school rows exist. Safe to re-run -
 * any existing test users with these emails are wiped and recreated so the
 * script doubles as a "reset test accounts" tool.
 *
 * Usage: npx tsx scripts/create-test-accounts.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'set' : 'MISSING');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING');
  process.exit(1);
}

const DISTRICT = {
  id: '0161192',
  name: 'Hayward Unified',
  state_id: 'CA',
  district_type: 'Unified',
  city: 'Hayward',
  county: 'Alameda',
  zip: '94544',
  phone: '(510) 784-2600',
  website: 'https://www.husd.us',
};

const SCHOOL = {
  id: '061674002130',
  name: 'Schafer Park Elementary',
  district_id: DISTRICT.id,
  school_type: 'Elementary',
  grade_span_low: 'K',
  grade_span_high: '6',
  city: 'Hayward',
  county: 'Alameda',
  zip: '94544',
  phone: '(510) 723-3895',
  website: 'https://schafer.husd.us',
  mailing_address: '26268 Flamingo Avenue',
};

const TEST_PASSWORD = 'SpeddyTest2025!';
const DISTRICT_DOMAIN = 'husd.us';

type TestAccount = {
  email: string;
  fullName: string;
  role: 'district_admin' | 'site_admin' | 'resource';
  schoolSite: string;
  schoolId: string | null;
};

const ACCOUNTS: TestAccount[] = [
  {
    email: 'district-test@husd.us',
    fullName: 'Test District Admin',
    role: 'district_admin',
    schoolSite: '',
    schoolId: null,
  },
  {
    email: 'admin-test@husd.us',
    fullName: 'Test Site Admin',
    role: 'site_admin',
    schoolSite: SCHOOL.name,
    schoolId: SCHOOL.id,
  },
  {
    email: 'provider-test@husd.us',
    fullName: 'Test Resource Provider',
    role: 'resource',
    schoolSite: SCHOOL.name,
    schoolId: SCHOOL.id,
  },
];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsertDistrictAndSchool() {
  console.log('Ensuring district & school exist...');

  const { error: districtErr } = await admin
    .from('districts')
    .upsert(DISTRICT, { onConflict: 'id' });
  if (districtErr) throw new Error(`District upsert failed: ${districtErr.message}`);

  const { error: schoolErr } = await admin
    .from('schools')
    .upsert(SCHOOL, { onConflict: 'id' });
  if (schoolErr) throw new Error(`School upsert failed: ${schoolErr.message}`);

  console.log(`  district: ${DISTRICT.id} (${DISTRICT.name})`);
  console.log(`  school:   ${SCHOOL.id} (${SCHOOL.name})`);
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

async function deleteExisting(email: string) {
  const existingId = await findUserIdByEmail(email);
  if (!existingId) return;

  console.log(`  removing existing ${email} (${existingId})`);
  await admin.from('admin_permissions').delete().eq('admin_id', existingId);
  await admin.from('profiles').delete().eq('id', existingId);
  const { error: delErr } = await admin.auth.admin.deleteUser(existingId);
  if (delErr) throw new Error(`deleteUser failed for ${email}: ${delErr.message}`);
}

async function createAccount(account: TestAccount) {
  console.log(`\nCreating ${account.email} (${account.role})...`);
  await deleteExisting(account.email);

  // auth.admin.createUser fires handle_new_user, which seeds public.profiles
  // from raw_user_meta_data. We then patch the profile with the FK IDs that
  // the trigger doesn't populate (district_id, school_id, state_id).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: account.email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: account.fullName,
      role: account.role,
      state: DISTRICT.state_id,
      school_district: DISTRICT.name,
      school_site: account.schoolSite,
      works_at_multiple_schools: false,
    },
  });

  if (createErr || !created.user) {
    throw new Error(`createUser failed for ${account.email}: ${createErr?.message}`);
  }
  const userId = created.user.id;
  console.log(`  auth user: ${userId}`);

  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      full_name: account.fullName,
      role: account.role,
      school_district: DISTRICT.name,
      school_site: account.schoolSite,
      district_id: DISTRICT.id,
      school_id: account.schoolId,
      state_id: DISTRICT.state_id,
      state: DISTRICT.state_id,
      district_domain: DISTRICT_DOMAIN,
    })
    .eq('id', userId);
  if (profileErr) throw new Error(`profile update failed for ${account.email}: ${profileErr.message}`);

  if (account.role === 'district_admin' || account.role === 'site_admin') {
    const { error: permErr } = await admin.from('admin_permissions').insert({
      admin_id: userId,
      role: account.role,
      district_id: DISTRICT.id,
      school_id: account.role === 'site_admin' ? account.schoolId : null,
      state_id: DISTRICT.state_id,
    });
    if (permErr) throw new Error(`admin_permissions insert failed for ${account.email}: ${permErr.message}`);
    console.log(`  admin_permissions: ${account.role}`);
  }
}

async function main() {
  await upsertDistrictAndSchool();
  for (const account of ACCOUNTS) {
    await createAccount(account);
  }

  console.log('\n========================================');
  console.log('Test accounts ready (password: ' + TEST_PASSWORD + ')');
  console.log('========================================');
  for (const a of ACCOUNTS) {
    console.log(`  ${a.role.padEnd(15)} ${a.email}`);
  }
}

main().catch((err) => {
  console.error('\nFailed:', err.message ?? err);
  process.exit(1);
});
