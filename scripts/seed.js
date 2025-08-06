const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const providerId = process.env.SEED_PROVIDER_ID;

if (!supabaseUrl || !serviceKey || !providerId) {
  console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_PROVIDER_ID');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function resetTables() {
  await supabase.from('schedule_sessions').delete().neq('id', '');
  await supabase.from('special_activities').delete().neq('id', '');
  await supabase.from('bell_schedules').delete().neq('id', '');
  await supabase.from('students').delete().neq('id', '');
}

async function seedStudents() {
  const students = [
    { initials: 'AB', grade_level: 'K', teacher_name: 'Smith', sessions_per_week: 2, minutes_per_session: 30 },
    { initials: 'CD', grade_level: '1', teacher_name: 'Jones', sessions_per_week: 3, minutes_per_session: 30 },
    { initials: 'EF', grade_level: '2', teacher_name: 'Lee', sessions_per_week: 2, minutes_per_session: 45 },
    { initials: 'GH', grade_level: '3', teacher_name: 'Brown', sessions_per_week: 1, minutes_per_session: 30 },
    { initials: 'IJ', grade_level: '4', teacher_name: 'Davis', sessions_per_week: 2, minutes_per_session: 30 }
  ];

  for (const student of students) {
    await supabase.from('students').insert({ ...student, provider_id: providerId });
  }
}

async function seedBellSchedules() {
  const gradeLevels = ['K', '1', '2', '3', '4', '5'];
  const periods = [
    { start: '08:00', end: '09:00', name: 'Period 1' },
    { start: '09:05', end: '10:05', name: 'Period 2' },
    { start: '10:15', end: '11:15', name: 'Period 3' },
    { start: '12:00', end: '13:00', name: 'Period 4' },
    { start: '13:05', end: '14:05', name: 'Period 5' }
  ];

  for (const grade of gradeLevels) {
    for (let day = 1; day <= 5; day++) {
      for (const p of periods) {
        await supabase.from('bell_schedules').insert({
          provider_id: providerId,
          grade_level: grade,
          day_of_week: day,
          start_time: p.start,
          end_time: p.end,
          period_name: p.name
        });
      }
    }
  }
}

async function seedSpecialActivities() {
  const activities = [
    { teacher_name: 'Smith', day_of_week: 2, start_time: '13:15', end_time: '14:00', activity_name: 'PE' },
    { teacher_name: 'Jones', day_of_week: 4, start_time: '10:15', end_time: '11:00', activity_name: 'Music' },
    { teacher_name: 'Lee', day_of_week: 1, start_time: '09:15', end_time: '10:00', activity_name: 'Art' }
  ];

  for (const activity of activities) {
    await supabase.from('special_activities').insert({ ...activity, provider_id: providerId });
  }
}

async function main() {
  console.log('Resetting tables...');
  await resetTables();
  console.log('Seeding students...');
  await seedStudents();
  console.log('Seeding bell schedules...');
  await seedBellSchedules();
  console.log('Seeding special activities...');
  await seedSpecialActivities();
  console.log('Database seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
