import { createClient } from '@supabase/supabase-js';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test user data
const teacherRoles = ['resource', 'speech', 'ot', 'counseling', 'specialist'];
const testUsers = {
  resource: {
    email: 'test.resource@school.edu',
    password: 'TestPass123!',
    metadata: {
      full_name: 'Test Resource Teacher',
      role: 'resource',
      state: 'CA',
      school_district: 'Test District',
      school_site: 'Test Elementary School',
      works_at_multiple_schools: false
    }
  },
  speech: {
    email: 'test.speech@school.edu',
    password: 'TestPass123!',
    metadata: {
      full_name: 'Test Speech Therapist',
      role: 'speech',
      state: 'CA',
      school_district: 'Test District',
      school_site: 'Test Elementary School',
      works_at_multiple_schools: false
    }
  },
  sea: {
    email: 'test.sea@school.edu',
    password: 'TestPass123!',
    metadata: {
      full_name: 'Test SEA User',
      role: 'sea',
      state: 'CA',
      school_district: 'Test District',
      school_site: 'Test Elementary School',
      works_at_multiple_schools: false
    }
  }
};

// Array to track created users for cleanup
const createdUserIds: string[] = [];

describe('Referral Code Generation', () => {
  // Cleanup function
  const cleanupTestUsers = async () => {
    for (const userId of createdUserIds) {
      try {
        // Delete referral codes
        await supabase
          .from('referral_codes')
          .delete()
          .eq('user_id', userId);

        // Delete profile
        await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);

        // Delete auth user
        await supabase.auth.admin.deleteUser(userId);
      } catch (error) {
        console.error(`Failed to cleanup user ${userId}:`, error);
      }
    }
    createdUserIds.length = 0;
  };

  beforeAll(async () => {
    // Ensure clean state
    await cleanupTestUsers();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupTestUsers();
  });

  describe('Teacher Role Code Generation', () => {
    test('Resource teacher should automatically get a referral code', async () => {
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email: testUsers.resource.email,
        password: testUsers.resource.password,
        user_metadata: testUsers.resource.metadata,
        email_confirm: true
      });

      expect(signUpError).toBeNull();
      expect(signUpData?.user).toBeDefined();
      
      if (signUpData?.user) {
        createdUserIds.push(signUpData.user.id);

        // Create profile (simulating the trigger)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: signUpData.user.id,
            email: signUpData.user.email!,
            full_name: testUsers.resource.metadata.full_name,
            role: testUsers.resource.metadata.role,
            school_district: testUsers.resource.metadata.school_district,
            school_site: testUsers.resource.metadata.school_site,
            works_at_multiple_schools: false,
            district_domain: 'school.edu',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        expect(profileError).toBeNull();

        // Wait for trigger to execute
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if referral code was generated
        const { data: referralCode, error: codeError } = await supabase
          .from('referral_codes')
          .select('*')
          .eq('user_id', signUpData.user.id)
          .single();

        expect(codeError).toBeNull();
        expect(referralCode).toBeDefined();
        expect(referralCode?.code).toMatch(/^[A-Z0-9]{6}$/);
        expect(referralCode?.uses_count).toBe(0);
      }
    });

    test('Speech therapist should automatically get a referral code', async () => {
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email: testUsers.speech.email,
        password: testUsers.speech.password,
        user_metadata: testUsers.speech.metadata,
        email_confirm: true
      });

      expect(signUpError).toBeNull();
      expect(signUpData?.user).toBeDefined();
      
      if (signUpData?.user) {
        createdUserIds.push(signUpData.user.id);

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: signUpData.user.id,
            email: signUpData.user.email!,
            full_name: testUsers.speech.metadata.full_name,
            role: testUsers.speech.metadata.role,
            school_district: testUsers.speech.metadata.school_district,
            school_site: testUsers.speech.metadata.school_site,
            works_at_multiple_schools: false,
            district_domain: 'school.edu',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        expect(profileError).toBeNull();

        // Wait for trigger
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check referral code
        const { data: referralCode } = await supabase
          .from('referral_codes')
          .select('*')
          .eq('user_id', signUpData.user.id)
          .single();

        expect(referralCode).toBeDefined();
        expect(referralCode?.code).toMatch(/^[A-Z0-9]{6}$/);
      }
    });
  });

  describe('SEA Role Code Generation', () => {
    test('SEA user should NOT get a referral code', async () => {
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email: testUsers.sea.email,
        password: testUsers.sea.password,
        user_metadata: testUsers.sea.metadata,
        email_confirm: true
      });

      expect(signUpError).toBeNull();
      expect(signUpData?.user).toBeDefined();
      
      if (signUpData?.user) {
        createdUserIds.push(signUpData.user.id);

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: signUpData.user.id,
            email: signUpData.user.email!,
            full_name: testUsers.sea.metadata.full_name,
            role: testUsers.sea.metadata.role,
            school_district: testUsers.sea.metadata.school_district,
            school_site: testUsers.sea.metadata.school_site,
            works_at_multiple_schools: false,
            district_domain: 'school.edu',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        expect(profileError).toBeNull();

        // Wait for potential trigger
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check that NO referral code was generated
        const { data: referralCode, error: codeError } = await supabase
          .from('referral_codes')
          .select('*')
          .eq('user_id', signUpData.user.id)
          .single();

        // Should return an error because no code exists
        expect(codeError).toBeDefined();
        expect(referralCode).toBeNull();
      }
    });
  });

  describe('Code Uniqueness', () => {
    test('Generated codes should be unique', async () => {
      const generatedCodes = new Set<string>();
      const numTests = 10;

      // Generate multiple teacher accounts
      for (let i = 0; i < numTests; i++) {
        const email = `test.teacher${i}@school.edu`;
        const { data: signUpData } = await supabase.auth.admin.createUser({
          email,
          password: 'TestPass123!',
          user_metadata: {
            full_name: `Test Teacher ${i}`,
            role: 'resource',
            state: 'CA',
            school_district: 'Test District',
            school_site: 'Test Elementary School',
            works_at_multiple_schools: false
          },
          email_confirm: true
        });

        if (signUpData?.user) {
          createdUserIds.push(signUpData.user.id);

          // Create profile
          await supabase
            .from('profiles')
            .insert({
              id: signUpData.user.id,
              email: signUpData.user.email!,
              full_name: `Test Teacher ${i}`,
              role: 'resource',
              school_district: 'Test District',
              school_site: 'Test Elementary School',
              works_at_multiple_schools: false,
              district_domain: 'school.edu',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          // Wait for trigger
          await new Promise(resolve => setTimeout(resolve, 500));

          // Get referral code
          const { data: referralCode } = await supabase
            .from('referral_codes')
            .select('code')
            .eq('user_id', signUpData.user.id)
            .single();

          if (referralCode?.code) {
            // Check for duplicates
            expect(generatedCodes.has(referralCode.code)).toBe(false);
            generatedCodes.add(referralCode.code);
          }
        }
      }

      // Verify we generated the expected number of unique codes
      expect(generatedCodes.size).toBe(numTests);
    });
  });

  describe('Code Format', () => {
    test('Referral codes should be 6 characters, uppercase alphanumeric', async () => {
      // Get all referral codes from test users
      const { data: codes } = await supabase
        .from('referral_codes')
        .select('code')
        .in('user_id', createdUserIds);

      expect(codes).toBeDefined();
      expect(codes!.length).toBeGreaterThan(0);

      codes?.forEach(({ code }) => {
        // Should be exactly 6 characters
        expect(code.length).toBe(6);
        
        // Should only contain uppercase letters and numbers (excluding confusing characters)
        expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
        
        // Should not contain confusing characters
        expect(code).not.toMatch(/[0O1I]/);
      });
    });
  });
});

