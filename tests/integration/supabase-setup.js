// tests/integration/supabase-setup.js
import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Add resetAuth function
export async function resetAuth() {
  await supabase.auth.signOut();
}

// Modified to work without admin API
export async function createTestTeacher(role = 'provider') {
  const email = faker.internet.email();
  const password = 'testpass123';

  // First, create a user ID manually
  const userId = faker.string.uuid();

  // Create profile directly (service key bypasses RLS)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      role,
      full_name: faker.person.fullName()
    })
    .select()
    .single();

  if (profileError) throw profileError;

  return { 
    user: { id: userId, email },
    profile,
    email, 
    password,
    providerId: userId
  };
}

// Update other functions similarly...
export async function createTestSchool(providerId) {
  const schoolSite = faker.company.name() + ' Elementary';
  const schoolDistrict = faker.location.city() + ' USD';

  const { data: providerSchool } = await supabase
    .from('provider_schools')
    .insert({
      provider_id: providerId,
      school_site: schoolSite,
      school_district: schoolDistrict
    })
    .select()
    .single();

  const bellSchedules = [];
  const grades = ['K', '1', '2', '3', '4', '5'];
  const periods = [
    { start: '08:00', end: '08:50', name: 'Period 1' },
    { start: '09:00', end: '09:50', name: 'Period 2' }
  ];

  for (const grade of grades.slice(0, 2)) { // Just 2 grades for faster tests
    for (let day = 1; day <= 2; day++) { // Just 2 days
      for (const period of periods) {
        const { data } = await supabase
          .from('bell_schedules')
          .insert({
            provider_id: providerId,
            school_site: schoolSite,
            grade_level: grade,
            day_of_week: day,
            start_time: period.start,
            end_time: period.end,
            period_name: period.name
          })
          .select();

        if (data) bellSchedules.push(...data);
      }
    }
  }

  return { providerSchool, bellSchedules, schoolSite, schoolDistrict };
}

export async function createTestStudent(providerId, schoolSite, schoolDistrict) {
  const { data: student } = await supabase
    .from('students')
    .insert({
      provider_id: providerId,
      initials: faker.string.alpha(2).toUpperCase(),
      grade_level: faker.helpers.arrayElement(['K', '1', '2', '3', '4', '5']),
      teacher_name: 'Ms. ' + faker.person.lastName(),
      sessions_per_week: faker.number.int({ min: 1, max: 3 }),
      minutes_per_session: 30,
      school_site: schoolSite,
      school_district: schoolDistrict
    })
    .select()
    .single();

  return student;
}

export async function cleanupTestData(providerId) {
  if (!providerId) return;

  const tables = [
    'worksheet_submissions',
    'worksheets',
    'lessons',
    'manual_lesson_plans',
    'schedule_sessions',
    'special_activities',
    'bell_schedules',
    'iep_goal_progress',
    'students',
    'provider_schools',
    'profiles'
  ];

  for (const table of tables) {
    await supabase
      .from(table)
      .delete()
      .or(`provider_id.eq.${providerId},id.eq.${providerId}`);
  }
}