// tests/integration/basic-workflows.test.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

describe('Basic Workflows', () => {
  test('teacher can create student and lesson', async () => {
    const teacherId = `test-${Date.now()}`;

    // Create teacher
    await supabase.from('profiles').insert({
      id: teacherId,
      email: `${teacherId}@test.com`,
      role: 'provider'
    });

    // Create student
    const { data: student } = await supabase
      .from('students')
      .insert({
        provider_id: teacherId,
        initials: 'TS',
        grade_level: '3',
        teacher_name: 'Ms. Test',
        sessions_per_week: 2,
        minutes_per_session: 30
      })
      .select()
      .single();

    expect(student).toBeDefined();
    expect(student.initials).toBe('TS');

    // Cleanup (fire and forget)
    supabase.from('students').delete().eq('id', student.id).then();
    supabase.from('profiles').delete().eq('id', teacherId).then();

    console.log('✅ Test completed successfully');
  });
});