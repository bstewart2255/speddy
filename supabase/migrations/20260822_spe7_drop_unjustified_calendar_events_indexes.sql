-- SPE-7 follow-up: drop two indexes added in 20260822_spe7_add_fk_indexes.sql
-- on a justification that turned out to be stale.
--
-- That migration cited the RLS policy "SEAs can view provider calendar
-- events" as matching calendar_events.district_id and .school_id directly.
-- That policy was dropped and replaced in 20251003_fix_rls_performance.sql
-- by "Users can view calendar events", which scopes SEAs via
-- school_site/school_district (both always NULL on every current row) and
-- provider_id — never district_id or school_id. No app query filters
-- calendar_events by district_id or school_id either (both call sites in
-- weekly-view.tsx and calendar-week-view.tsx filter only by provider_id).
--
-- calendar_events.provider_id, added in the same migration, is unaffected
-- and stays: it's the column the live RLS policy and every app query
-- actually filter on.

DROP INDEX IF EXISTS public.idx_calendar_events_district_id;
DROP INDEX IF EXISTS public.idx_calendar_events_school_id;
