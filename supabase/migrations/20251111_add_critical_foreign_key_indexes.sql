-- Add indexes on critical foreign keys to improve query performance
-- Performance Issue: Foreign keys without indexes can lead to slow queries and table scans
-- Documentation: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
--
-- This migration adds indexes on the most critical foreign keys based on:
-- 1. Table size (larger tables benefit more from indexes)
-- 2. Query frequency (tables commonly joined in queries)
-- 3. RLS policy usage (foreign keys used in security policies)
--
-- Priority 1: High-traffic tables (schedule_sessions, students, lessons)
-- Priority 2: Medium-traffic tables (exit_tickets, worksheets, profiles)
-- Priority 3: Supporting tables (analytics, audit logs, etc.)

-- ========================================
-- Priority 1: High-traffic tables
-- ========================================

-- schedule_sessions (2885 rows) - heavily queried table
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_assigned_to_sea_id
  ON public.schedule_sessions(assigned_to_sea_id)
  WHERE assigned_to_sea_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_assigned_to_specialist_id
  ON public.schedule_sessions(assigned_to_specialist_id)
  WHERE assigned_to_specialist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_completed_by
  ON public.schedule_sessions(completed_by)
  WHERE completed_by IS NOT NULL;

-- students (106 rows) - central table with many joins
CREATE INDEX IF NOT EXISTS idx_students_district_id
  ON public.students(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_id
  ON public.students(school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_state_id
  ON public.students(state_id)
  WHERE state_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_teacher_id
  ON public.students(teacher_id)
  WHERE teacher_id IS NOT NULL;

-- lessons (289 rows) - frequently queried for lesson generation
CREATE INDEX IF NOT EXISTS idx_lessons_district_id
  ON public.lessons(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_provider_id
  ON public.lessons(provider_id);

CREATE INDEX IF NOT EXISTS idx_lessons_school_id
  ON public.lessons(school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_state_id
  ON public.lessons(state_id)
  WHERE state_id IS NOT NULL;


-- ========================================
-- Priority 2: Medium-traffic tables
-- ========================================

-- exit_tickets (53 rows) - used in progress tracking
CREATE INDEX IF NOT EXISTS idx_exit_tickets_district_id
  ON public.exit_tickets(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exit_tickets_provider_id
  ON public.exit_tickets(provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exit_tickets_school_id
  ON public.exit_tickets(school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exit_tickets_state_id
  ON public.exit_tickets(state_id)
  WHERE state_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exit_tickets_student_id
  ON public.exit_tickets(student_id)
  WHERE student_id IS NOT NULL;

-- exit_ticket_results - new table for progress tracking
CREATE INDEX IF NOT EXISTS idx_exit_ticket_results_graded_by
  ON public.exit_ticket_results(graded_by);

-- worksheets (83 rows)
CREATE INDEX IF NOT EXISTS idx_worksheets_student_id
  ON public.worksheets(student_id)
  WHERE student_id IS NOT NULL;

-- worksheet_submissions
CREATE INDEX IF NOT EXISTS idx_worksheet_submissions_submitted_by
  ON public.worksheet_submissions(submitted_by)
  WHERE submitted_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worksheet_submissions_worksheet_id
  ON public.worksheet_submissions(worksheet_id)
  WHERE worksheet_id IS NOT NULL;

-- profiles (20 rows) - but queried frequently in RLS policies
CREATE INDEX IF NOT EXISTS idx_profiles_district_id
  ON public.profiles(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_school_id
  ON public.profiles(school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_state_id
  ON public.profiles(state_id)
  WHERE state_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_supervising_provider_id
  ON public.profiles(supervising_provider_id)
  WHERE supervising_provider_id IS NOT NULL;


-- ========================================
-- Priority 3: Supporting tables
-- ========================================

-- bell_schedules (497 rows)
CREATE INDEX IF NOT EXISTS idx_bell_schedules_district_id
  ON public.bell_schedules(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bell_schedules_school_id
  ON public.bell_schedules(school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bell_schedules_state_id
  ON public.bell_schedules(state_id)
  WHERE state_id IS NOT NULL;

-- calendar_events
CREATE INDEX IF NOT EXISTS idx_calendar_events_district_id
  ON public.calendar_events(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_school_id
  ON public.calendar_events(school_id)
  WHERE school_id IS NOT NULL;

-- special_activities (291 rows)
CREATE INDEX IF NOT EXISTS idx_special_activities_school_id
  ON public.special_activities(school_id)
  WHERE school_id IS NOT NULL;

-- teachers (70 rows)
CREATE INDEX IF NOT EXISTS idx_teachers_provider_id
  ON public.teachers(provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_school_id
  ON public.teachers(school_id)
  WHERE school_id IS NOT NULL;

-- provider_schools (15 rows)
CREATE INDEX IF NOT EXISTS idx_provider_schools_district_id
  ON public.provider_schools(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_schools_school_id
  ON public.provider_schools(school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_schools_state_id
  ON public.provider_schools(state_id)
  WHERE state_id IS NOT NULL;

-- schools (5083 rows) - large reference table
CREATE INDEX IF NOT EXISTS idx_schools_district_id
  ON public.schools(district_id)
  WHERE district_id IS NOT NULL;

-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);

-- referral_relationships
CREATE INDEX IF NOT EXISTS idx_referral_relationships_subscription_id
  ON public.referral_relationships(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- subscription_pauses
CREATE INDEX IF NOT EXISTS idx_subscription_pauses_subscription_id
  ON public.subscription_pauses(subscription_id);

-- holidays
CREATE INDEX IF NOT EXISTS idx_holidays_created_by
  ON public.holidays(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_holidays_updated_by
  ON public.holidays(updated_by)
  WHERE updated_by IS NOT NULL;

-- analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON public.analytics_events(user_id)
  WHERE user_id IS NOT NULL;

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id)
  WHERE user_id IS NOT NULL;

-- team_members
CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.team_members(user_id);

-- user_site_schedules
CREATE INDEX IF NOT EXISTS idx_user_site_schedules_site_id
  ON public.user_site_schedules(site_id);

-- schedule_share_requests
CREATE INDEX IF NOT EXISTS idx_schedule_share_requests_school_id
  ON public.schedule_share_requests(school_id);

-- progress_notifications
CREATE INDEX IF NOT EXISTS idx_progress_notifications_provider_id
  ON public.progress_notifications(provider_id);

CREATE INDEX IF NOT EXISTS idx_progress_notifications_student_id
  ON public.progress_notifications(student_id);

-- iep_goal_progress
CREATE INDEX IF NOT EXISTS idx_iep_goal_progress_student_id
  ON public.iep_goal_progress(student_id)
  WHERE student_id IS NOT NULL;

-- lesson_adjustment_queue
CREATE INDEX IF NOT EXISTS idx_lesson_adjustment_queue_student_id
  ON public.lesson_adjustment_queue(student_id);

CREATE INDEX IF NOT EXISTS idx_lesson_adjustment_queue_worksheet_submission_id
  ON public.lesson_adjustment_queue(worksheet_submission_id)
  WHERE worksheet_submission_id IS NOT NULL;

-- lesson_performance_history
CREATE INDEX IF NOT EXISTS idx_lesson_performance_history_student_id
  ON public.lesson_performance_history(student_id)
  WHERE student_id IS NOT NULL;

-- student_assessments
CREATE INDEX IF NOT EXISTS idx_student_assessments_student_id
  ON public.student_assessments(student_id);


-- ========================================
-- Verification & Statistics
-- ========================================

DO $$
DECLARE
  index_count INTEGER;
BEGIN
  -- Count newly created indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%_fkey' OR indexname LIKE 'idx_%_id';

  RAISE NOTICE 'Foreign key index optimization completed.';
  RAISE NOTICE 'Total indexes in public schema: %', index_count;
  RAISE NOTICE 'This should significantly improve JOIN performance and query execution times.';
  RAISE NOTICE 'Run ANALYZE on affected tables to update query planner statistics.';
END $$;

-- Note: ANALYZE can slow down migrations when run inside transactions
-- Run these commands manually after all migrations complete for better performance:
--
-- ANALYZE public.schedule_sessions;
-- ANALYZE public.students;
-- ANALYZE public.lessons;
-- ANALYZE public.exit_tickets;
-- ANALYZE public.profiles;
