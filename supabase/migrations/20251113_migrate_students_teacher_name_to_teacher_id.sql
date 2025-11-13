-- Migration: Populate teacher_id for existing students based on teacher_name
-- This migration matches students with teacher_name to the teachers table
-- and populates the teacher_id field for proper foreign key relationships.

-- Step 1: Update students where teacher_name exactly matches teachers.last_name
UPDATE students s
SET teacher_id = t.id
FROM teachers t
WHERE s.teacher_id IS NULL
  AND s.teacher_name IS NOT NULL
  AND s.teacher_name != ''
  AND LOWER(TRIM(s.teacher_name)) = LOWER(TRIM(t.last_name))
  AND s.school_id = t.school_id;  -- Match within same school

-- Step 2: Update students where teacher_name matches "Ms./Mr./Mrs. [LastName]" pattern
-- Extract last name after title and match to teachers.last_name
UPDATE students s
SET teacher_id = t.id
FROM teachers t
WHERE s.teacher_id IS NULL
  AND s.teacher_name IS NOT NULL
  AND s.teacher_name != ''
  AND s.teacher_name ~* '^(ms\.?|mr\.?|mrs\.?|miss\.?)\s+'  -- Has a title prefix
  AND LOWER(TRIM(REGEXP_REPLACE(s.teacher_name, '^(ms\.?|mr\.?|mrs\.?|miss\.?)\s+', '', 'i'))) = LOWER(TRIM(t.last_name))
  AND s.school_id = t.school_id;  -- Match within same school

-- Step 3: Update students where teacher_name matches "[FirstName] [LastName]" pattern
-- Extract last name (last word after last space) and match to teachers.last_name
UPDATE students s
SET teacher_id = t.id
FROM teachers t
WHERE s.teacher_id IS NULL
  AND s.teacher_name IS NOT NULL
  AND s.teacher_name != ''
  AND s.teacher_name ~ '\s+'  -- Contains a space (first and last name)
  AND LOWER(TRIM(SUBSTRING(s.teacher_name FROM '(\S+)$'))) = LOWER(TRIM(t.last_name))
  AND s.school_id = t.school_id;  -- Match within same school

-- Step 4: For legacy students without school_id, try matching by teacher_name only
-- This is less reliable but helps with older data
UPDATE students s
SET teacher_id = t.id
FROM teachers t
WHERE s.teacher_id IS NULL
  AND s.teacher_name IS NOT NULL
  AND s.teacher_name != ''
  AND s.school_id IS NULL  -- Legacy records without school_id
  AND LOWER(TRIM(s.teacher_name)) = LOWER(TRIM(t.last_name));

-- Log results: Count of students matched vs unmatched
DO $$
DECLARE
  matched_count INTEGER;
  unmatched_count INTEGER;
  legacy_matched_count INTEGER;
BEGIN
  -- Count students with teacher_id now populated
  SELECT COUNT(*) INTO matched_count
  FROM students
  WHERE teacher_id IS NOT NULL;

  -- Count students with teacher_name but no teacher_id
  SELECT COUNT(*) INTO unmatched_count
  FROM students
  WHERE teacher_name IS NOT NULL
    AND teacher_name != ''
    AND teacher_id IS NULL;

  -- Count students matched without school_id verification (Step 4 legacy matches)
  SELECT COUNT(*) INTO legacy_matched_count
  FROM students
  WHERE teacher_id IS NOT NULL
    AND school_id IS NULL
    AND teacher_name IS NOT NULL
    AND teacher_name != '';

  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  Students with teacher_id: %', matched_count;
  RAISE NOTICE '  Students with teacher_name but no teacher_id: %', unmatched_count;

  IF legacy_matched_count > 0 THEN
    RAISE NOTICE 'WARNING: % legacy students were matched without school verification.', legacy_matched_count;
    RAISE NOTICE 'These matches relied on teacher name only and should be reviewed for accuracy.';
  END IF;

  IF unmatched_count > 0 THEN
    RAISE NOTICE 'Note: % students could not be matched automatically.', unmatched_count;
    RAISE NOTICE 'These students may need manual teacher assignment.';
  END IF;
END $$;

-- Optional: Create a view to see unmatched students for manual review
CREATE OR REPLACE VIEW unmatched_student_teachers AS
SELECT
  s.id as student_id,
  s.initials,
  s.grade_level,
  s.teacher_name,
  s.school_site,
  s.school_district,
  s.school_id,
  s.created_at
FROM students s
WHERE s.teacher_name IS NOT NULL
  AND s.teacher_name != ''
  AND s.teacher_id IS NULL
ORDER BY s.school_site, s.teacher_name;

-- Comment on the view for documentation
COMMENT ON VIEW unmatched_student_teachers IS
'Shows students with teacher_name but no matching teacher_id.
These records may need manual teacher assignment by a site administrator.';

-- Enable RLS on the view
ALTER VIEW unmatched_student_teachers SET (security_invoker = true);

-- Grant access to authenticated users
GRANT SELECT ON unmatched_student_teachers TO authenticated;

-- Create RLS policy for site admins to view unmatched students in their schools
-- Note: This policy grants additional SELECT access to site admins for the students table.
-- The conditions (teacher_name IS NOT NULL, teacher_id IS NULL) duplicate the view filters
-- to ensure consistent access control at both the view and table levels.
-- Drop if exists to avoid conflicts
DROP POLICY IF EXISTS "Site admins can view unmatched students for teacher assignment" ON students;

CREATE POLICY "Site admins can view unmatched students for teacher assignment"
ON students
FOR SELECT
USING (
  -- Site admins can see unmatched students in schools they manage
  EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
      AND ap.school_id = students.school_id
  )
  -- Only return records that would appear in the unmatched view
  -- These conditions duplicate the view filters for security and consistency
  AND students.teacher_name IS NOT NULL
  AND students.teacher_name != ''
  AND students.teacher_id IS NULL
);
