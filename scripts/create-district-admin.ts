/**
 * Script to create a district admin user
 *
 * Usage: npx tsx scripts/create-district-admin.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'set' : 'MISSING');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING');
  process.exit(1);
}

async function createDistrictAdmin() {
  // District admin details
  const email = 'nelsonc@mdusd.org';
  const fullName = 'Christina Nelson';
  const districtId = '0761754'; // Mt. Diablo Unified
  const stateId = 'CA';
  const temporaryPassword = 'Speddy2024!'; // User should change this

  console.log('Creating district admin account...');
  console.log('Email:', email);
  console.log('Name:', fullName);
  console.log('District:', districtId);

  // Create admin client with service role
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Step 1: Create auth user with proper metadata
  console.log('\n1. Creating auth user...');
  const { data: authUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: 'district_admin',
      school_district: 'Mt. Diablo Unified',
      school_site: '',
      state: stateId,
      works_at_multiple_schools: false,
    },
  });

  if (createUserError || !authUser.user) {
    console.error('Failed to create auth user:', createUserError);
    process.exit(1);
  }

  console.log('Auth user created:', authUser.user.id);

  // Step 2: Update profile with correct role and IDs
  console.log('\n2. Updating profile...');
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      role: 'district_admin',
      district_id: districtId,
      state_id: stateId,
      full_name: fullName,
    })
    .eq('id', authUser.user.id);

  if (profileError) {
    console.error('Failed to update profile:', profileError);
    // Rollback - delete auth user
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    process.exit(1);
  }

  console.log('Profile updated successfully');

  // Step 3: Create admin_permissions entry
  console.log('\n3. Creating admin permissions...');
  const { error: permError } = await adminClient
    .from('admin_permissions')
    .insert({
      admin_id: authUser.user.id,
      role: 'district_admin',
      district_id: districtId,
      state_id: stateId,
    });

  if (permError) {
    console.error('Failed to create admin permissions:', permError);
    // Don't rollback - user exists, just needs manual permission fix
  } else {
    console.log('Admin permissions created successfully');
  }

  // Success!
  console.log('\n========================================');
  console.log('District Admin Account Created!');
  console.log('========================================');
  console.log('Email:', email);
  console.log('District:', 'Mt. Diablo Unified');
  console.log('\nPlease share these credentials securely.');
  console.log('User should change password after first login.');
}

createDistrictAdmin().catch(console.error);
