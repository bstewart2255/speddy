-- Migration: Convert from NCES IDs to UUIDs
--
-- This migration:
-- 1. Increases varchar column lengths to accommodate UUIDs (36 chars)
-- 2. Deletes all data except Mt. Diablo Unified district
-- 3. Generates new UUIDs for Mt. Diablo district and its schools
-- 4. Updates all FK references
-- 5. Deletes all unused NCES data

-- Step 0: Increase column lengths for UUID storage (36 characters)
-- Primary keys
ALTER TABLE districts ALTER COLUMN id TYPE varchar(36);
ALTER TABLE schools ALTER COLUMN id TYPE varchar(36);

-- Foreign key references
ALTER TABLE schools ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE profiles ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE profiles ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE admin_permissions ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE admin_permissions ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE bell_schedules ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE bell_schedules ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE provider_schools ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE provider_schools ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE students ALTER COLUMN district_id TYPE varchar(36);
ALTER TABLE students ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE teachers ALTER COLUMN school_id TYPE varchar(36);
ALTER TABLE unmatched_student_teachers ALTER COLUMN school_id TYPE varchar(36);

-- Step 1: Delete profiles not in Mt. Diablo Unified
DELETE FROM profiles
WHERE district_id != '0761754'
   OR district_id IS NULL;

-- Step 2: Delete admin_permissions not in Mt. Diablo Unified
DELETE FROM admin_permissions
WHERE district_id != '0761754';

-- Step 3: Create temporary mapping table for ID conversion
CREATE TEMP TABLE id_mapping (
    entity_type TEXT,
    old_id TEXT,
    new_id TEXT
);

-- Generate new UUID for Mt. Diablo district
INSERT INTO id_mapping (entity_type, old_id, new_id)
VALUES ('district', '0761754', gen_random_uuid()::text);

-- Generate new UUIDs for all Mt. Diablo schools
INSERT INTO id_mapping (entity_type, old_id, new_id)
SELECT 'school', id, gen_random_uuid()::text
FROM schools
WHERE district_id = '0761754';

-- Step 4: Update profiles with new district_id
UPDATE profiles p
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND p.district_id = m.old_id;

-- Step 5: Update profiles with new school_id
UPDATE profiles p
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND p.school_id = m.old_id;

-- Step 6: Update admin_permissions with new district_id
UPDATE admin_permissions ap
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND ap.district_id = m.old_id;

-- Step 7: Update admin_permissions with new school_id
UPDATE admin_permissions ap
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND ap.school_id = m.old_id;

-- Step 7a: Update provider_schools with new district_id
UPDATE provider_schools ps
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND ps.district_id = m.old_id;

-- Step 7b: Update provider_schools with new school_id
UPDATE provider_schools ps
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND ps.school_id = m.old_id;

-- Step 7c: Update students with new district_id
UPDATE students s
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND s.district_id = m.old_id;

-- Step 7d: Update students with new school_id
UPDATE students s
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND s.school_id = m.old_id;

-- Step 7e: Update teachers with new school_id
UPDATE teachers t
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND t.school_id = m.old_id;

-- Step 7f: Update unmatched_student_teachers with new school_id
UPDATE unmatched_student_teachers ust
SET school_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'school'
  AND ust.school_id = m.old_id;

-- Step 8: Delete all schools not in Mt. Diablo district
DELETE FROM schools WHERE district_id != '0761754';

-- Step 9: Update schools.district_id with new district UUID
UPDATE schools s
SET district_id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND s.district_id = m.old_id;

-- Step 10: Update schools.id with new UUIDs
-- Need to do this carefully - update each school individually
DO $$
DECLARE
    mapping RECORD;
BEGIN
    FOR mapping IN SELECT old_id, new_id FROM id_mapping WHERE entity_type = 'school'
    LOOP
        UPDATE schools SET id = mapping.new_id WHERE id = mapping.old_id;
    END LOOP;
END $$;

-- Step 11: Delete all other districts
DELETE FROM districts WHERE id != '0761754';

-- Step 12: Update Mt. Diablo district ID to new UUID
UPDATE districts d
SET id = m.new_id
FROM id_mapping m
WHERE m.entity_type = 'district'
  AND d.id = m.old_id;

-- Step 13: Clean up - drop temp table
DROP TABLE id_mapping;

-- Verification: Show what we migrated
DO $$
DECLARE
    district_count INT;
    school_count INT;
    profile_count INT;
BEGIN
    SELECT COUNT(*) INTO district_count FROM districts;
    SELECT COUNT(*) INTO school_count FROM schools;
    SELECT COUNT(*) INTO profile_count FROM profiles WHERE district_id IS NOT NULL;

    RAISE NOTICE 'Migration complete: % district(s), % school(s), % profile(s) with district',
        district_count, school_count, profile_count;
END $$;
