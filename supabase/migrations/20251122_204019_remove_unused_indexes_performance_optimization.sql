-- Remove unused indexes identified by performance analysis
-- These indexes have never been used and are wasting disk space and slowing writes

-- Students table
DROP INDEX IF EXISTS idx_students_district_id;
DROP INDEX IF EXISTS idx_students_state_id;

-- Lessons table
DROP INDEX IF EXISTS idx_lessons_district_id;
DROP INDEX IF EXISTS idx_lessons_state_id;

-- Exit tickets table
DROP INDEX IF EXISTS idx_exit_tickets_district_id;
DROP INDEX IF EXISTS idx_exit_tickets_school_id;
DROP INDEX IF EXISTS idx_exit_tickets_state_id;

-- Profiles table
DROP INDEX IF EXISTS idx_profiles_district_id;
DROP INDEX IF EXISTS idx_profiles_state_id;
DROP INDEX IF EXISTS idx_profiles_supervising_provider_id;

-- Bell schedules table
DROP INDEX IF EXISTS idx_bell_schedules_district_id;
DROP INDEX IF EXISTS idx_bell_schedules_state_id;

-- Calendar events table
DROP INDEX IF EXISTS idx_calendar_events_district_id;
DROP INDEX IF EXISTS idx_calendar_events_school_id;

-- Provider schools table
DROP INDEX IF EXISTS idx_provider_schools_district_id;
DROP INDEX IF EXISTS idx_provider_schools_school_id;
DROP INDEX IF EXISTS idx_provider_schools_state_id;
