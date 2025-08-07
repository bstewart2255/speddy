-- Final verification that migration completed successfully
-- Run in Supabase SQL Editor

-- 1. Summary statistics
SELECT 
    (SELECT COUNT(*) FROM teachers) as total_teachers,
    (SELECT COUNT(*) FROM students WHERE teacher_id IS NOT NULL) as students_with_teachers,
    (SELECT COUNT(DISTINCT teacher_id) FROM students WHERE teacher_id IS NOT NULL) as unique_teachers_assigned,
    (SELECT COUNT(*) FROM students WHERE teacher_name IS NOT NULL AND teacher_id IS NULL) as unlinked_students;

-- 2. Show properly formatted teacher names with student counts
SELECT 
    t.id,
    COALESCE(t.first_name || ' ' || t.last_name, t.last_name, t.first_name, 'Unknown') as teacher_name,
    COUNT(s.id) as student_count
FROM teachers t
LEFT JOIN students s ON s.teacher_id = t.id
GROUP BY t.id, t.first_name, t.last_name
ORDER BY student_count DESC
LIMIT 10;

-- 3. Sample of complete student-teacher relationships
SELECT 
    s.initials as student,
    s.grade_level as grade,
    s.teacher_name as original_teacher,
    COALESCE(t.first_name || ' ' || t.last_name, t.last_name, t.first_name) as linked_teacher
FROM students s
LEFT JOIN teachers t ON s.teacher_id = t.id
WHERE s.teacher_id IS NOT NULL
ORDER BY s.teacher_name, s.initials
LIMIT 15;

-- 4. Check RLS policies are in place
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename = 'teachers'
ORDER BY policyname;