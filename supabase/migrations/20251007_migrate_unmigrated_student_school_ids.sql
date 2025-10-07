-- Migration: Update students with NULL school_id to use their provider's school_id
-- This fixes the issue where students without migrated school_id values are filtered out
-- from queries that filter by school_id (e.g., AI Lesson Builder)

-- Update students where school_id is NULL but the provider has a school_id
-- Match based on the provider's school_id and verify the text-based school_site matches
UPDATE students s
SET
  school_id = p.school_id,
  district_id = p.district_id,
  state_id = p.state_id
FROM profiles p
WHERE
  s.provider_id = p.id
  AND s.school_id IS NULL
  AND p.school_id IS NOT NULL
  -- Only update if the school_site text approximately matches
  -- This ensures we don't incorrectly assign school_ids
  AND (
    s.school_site = p.school_site
    OR s.school_site IS NULL
  );

-- Log the number of affected rows for verification
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Updated % student records with provider school_id', affected_count;
END $$;

-- Verify the update by checking for any remaining NULL school_id students
-- where the provider has a school_id (these would be mismatched school_site values)
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM students s
  INNER JOIN profiles p ON s.provider_id = p.id
  WHERE s.school_id IS NULL
    AND p.school_id IS NOT NULL;

  IF remaining_count > 0 THEN
    RAISE NOTICE 'Warning: % students still have NULL school_id despite provider having school_id (school_site mismatch)', remaining_count;
  ELSE
    RAISE NOTICE 'All students with providers having school_id have been updated successfully';
  END IF;
END $$;
