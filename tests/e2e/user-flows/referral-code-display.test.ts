import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Skip tests if environment variables are not set
test.skip(!supabaseUrl || !supabaseServiceKey, 'Supabase environment variables not configured');

// Force this suite to run in serial mode to prevent conflicts
test.describe.configure({ mode: 'serial' });

// Test users
const teacherUser = {
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
};

const seaUser = {
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
};

// Helper functions
function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function cleanupTestUser(email: string) {
  try {
    const supabase = createSupabaseClient();
    let page = 1;
    const perPage = 1000;
    let userId: string | null = null;

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
      await supabase.from('referral_codes').delete().eq('user_id', userId);
      await supabase.from('profiles').delete().eq('id', userId);
      await supabase.auth.admin.deleteUser(userId);
    }
  } catch (error) {
    console.error(`Failed to cleanup user ${email}:`, error);
  }
}

async function createUserAndProfile(userData: typeof teacherUser) {
  const supabase = createSupabaseClient();
  
  const { data: signUpData, error } = await supabase.auth.admin.createUser({
    email: userData.email,
    password: userData.password,
    user_metadata: userData.metadata,
    email_confirm: true
  });

  if (error || !signUpData?.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  await supabase.from('profiles').insert({
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

  return signUpData.user.id;
}

async function loginUser(page: any, userData: typeof teacherUser, expectedPath = /\/dashboard(\/|$)/) {
  await page.goto('/login');
  await page.fill('input[type="email"]', userData.email);
  await page.fill('input[type="password"]', userData.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(expectedPath);
}

test.describe('Referral Code Display', () => {
  test.beforeEach(async () => {
    // Cleanup any existing test users
    await cleanupTestUser(teacherUser.email);
    await cleanupTestUser(seaUser.email);
  });

  test.afterEach(async () => {
    // Cleanup after each test
    await cleanupTestUser(teacherUser.email);
    await cleanupTestUser(seaUser.email);
  });

  test('Teacher dashboard should display referral code', async ({ page }) => {
    // Create teacher user and profile
    await createUserAndProfile(teacherUser);

    // Login as teacher
    await loginUser(page, teacherUser);

    // Check for referral code display
    await expect(page.locator('text=Your referral code:')).toBeVisible();
    
    // Check for referral code format (6 uppercase alphanumeric characters)
    const referralCodeElement = await page.locator('.font-mono.font-bold.text-lg').textContent();
    expect(referralCodeElement).toMatch(/^[A-Z0-9]{6}$/);

    // Check for copy button
    await expect(page.locator('button[title="Copy code"]')).toBeVisible();

    // Check for view details button
    await expect(page.locator('button:has-text("View details")')).toBeVisible();

    // Check for referral program link
    await expect(page.locator('a:has-text("Learn more about earning rewards through referrals")')).toBeVisible();
  });

  test('SEA dashboard should NOT display referral code', async ({ page }) => {
    // Create SEA user and profile
    await createUserAndProfile(seaUser);

    // Login as SEA
    await loginUser(page, seaUser, /\/dashboard\/sea(\/|$)/);

    // Verify NO referral code is displayed
    await expect(page.locator('text=Your referral code:')).not.toBeVisible();
    await expect(page.locator('text=referral program')).not.toBeVisible();
  });

  test('Referral code copy functionality', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Create teacher user and profile
    await createUserAndProfile(teacherUser);

    // Login as teacher
    await loginUser(page, teacherUser);

    // Get the referral code
    const referralCode = await page.locator('.font-mono.font-bold.text-lg').textContent();

    // Click copy button
    await page.click('button[title="Copy code"]');

    // Check for copy confirmation
    await expect(page.locator('text=Copied!')).toBeVisible();

    // Verify clipboard content (evaluate in page context)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(referralCode);
  });

  test('Referral code expansion shows full details', async ({ page }) => {
    // Create teacher user and profile
    await createUserAndProfile(teacherUser);

    // Login as teacher
    await loginUser(page, teacherUser);

    // Click view details button
    await page.click('button:has-text("View details")');

    // Check for expanded view elements
    await expect(page.locator('text=Your Referral Program')).toBeVisible();
    await expect(page.locator('text=Total Uses')).toBeVisible();
    await expect(page.locator('text=Active Referrals')).toBeVisible();
    await expect(page.locator('text=This Month')).toBeVisible();
    await expect(page.locator('text=Total Earned')).toBeVisible();
    
    // Check for share buttons
    await expect(page.locator('button:has-text("Copy Signup Link")')).toBeVisible();
    await expect(page.locator('button:has-text("Share")')).toBeVisible();

    // Check for program details
    await expect(page.locator('text=Friends who use your code get 60 days free')).toBeVisible();
    await expect(page.locator('text=You earn $1 off per month for each active referral')).toBeVisible();

    // Check for collapse button
    await expect(page.locator('button:has-text("Show less")')).toBeVisible();
  });
});

test.describe('Billing Page Referral Display', () => {
  test.beforeEach(async () => {
    await cleanupTestUser(teacherUser.email);
  });

  test.afterEach(async () => {
    await cleanupTestUser(teacherUser.email);
  });

  test('Billing page should display referral code for teachers', async ({ page }) => {
    // Create teacher user and profile
    await createUserAndProfile(teacherUser);

    // Login as teacher
    await loginUser(page, teacherUser);

    // Navigate to billing page
    await page.goto('/billing');

    // Check for referral code display in billing
    await expect(page.locator('text=Your referral code')).toBeVisible();
    
    // Verify the referral code is displayed
    const referralCodeElement = await page.locator('.font-mono').first();
    const codeText = await referralCodeElement.textContent();
    expect(codeText).toMatch(/^[A-Z0-9]{6}$/);
  });
});