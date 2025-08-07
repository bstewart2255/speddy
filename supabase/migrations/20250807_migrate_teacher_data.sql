-- Migration script to populate teachers table from existing student teacher_name data
-- and link students to their teachers via teacher_id

-- Step 1: Create teachers from unique teacher names per provider
INSERT INTO teachers (first_name, last_name, provider_id)
SELECT DISTINCT ON (teacher_name, provider_id)
  CASE 
    WHEN position(' ' in teacher_name) > 0 
    THEN left(teacher_name, position(' ' in teacher_name) - 1)
    ELSE NULL
  END as first_name,
  CASE 
    WHEN position(' ' in teacher_name) > 0 
    THEN substring(teacher_name from position(' ' in teacher_name) + 1)
    ELSE teacher_name
  END as last_name,
  provider_id
FROM students
WHERE teacher_name IS NOT NULL 
  AND teacher_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM teachers t 
    WHERE (
      (t.first_name = CASE 
        WHEN position(' ' in students.teacher_name) > 0 
        THEN left(students.teacher_name, position(' ' in students.teacher_name) - 1)
        ELSE NULL
      END
      AND t.last_name = CASE 
        WHEN position(' ' in students.teacher_name) > 0 
        THEN substring(students.teacher_name from position(' ' in students.teacher_name) + 1)
        ELSE students.teacher_name
      END)
      OR (t.last_name = students.teacher_name AND t.first_name IS NULL)
    )
    AND t.provider_id = students.provider_id
  );

-- Step 2: Update students with teacher_id
UPDATE students s
SET teacher_id = t.id
FROM teachers t
WHERE s.provider_id = t.provider_id
  AND s.teacher_name IS NOT NULL
  AND s.teacher_id IS NULL
  AND (
    -- Match full name
    (t.first_name || ' ' || t.last_name = s.teacher_name)
    OR 
    -- Match last name only (for single-word teacher names)
    (t.last_name = s.teacher_name AND t.first_name IS NULL)
    OR
    -- Match when teacher has first and last name
    (
      t.first_name = CASE 
        WHEN position(' ' in s.teacher_name) > 0 
        THEN left(s.teacher_name, position(' ' in s.teacher_name) - 1)
        ELSE NULL
      END
      AND t.last_name = CASE 
        WHEN position(' ' in s.teacher_name) > 0 
        THEN substring(s.teacher_name from position(' ' in s.teacher_name) + 1)
        ELSE s.teacher_name
      END
    )
  );

-- Step 3: Log migration results
DO $$
DECLARE
  teachers_created INTEGER;
  students_updated INTEGER;
  students_without_teacher_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO teachers_created FROM teachers;
  SELECT COUNT(*) INTO students_updated FROM students WHERE teacher_id IS NOT NULL;
  SELECT COUNT(*) INTO students_without_teacher_id FROM students WHERE teacher_id IS NULL AND teacher_name IS NOT NULL AND teacher_name != '';
  
  RAISE NOTICE 'Migration completed: % teachers created, % students updated with teacher_id', teachers_created, students_updated;
  
  IF students_without_teacher_id > 0 THEN
    RAISE WARNING '% students still have teacher_name but no teacher_id', students_without_teacher_id;
  END IF;
END $$;