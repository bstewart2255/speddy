-- Migration: Link Mt Diablo Elementary special activities to teacher_id records
-- Date: November 19, 2025
-- Description: Updates 101 special activities to use teacher_id links instead of free-text names
--
-- This migration:
-- 1. Updates teacher_id field to link to teacher records
-- 2. Updates teacher_name field to use formatted names (First Last)
-- 3. Maintains all 112 activities (11 already migrated, 101 being migrated here)
--
-- To run this migration:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run"
-- 4. Verify 101 rows were updated

UPDATE special_activities
SET
  teacher_id = CASE TRIM(teacher_name)
    WHEN 'Baker' THEN 'db825c47-3be1-45bf-9384-a9ae6203ae7e'::uuid
    WHEN 'Blazer' THEN 'ea252d07-324d-4718-bcbd-e6a857956c29'::uuid
    WHEN 'Brown' THEN 'c61c4bff-62e3-4471-ab3b-06c18fa930f6'::uuid
    WHEN 'Carcamo' THEN 'ad3fb552-b24e-4cfd-9b80-224e4d988897'::uuid
    WHEN 'Cheska' THEN 'e026ecf9-1bfe-4e52-8650-1d918c7c3c34'::uuid
    WHEN 'Cross' THEN '6fcb806d-de97-473c-b094-712775963a31'::uuid
    WHEN 'Erickson' THEN '895ab5bc-3214-4915-b112-07acba3a1666'::uuid
    WHEN 'Hopkins' THEN '3bb2caae-5ed2-4609-ba28-8d987ebdf613'::uuid
    WHEN 'Howisey' THEN 'd85e6831-f387-40c3-bb43-6245e09b3e87'::uuid
    WHEN 'Huaco' THEN '9d2f2456-8189-4bfc-85d4-a1c35c0fa022'::uuid
    WHEN 'Ils' THEN 'a5e9a913-74ea-4bec-a13c-d786bfd6d061'::uuid
    WHEN 'Lovejoy' THEN '2dff84ab-36e4-4608-b746-bcfb0e7fa93f'::uuid
    WHEN 'Mohr' THEN '730af4b1-9b11-44f3-9258-e8d8bbbed12b'::uuid
    WHEN 'Osterkamp' THEN '28d7a77e-b195-4b52-9716-43042cce78e8'::uuid
    WHEN 'Sansoe' THEN '2312f1a4-0c63-4c0a-9244-26b598615b30'::uuid
    WHEN 'Shelley' THEN 'd4529041-e57f-4d9c-8a05-270acfa7c0f7'::uuid
    WHEN 'VanOutrive' THEN '31ac1eba-5950-4d11-9b3b-4c2ea0fabf1e'::uuid
  END,
  teacher_name = CASE TRIM(teacher_name)
    WHEN 'Baker' THEN 'Elaine Baker'
    WHEN 'Blazer' THEN 'Jennifer Blazer'
    WHEN 'Brown' THEN 'Heidi Brown'
    WHEN 'Carcamo' THEN 'Rebecca Carcamo'
    WHEN 'Cheska' THEN 'Noelle Cheska'
    WHEN 'Cross' THEN 'Jane Cross'
    WHEN 'Erickson' THEN 'Katherine Erickson'
    WHEN 'Hopkins' THEN 'Julie Hopkins'
    WHEN 'Howisey' THEN 'Michelle Howisey'
    WHEN 'Huaco' THEN 'Deborah Huaco'
    WHEN 'Ils' THEN 'Jennifer Ils'
    WHEN 'Lovejoy' THEN 'Danielle Lovejoy'
    WHEN 'Mohr' THEN 'Sarah Mohr'
    WHEN 'Osterkamp' THEN 'Karen Osterkamp'
    WHEN 'Sansoe' THEN 'Ashley Sansoe'
    WHEN 'Shelley' THEN 'Joanna Shelley'
    WHEN 'VanOutrive' THEN 'Colleen VanOutrive'
  END,
  updated_at = now()
WHERE school_id = '062271002458'
  AND teacher_id IS NULL
  AND deleted_at IS NULL
  AND TRIM(teacher_name) IN (
    'Baker', 'Blazer', 'Brown', 'Carcamo', 'Cheska', 'Cross',
    'Erickson', 'Hopkins', 'Howisey', 'Huaco', 'Ils', 'Lovejoy',
    'Mohr', 'Osterkamp', 'Sansoe', 'Shelley', 'VanOutrive'
  );

-- Verification query - run after migration to confirm success
-- Expected result: 112 total activities, 112 with teacher_id (none with NULL)
SELECT
  COUNT(*) as total_activities,
  COUNT(teacher_id) as activities_with_teacher_id,
  COUNT(*) FILTER (WHERE teacher_id IS NULL) as activities_without_teacher_id
FROM special_activities
WHERE school_id = '062271002458'
  AND deleted_at IS NULL;
