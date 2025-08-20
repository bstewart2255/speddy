import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function createSupabaseClient() {
  return createClient(supabaseUrl, serviceKey);
}

export const testUsers = {
  teacher: {
    email: 'e2e.teacher@school.edu',
    password: 'E2ETestPass123!',
    metadata: {
      full_name: 'E2E Teacher User',
      role: 'resource',
      state: 'CA',
      school_district: 'E2E Test District',
      school_site: 'E2E Elementary School',
      works_at_multiple_schools: false
    }
  },
  sea: {
    email: 'e2e.sea@school.edu', 
    password: 'E2ETestPass123!',
    metadata: {
      full_name: 'E2E SEA User',
      role: 'sea',
      state: 'CA',
      school_district: 'E2E Test District',
      school_site: 'E2E Elementary School',
      works_at_multiple_schools: false
    }
  }
};

export async function createUserAndProfile(userData) {
  const supabase = createSupabaseClient();
  
  // Create Supabase auth user
  const { data: signUpData, error } = await supabase.auth.admin.createUser({
    email: userData.email,
    password: userData.password,
    user_metadata: userData.metadata,
    email_confirm: true
  });

  if (error || !signUpData?.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  // Create profile using the same structure as referral-code-display.test.ts
  const { error: profileError } = await supabase.from('profiles').insert({
    id: signUpData.user.id,
    email: userData.email,
    full_name: userData.metadata.full_name,
    role: userData.metadata.role,
    school_district: userData.metadata.school_district,
    school_site: userData.metadata.school_site,
    works_at_multiple_schools: userData.metadata.works_at_multiple_schools || false,
    district_domain: 'school.edu',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  if (profileError) {
    throw new Error(`Failed to create profile for test user: ${profileError.message}`);
  }
  return signUpData.user.id;
}

export async function cleanupTestUser(email) {
  try {
    const supabase = createSupabaseClient();
    let page = 1;
    const perPage = 1000;
    let userId = null;

    // Handle pagination when searching for user
    while (!userId) {
      const { data, error } = await supabase.auth.admin.listUsers({ 
        page, 
        perPage 
      });
      
      if (error) throw error;
      
      const testUser = data.users.find(u => u.email === email);
      if (testUser) {
        userId = testUser.id;
        break;
      }
      
      // No more pages to check
      if (data.users.length < perPage) break;
      page++;
    }

    if (userId) {
      // Clean up related data
      await supabase.from('subscriptions').delete().eq('user_id', userId);
      await supabase.from('referral_codes').delete().eq('user_id', userId); 
      await supabase.from('profiles').delete().eq('id', userId);
      await supabase.auth.admin.deleteUser(userId);
    }
  } catch (error) {
    console.error(`Failed to cleanup user ${email}:`, error);
  }
}

export async function seedActiveSubscriptionForUser(userId) {
  const supabase = createSupabaseClient();

  // Ensure idempotency for retries
  await supabase.from('subscriptions').delete().eq('user_id', userId);

  const now = Date.now();
  const currentPeriodStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const currentPeriodEnd = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      stripe_customer_id: `test_c_${userId.substring(0, 12)}`,
      stripe_subscription_id: `sub_test_${userId.substring(0, 12)}`,
      status: 'active',
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      trial_end: null,
    });

  if (error) throw error;
}

export async function loginUser(page, userData, expectedPath = /\/dashboard(\/|$)/) {
  await page.goto('/login');
  await page.fill('input[type="email"]', userData.email);
  await page.fill('input[type="password"]', userData.password);
  await page.click('button[type="submit"]');
  
  // Debug: Log current URL for troubleshooting
  if (process.env.E2E_DEBUG) {
    console.log('After login - Current URL:', page.url());
  }
  
  // Increase timeout for URL check to handle slower redirects
  await page.waitForURL(expectedPath, { timeout: 15000 });
}