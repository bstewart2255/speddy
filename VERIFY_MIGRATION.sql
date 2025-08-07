-- Run these queries in Supabase SQL Editor to verify the migration worked
-- https://supabase.com/dashboard/project/qkcruccytmmdajfavpgb/sql/new

-- 1. Check if teachers table exists and show its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'teachers'
ORDER BY ordinal_position;

-- 2. Check if teacher_id column was added to students table
SELECT 
    column_name, 
    data_type
FROM information_schema.columns 
WHERE table_name = 'students' 
    AND column_name = 'teacher_id';

-- 3. Count how many teachers were created from existing data
SELECT COUNT(*) as total_teachers 
FROM teachers;

-- 4. Count how many students have been linked to teachers
SELECT 
    COUNT(*) FILTER (WHERE teacher_id IS NOT NULL) as students_with_teacher_id,
    COUNT(*) FILTER (WHERE teacher_id IS NULL AND teacher_name IS NOT NULL) as students_without_teacher_id,
    COUNT(*) as total_students
FROM students;

-- 5. Show a sample of the migrated teachers (first 10)
SELECT 
    id,
    first_name,
    last_name,
    provider_id,
    created_at
FROM teachers
LIMIT 10;

-- 6. Show which students are linked to which teachers (first 10)
SELECT 
    s.initials as student_initials,
    s.teacher_name as original_teacher_name,
    t.first_name || ' ' || t.last_name as linked_teacher_name,
    s.teacher_id
FROM students s
LEFT JOIN teachers t ON s.teacher_id = t.id
WHERE s.teacher_name IS NOT NULL
LIMIT 10;