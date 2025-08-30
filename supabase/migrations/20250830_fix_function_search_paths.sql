-- Fix function search path security warnings by setting search_path to 'public'
-- This prevents potential security issues from search path manipulation

-- Drop and recreate functions with proper search_path setting

-- 1. update_calendar_events_updated_at
DROP FUNCTION IF EXISTS public.update_calendar_events_updated_at CASCADE;
CREATE OR REPLACE FUNCTION public.update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. update_ai_generated_lessons_updated_at
DROP FUNCTION IF EXISTS public.update_ai_generated_lessons_updated_at CASCADE;
CREATE OR REPLACE FUNCTION public.update_ai_generated_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. update_holidays_updated_at
DROP FUNCTION IF EXISTS public.update_holidays_updated_at CASCADE;
CREATE OR REPLACE FUNCTION public.update_holidays_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. set_holidays_created_by
DROP FUNCTION IF EXISTS public.set_holidays_created_by CASCADE;
CREATE OR REPLACE FUNCTION public.set_holidays_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 5. update_updated_at_column
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Now update existing functions to add search_path without dropping them
-- This preserves any dependencies

-- 6. upsert_special_activity (has overloads)
ALTER FUNCTION public.upsert_special_activity(uuid, text, text, text, integer, time, time, text, varchar)
SET search_path = public;

ALTER FUNCTION public.upsert_special_activity(uuid, uuid, text, text, integer, time, time, text, varchar)
SET search_path = public;

-- 7. upsert_bell_schedule (has overloads)
ALTER FUNCTION public.upsert_bell_schedule(uuid, text, text, text, integer, time, time, text, varchar)
SET search_path = public;

ALTER FUNCTION public.upsert_bell_schedule(uuid, uuid, text, text, integer, time, time, text, varchar)
SET search_path = public;

-- 8. update_performance_metrics (trigger function, no parameters)
ALTER FUNCTION public.update_performance_metrics()
SET search_path = public;

-- 9. get_pending_adjustments
ALTER FUNCTION public.get_pending_adjustments(uuid)
SET search_path = public;

-- 10. can_assign_sea_to_session
ALTER FUNCTION public.can_assign_sea_to_session(uuid, uuid)
SET search_path = public;

-- 11. get_scheduling_data_batch
ALTER FUNCTION public.get_scheduling_data_batch(uuid, text)
SET search_path = public;

-- 12. find_all_team_members_v2
ALTER FUNCTION public.find_all_team_members_v2(uuid)
SET search_path = public;

-- 13. get_school_migration_stats (no parameters)
ALTER FUNCTION public.get_school_migration_stats()
SET search_path = public;

-- 14. find_school_ids_by_names
ALTER FUNCTION public.find_school_ids_by_names(text, text, text)
SET search_path = public;

-- 15. create_profile_for_new_user
ALTER FUNCTION public.create_profile_for_new_user(uuid, text, jsonb)
SET search_path = public;

-- 16. get_available_seas
ALTER FUNCTION public.get_available_seas(uuid, uuid)
SET search_path = public;

-- 17. find_all_team_members_multi_school
ALTER FUNCTION public.find_all_team_members_multi_school(uuid, varchar)
SET search_path = public;

-- 18. get_user_schools
ALTER FUNCTION public.get_user_schools(uuid)
SET search_path = public;

-- Move pg_trgm extension out of public schema
-- First, create a dedicated schema for extensions
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move pg_trgm extension to extensions schema
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Update search_path for database to include extensions schema
-- This ensures functions can still use pg_trgm functions
ALTER DATABASE postgres SET search_path TO public, extensions;

-- Recreate any triggers that were dropped
-- Check if triggers exist and recreate them if needed
DO $$
BEGIN
  -- calendar_events trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_calendar_events_updated_at' 
    AND tgrelid = 'public.calendar_events'::regclass
  ) THEN
    CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.update_calendar_events_updated_at();
  END IF;

  -- ai_generated_lessons trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_ai_generated_lessons_updated_at' 
    AND tgrelid = 'public.ai_generated_lessons'::regclass
  ) THEN
    CREATE TRIGGER update_ai_generated_lessons_updated_at
    BEFORE UPDATE ON public.ai_generated_lessons
    FOR EACH ROW
    EXECUTE FUNCTION public.update_ai_generated_lessons_updated_at();
  END IF;

  -- holidays triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_holidays_updated_at' 
    AND tgrelid = 'public.holidays'::regclass
  ) THEN
    CREATE TRIGGER update_holidays_updated_at
    BEFORE UPDATE ON public.holidays
    FOR EACH ROW
    EXECUTE FUNCTION public.update_holidays_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'set_holidays_created_by' 
    AND tgrelid = 'public.holidays'::regclass
  ) THEN
    CREATE TRIGGER set_holidays_created_by
    BEFORE INSERT ON public.holidays
    FOR EACH ROW
    EXECUTE FUNCTION public.set_holidays_created_by();
  END IF;
END
$$;

-- Add comment about auth leaked password protection
-- This is a Supabase Auth configuration that needs to be enabled in the dashboard
COMMENT ON SCHEMA public IS 'Public schema - Note: Leaked password protection should be enabled in Supabase Auth settings (Dashboard > Authentication > Auth Providers > Email > Password Security)';