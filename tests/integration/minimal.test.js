// tests/integration/minimal.test.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

describe('Minimal Integration Test', () => {
  test('basic teacher workflow', async () => {
    const teacherId = `test-${Date.now()}`;

    // 1. Create teacher
    const { data: teacher, error: teacherError } = await supabase
      .from('profiles')
      .insert({
        id: teacherId,
        email: `${teacherId}@test.com`,
        role: 'provider',
        full_name: 'Test Teacher'
      })
      .select()
      .single();

    expect(teacherError).toBeNull();
    console.log('✅ Created teacher');

    // 2. Create student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert({
        provider_id: teacherId,
        initials: 'TS',
        grade_level: '3',
        teacher_name: 'Ms. Smith',
        sessions_per_week: 2,
        minutes_per_session: 30
      })
      .select()
      .single();

    expect(studentError).toBeNull();
    console.log('✅ Created student');

    // 3. Create lesson plan
    const { data: lesson, error: lessonError } = await supabase
      .from('manual_lesson_plans')
      .insert({
        provider_id: teacherId,
        lesson_date: new Date().toISOString().split('T')[0],
        title: 'Test Lesson',
        subject: 'Math',
        grade_levels: ['3'],
        duration_minutes: 30
      })
      .select()
      .single();

    expect(lessonError).toBeNull();
    console.log('✅ Created lesson plan');

    // 4. Cleanup
    if (lesson) await supabase.from('manual_lesson_plans').delete().eq('id', lesson.id);
    if (student) await supabase.from('students').delete().eq('id', student.id);
    if (teacher) await supabase.from('profiles').delete().eq('id', teacherId);

    console.log('✅ Cleanup complete');
    console.log('🎉 All tests passed!');
  }, 20000);
});