-- Post-Migration Database Maintenance Script
-- Run this script AFTER all security fix migrations have completed
--
-- This script performs VACUUM and ANALYZE operations that cannot be run
-- inside transaction blocks. These commands should be run manually using
-- a direct database connection with autocommit enabled.
--
-- How to run:
--   psql -h <host> -U <user> -d <database> -f post_migration_maintenance.sql
--
-- Or from Supabase CLI:
--   supabase db execute -f supabase/migrations/post_migration_maintenance.sql --no-transaction

-- Reclaim space from deleted indexes and optimize storage
VACUUM ANALYZE public.saved_worksheets;
VACUUM ANALYZE public.exit_ticket_results;
VACUUM ANALYZE public.lessons;
VACUUM ANALYZE public.documents;

-- Update query planner statistics for tables with new indexes
ANALYZE public.schedule_sessions;
ANALYZE public.students;
ANALYZE public.exit_tickets;
ANALYZE public.profiles;
ANALYZE public.bell_schedules;
ANALYZE public.calendar_events;
ANALYZE public.special_activities;
ANALYZE public.teachers;
ANALYZE public.provider_schools;
ANALYZE public.schools;
ANALYZE public.subscriptions;
ANALYZE public.referral_relationships;
ANALYZE public.holidays;
ANALYZE public.analytics_events;
ANALYZE public.audit_logs;
ANALYZE public.worksheets;
ANALYZE public.worksheet_submissions;
ANALYZE public.student_details;

-- Display maintenance completion message
DO $$
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Post-migration maintenance completed successfully!';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Storage has been optimized via VACUUM';
  RAISE NOTICE 'Query planner statistics have been updated via ANALYZE';
  RAISE NOTICE 'Database is ready for production workloads';
END $$;
