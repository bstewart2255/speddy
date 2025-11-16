-- Clean up duplicate teacher records at Mt Diablo Elementary School
-- This migration uses VERIFIED IDs from the actual database (checked 2025-11-14)
--
-- This migration:
-- 1. Migrates students from old incomplete teacher records to new complete ones
-- 2. Handles the Ills/Ils spelling difference
-- 3. Deletes all old incomplete teacher records

-- ============================================================================
-- MIGRATE STUDENTS FROM OLD TO NEW TEACHER RECORDS
-- ============================================================================

-- Grispo: Migrate 2 students from old incomplete record to new "Aimee Grispo"
-- Old: a273268e-e5dc-47a3-ba13-edf88c2baa4a (null, "Grispo", null, created_by_admin=false)
-- New: 46617368-3a79-4b5c-b474-7c099942148d ("Aimee", "Grispo", "grispoa@mdusd.org", created_by_admin=true)
UPDATE students
SET
  teacher_id = '46617368-3a79-4b5c-b474-7c099942148d',
  teacher_name = 'Aimee Grispo'
WHERE teacher_id = 'a273268e-e5dc-47a3-ba13-edf88c2baa4a';

-- Ills → Ils: Migrate 1 student from old "Ills" to new "Jennifer Ils"
-- Old: 67b1cc9a-2097-49c4-a494-152d111de417 (null, "Ills", null, created_by_admin=false)
-- New: a5e9a913-74ea-4bec-a13c-d786bfd6d061 ("Jennifer", "Ils", "ilsj@mdusd.org", created_by_admin=true)
-- Note: Handling spelling difference between old "Ills" and new "Ils"
UPDATE students
SET
  teacher_id = 'a5e9a913-74ea-4bec-a13c-d786bfd6d061',
  teacher_name = 'Jennifer Ils'
WHERE teacher_id = '67b1cc9a-2097-49c4-a494-152d111de417';

-- ============================================================================
-- DELETE OLD INCOMPLETE TEACHER RECORDS
-- ============================================================================

-- Delete old incomplete teacher records that had students (now migrated)
DELETE FROM teachers WHERE id IN (
  'a273268e-e5dc-47a3-ba13-edf88c2baa4a',  -- Grispo (old, had 2 students)
  '67b1cc9a-2097-49c4-a494-152d111de417'   -- Ills (old, had 1 student)
);

-- Delete old incomplete teacher records with no students assigned
DELETE FROM teachers WHERE id IN (
  '5e045815-d908-454a-ba46-69579cac86c7',  -- Carcamo (old, 0 students)
  '2fda201e-3a3c-40ce-a31f-9446b5d4ea4e',  -- Cheska (old, 0 students)
  '76348e43-19dc-4817-8bff-85eba31eab80',  -- Erickson (old, 0 students)
  '6d2c987a-44b4-45fa-ae01-db9bd17ace44',  -- Hopkins (old, 0 students)
  '6a060926-fdd5-40ed-a1ca-243675ae6b65',  -- Howisey (old, 0 students)
  '2f90961f-a893-461e-ad6b-c4eb7d052692'   -- Huaco (old, 0 students)
);