describe('Referral Code API Validation', () => {
  let testReferralCode: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user with referral code for validation tests
    const { data: signUpData } = await supabase.auth.admin.createUser({
      email: 'test.validator@school.edu',
      password: 'TestPass123!',
      user_metadata: {
        full_name: 'Test Validator',
        role: 'resource',
        state: 'CA',
        school_district: 'Test District',
        school_site: 'Test Elementary School',
        works_at_multiple_schools: false
      },
      email_confirm: true
    });

    if (signUpData?.user) {
      testUserId = signUpData.user.id;
      createdUserIds.push(testUserId);

      // Create profile
      await supabase
        .from('profiles')
        .insert({
          id: testUserId,
          email: signUpData.user.email!,
          full_name: 'Test Validator',
          role: 'resource',
          school_district: 'Test District',
          school_site: 'Test Elementary School',
          works_at_multiple_schools: false,
          district_domain: 'school.edu',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the generated code
      const { data: referralCode } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', testUserId)
        .single();

      testReferralCode = referralCode!.code;
    }
  });

  test('Validation endpoint should accept valid referral codes', async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/referral/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: testReferralCode }),
    });

    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.valid).toBe(true);
    expect(data.referrer_id).toBe(testUserId);
  });

  test('Validation endpoint should handle lowercase input', async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/referral/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: testReferralCode.toLowerCase() }),
    });

    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.valid).toBe(true);
  });

  test('Validation endpoint should reject invalid codes', async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/referral/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 'INVALID' }),
    });

    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.valid).toBe(false);
  });

  test('Validation endpoint should reject empty codes', async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/referral/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: '' }),
    });

    expect(response.status).toBe(400);
  });
});