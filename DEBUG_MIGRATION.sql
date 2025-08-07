-- Debug queries to understand the migration issue
-- Run these in Supabase SQL Editor

-- 1. Check if teachers table has any records
SELECT COUNT(*) as teacher_count FROM teachers;

-- 2. Look at the actual teacher records
SELECT 
    id,
    first_name,
    last_name,
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') as full_name,
    provider_id
FROM teachers
LIMIT 10;

-- 3. Check specific teacher IDs from your students
SELECT 
    id,
    first_name,
    last_name,
    provider_id
FROM teachers
WHERE id IN (
    '321a5b21-3229-4114-b97d-64e0d02a2a9a',
    '0375e8d2-3bfd-4d60-830b-8fecf5f08dbb',
    '7cd6771e-2986-4330-a677-135e7495f246'
);

-- 4. Check if the issue is with NULL concatenation
SELECT 
    s.initials as student_initials,
    s.teacher_name as original_teacher_name,
    t.first_name,
    t.last_name,
    CASE 
        WHEN t.first_name IS NOT NULL AND t.last_name IS NOT NULL THEN t.first_name || ' ' || t.last_name
        WHEN t.first_name IS NOT NULL THEN t.first_name
        WHEN t.last_name IS NOT NULL THEN t.last_name
        ELSE 'No Name'
    END as teacher_full_name,
    s.teacher_id
FROM students s
LEFT JOIN teachers t ON s.teacher_id = t.id
WHERE s.teacher_name IS NOT NULL
LIMIT 10;

-- 5. Check if there's a provider_id mismatch
SELECT 
    s.provider_id as student_provider,
    t.provider_id as teacher_provider,
    s.teacher_name,
    t.first_name,
    t.last_name
FROM students s
LEFT JOIN teachers t ON s.teacher_id = t.id
WHERE s.teacher_id IS NOT NULL
LIMIT 5;