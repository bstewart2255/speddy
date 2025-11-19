-- Clean up duplicate special activities created by the old "share schedules" feature
--
-- Issue: The "share schedules" feature created duplicate copies of activities
-- for different providers. Now that activities are school-wide, we only need
-- one copy of each activity.
--
-- Solution: Keep the oldest record for each unique activity, soft-delete duplicates

-- Soft-delete duplicate activities, keeping only the oldest (earliest created_at)
-- for each unique combination of (school_id, teacher_name, activity_name, day_of_week, start_time, end_time)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, teacher_name, COALESCE(activity_name, ''), day_of_week, start_time, end_time
      ORDER BY created_at ASC  -- Keep the oldest (first created)
    ) as row_num
  FROM public.special_activities
  WHERE deleted_at IS NULL  -- Only look at active activities
)
UPDATE public.special_activities
SET deleted_at = NOW()
WHERE id IN (
  SELECT id
  FROM duplicates
  WHERE row_num > 1  -- Soft-delete all but the first (oldest)
);

-- Add a comment documenting the cleanup
COMMENT ON TABLE public.special_activities IS
'Special activities table. Duplicates from share schedules feature cleaned up on 2025-11-18. Activities are now school-wide and visible to all providers at the school.';
