-- Migration: Clean up orphaned Kindergarten schedules
-- This migration removes K, K-AM, and K-PM schedules where there are no corresponding
-- bell_schedules entries with K-specific periods

-- First, let's identify providers who have K schedules in school_hours but no K-specific bell_schedules
WITH orphaned_k_schedules AS (
  SELECT DISTINCT 
    sh.provider_id,
    sh.school_site
  FROM school_hours sh
  WHERE sh.grade_level IN ('K', 'K-AM', 'K-PM')
  AND NOT EXISTS (
    -- Check if there are any bell_schedules for K grade level
    SELECT 1
    FROM bell_schedules bs
    WHERE bs.provider_id = sh.provider_id
    AND (bs.school_id = sh.school_site OR sh.school_site IS NULL)
    AND bs.grade_level IN ('K', 'K-AM', 'K-PM', 'Kindergarten')
  )
)
-- Delete the orphaned K schedules
DELETE FROM school_hours
WHERE (provider_id, COALESCE(school_site, '')) IN (
  SELECT provider_id, COALESCE(school_site, '')
  FROM orphaned_k_schedules
)
AND grade_level IN ('K', 'K-AM', 'K-PM');

-- Similarly, clean up orphaned TK schedules
WITH orphaned_tk_schedules AS (
  SELECT DISTINCT 
    sh.provider_id,
    sh.school_site
  FROM school_hours sh
  WHERE sh.grade_level IN ('TK', 'TK-AM', 'TK-PM')
  AND NOT EXISTS (
    -- Check if there are any bell_schedules for TK grade level
    SELECT 1
    FROM bell_schedules bs
    WHERE bs.provider_id = sh.provider_id
    AND (bs.school_id = sh.school_site OR sh.school_site IS NULL)
    AND bs.grade_level IN ('TK', 'TK-AM', 'TK-PM', 'Transitional Kindergarten')
  )
)
-- Delete the orphaned TK schedules
DELETE FROM school_hours
WHERE (provider_id, COALESCE(school_site, '')) IN (
  SELECT provider_id, COALESCE(school_site, '')
  FROM orphaned_tk_schedules
)
AND grade_level IN ('TK', 'TK-AM', 'TK-PM');

-- Add a comment to document this cleanup
COMMENT ON TABLE school_hours IS 'School hours by grade level. K and TK schedules should only exist when corresponding bell_schedules entries are present.';