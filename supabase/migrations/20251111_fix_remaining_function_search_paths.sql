-- Fix remaining mutable search_path in database functions to prevent privilege escalation
-- Security Issue: Functions without explicit search_path can be exploited
-- Documentation: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--
-- This migration fixes the 5 functions that were flagged in security audit:
-- 1. auto_ungroup_on_delivered_by_change
-- 2. forbid_provider_id_change
-- 3. can_assign_sea_to_session (2-parameter version)
-- 4. recalculate_session_end_time
-- 5. update_exit_ticket_results_updated_at

-- 1. Fix auto_ungroup_on_delivered_by_change
-- Add SET search_path to existing trigger function
ALTER FUNCTION public.auto_ungroup_on_delivered_by_change()
SET search_path TO 'public', 'pg_temp';

COMMENT ON FUNCTION public.auto_ungroup_on_delivered_by_change() IS
'Automatically ungroups sessions when delivered_by changes. Security: search_path set to prevent privilege escalation.';


-- 2. Fix forbid_provider_id_change
-- Add SET search_path to existing trigger function
ALTER FUNCTION public.forbid_provider_id_change()
SET search_path TO 'public', 'pg_temp';

COMMENT ON FUNCTION public.forbid_provider_id_change() IS
'Prevents modification of immutable provider_id field. Security: search_path set to prevent privilege escalation.';


-- 3. Fix can_assign_sea_to_session (2-parameter version)
-- The 3-parameter version already has search_path set, but the 2-parameter version doesn't
ALTER FUNCTION public.can_assign_sea_to_session(uuid, uuid)
SET search_path TO 'public', 'pg_temp';

COMMENT ON FUNCTION public.can_assign_sea_to_session(uuid, uuid) IS
'Checks if a provider can assign an SEA to a session (legacy 2-parameter version). Security: search_path set to prevent privilege escalation.';


-- 4. Fix recalculate_session_end_time
-- Add SET search_path to existing function
ALTER FUNCTION public.recalculate_session_end_time(time without time zone, integer)
SET search_path TO 'public', 'pg_temp';

COMMENT ON FUNCTION public.recalculate_session_end_time(time without time zone, integer) IS
'Calculates session end time based on start time and duration. Security: search_path set to prevent privilege escalation.';


-- 5. Fix update_exit_ticket_results_updated_at
-- Add SET search_path to existing trigger function
ALTER FUNCTION public.update_exit_ticket_results_updated_at()
SET search_path TO 'public', 'pg_temp';

COMMENT ON FUNCTION public.update_exit_ticket_results_updated_at() IS
'Updates the updated_at timestamp on exit_ticket_results. Security: search_path set to prevent privilege escalation.';


-- Verify all functions now have search_path set
DO $$
DECLARE
  func_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'auto_ungroup_on_delivered_by_change',
      'forbid_provider_id_change',
      'can_assign_sea_to_session',
      'recalculate_session_end_time',
      'update_exit_ticket_results_updated_at'
    )
    AND prosecdef = false  -- Not SECURITY DEFINER
    AND proconfig IS NULL; -- No configuration (including search_path)

  IF func_count > 0 THEN
    RAISE WARNING 'Some functions still do not have search_path set. Count: %', func_count;
  ELSE
    RAISE NOTICE 'All targeted functions now have search_path configured.';
  END IF;
END $$;
