-- BACKUP LEGACY SCHOOL DATA BEFORE CLEANUP
-- This migration creates backup tables for all text-based school data
-- Run this BEFORE removing legacy columns

-- Create backup schema
CREATE SCHEMA IF NOT EXISTS legacy_backup;

-- Backup profiles with text-based school data
CREATE TABLE IF NOT EXISTS legacy_backup.profiles_school_data AS
SELECT 
  id,
  email,
  school_district,
  school_site,
  school_district_original,
  school_site_original,
  created_at,
  updated_at,
  -- Include migration status
  CASE WHEN school_id IS NOT NULL THEN true ELSE false END as was_migrated,
  school_id,
  district_id,
  state_id
FROM profiles
WHERE school_district IS NOT NULL 
   OR school_site IS NOT NULL 
   OR school_district_original IS NOT NULL 
   OR school_site_original IS NOT NULL;

-- Create index for quick lookups
CREATE INDEX idx_legacy_backup_profiles_id ON legacy_backup.profiles_school_data(id);
CREATE INDEX idx_legacy_backup_profiles_email ON legacy_backup.profiles_school_data(email);

-- Backup students table
CREATE TABLE IF NOT EXISTS legacy_backup.students_school_data AS
SELECT 
  id,
  provider_id,
  school_district,
  school_site,
  created_at,
  updated_at,
  -- Include migration status
  CASE WHEN school_id IS NOT NULL THEN true ELSE false END as was_migrated,
  school_id
FROM students
WHERE school_district IS NOT NULL OR school_site IS NOT NULL;

-- Backup bell_schedules table
CREATE TABLE IF NOT EXISTS legacy_backup.bell_schedules_school_data AS
SELECT 
  id,
  provider_id,
  school_district,
  school_site,
  created_at,
  -- Include migration status
  CASE WHEN school_id IS NOT NULL THEN true ELSE false END as was_migrated,
  school_id
FROM bell_schedules
WHERE school_district IS NOT NULL OR school_site IS NOT NULL;

-- Backup provider_schools table (entirely text-based)
CREATE TABLE IF NOT EXISTS legacy_backup.provider_schools AS
SELECT * FROM provider_schools;

-- Create migration audit log
CREATE TABLE IF NOT EXISTS legacy_backup.migration_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  table_name TEXT,
  total_records INTEGER,
  migrated_records INTEGER,
  unmigrated_records INTEGER,
  notes TEXT
);

-- Insert audit records
INSERT INTO legacy_backup.migration_audit (table_name, total_records, migrated_records, unmigrated_records, notes)
SELECT 
  'profiles' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN school_id IS NOT NULL THEN 1 END) as migrated_records,
  COUNT(CASE WHEN school_id IS NULL THEN 1 END) as unmigrated_records,
  'Backup of profiles table school data' as notes
FROM profiles
WHERE school_district IS NOT NULL OR school_site IS NOT NULL;

INSERT INTO legacy_backup.migration_audit (table_name, total_records, migrated_records, unmigrated_records, notes)
SELECT 
  'students' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN school_id IS NOT NULL THEN 1 END) as migrated_records,
  COUNT(CASE WHEN school_id IS NULL THEN 1 END) as unmigrated_records,
  'Backup of students table school data' as notes
FROM students
WHERE school_district IS NOT NULL OR school_site IS NOT NULL;

INSERT INTO legacy_backup.migration_audit (table_name, total_records, migrated_records, unmigrated_records, notes)
SELECT 
  'bell_schedules' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN school_id IS NOT NULL THEN 1 END) as migrated_records,
  COUNT(CASE WHEN school_id IS NULL THEN 1 END) as unmigrated_records,
  'Backup of bell_schedules table school data' as notes
FROM bell_schedules
WHERE school_district IS NOT NULL OR school_site IS NOT NULL;

-- Create view for easy access to unmigrated users
CREATE OR REPLACE VIEW legacy_backup.unmigrated_users AS
SELECT 
  p.id,
  p.email,
  p.school_district,
  p.school_site,
  p.created_at,
  COUNT(s.id) as student_count
FROM profiles p
LEFT JOIN students s ON s.provider_id = p.id
WHERE p.school_id IS NULL
  AND p.school_site IS NOT NULL
GROUP BY p.id, p.email, p.school_district, p.school_site, p.created_at
ORDER BY p.created_at DESC;

-- Grant access to admin users
GRANT USAGE ON SCHEMA legacy_backup TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA legacy_backup TO authenticated;

-- Add comment for documentation
COMMENT ON SCHEMA legacy_backup IS 'Backup of legacy text-based school data before migration cleanup. Created on deployment of structured school system.';
COMMENT ON TABLE legacy_backup.profiles_school_data IS 'Complete backup of all text-based school data from profiles table';
COMMENT ON TABLE legacy_backup.migration_audit IS 'Audit log of backup and migration status at time of backup';