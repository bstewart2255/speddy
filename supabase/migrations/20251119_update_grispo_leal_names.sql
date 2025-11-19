-- Follow-up Migration: Update teacher names and IDs for Grispo and Leal
-- Date: November 19, 2025
-- Description: Updates teacher_name field to formatted names for Grispo and Leal activities
--
-- Grispo: Update teacher_name from "Grispo" to "Aimee Grispo"
-- Leal: Relink from incorrect teacher (no first name) to Kendra Leal and update teacher_name

-- Update Grispo activities
UPDATE special_activities
SET
  teacher_name = 'Aimee Grispo',
  updated_at = now()
WHERE school_id = '062271002458'
  AND deleted_at IS NULL
  AND teacher_id = '46617368-3a79-4b5c-b474-7c099942148d'::uuid;

-- Update Leal activities - relink to Kendra Leal and update name
UPDATE special_activities
SET
  teacher_id = '8191f2c4-019f-477f-9c2d-39535654bcd3'::uuid,
  teacher_name = 'Kendra Leal',
  updated_at = now()
WHERE school_id = '062271002458'
  AND deleted_at IS NULL
  AND teacher_id = 'cfe6e576-1590-4395-9ad8-af09a1318360'::uuid;

-- Verification query - run after migration to confirm success
-- Should show 7 activities for "Aimee Grispo" and 4 activities for "Kendra Leal"
SELECT
  teacher_name,
  teacher_id,
  COUNT(*) as activity_count
FROM special_activities
WHERE school_id = '062271002458'
  AND deleted_at IS NULL
  AND teacher_id IN (
    '46617368-3a79-4b5c-b474-7c099942148d'::uuid,
    '8191f2c4-019f-477f-9c2d-39535654bcd3'::uuid
  )
GROUP BY teacher_name, teacher_id
ORDER BY teacher_name;
