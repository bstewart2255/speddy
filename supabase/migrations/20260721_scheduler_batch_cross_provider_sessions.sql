-- SPE-287: auto-scheduler cross-provider awareness (batched).
--
-- SPE-255 made the INTERACTIVE drag/drop placement warn (override-able) when a shared
-- student would be double-booked with another provider, via find_matching_provider_sessions
-- (per-student). The AUTO-scheduler (lib/scheduling/*) still finds free slots using only the
-- current provider's own sessions, so it can still auto-place a shared student on top of
-- another provider's session — a physical impossibility (one child, two rooms at once).
--
-- Owner decision (2026-07-21): the auto-scheduler should HARD-AVOID such slots (treat the
-- other provider's session as blocked time), not place-and-flag — an unattended batch run
-- should never knowingly create an impossible schedule. If no free slot remains, the student
-- falls into the existing "needs manual placement" path, where the interactive override lives.
--
-- The scheduler processes many students per run, so a per-student RPC per placement attempt
-- would be far too slow. This adds a BATCHED read: all cross-provider template sessions for a
-- set of the caller's students in ONE call, loaded into the scheduling context once. It reuses
-- the SPE-290 shared matcher (matching_provider_student_ids) so the grey bands, the interactive
-- warning, and the auto-scheduler can never disagree on "same child". Privacy is preserved:
-- like find_matching_provider_sessions, it returns only day/time/role — never the other
-- provider's student name. Owner scoping is enforced twice: the explicit src.provider_id =
-- auth.uid() filter, and the per-source owner check inside matching_provider_student_ids.

CREATE OR REPLACE FUNCTION public.find_matching_provider_sessions_batch(p_student_ids uuid[])
RETURNS TABLE(source_student_id uuid, day_of_week integer, start_time time without time zone, end_time time without time zone, provider_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    src.id AS source_student_id,
    ss.day_of_week::INTEGER,
    ss.start_time::TIME,
    ss.end_time::TIME,
    p.role AS provider_role
  FROM students src
  -- Only resolve matches for students the caller actually owns (defense in depth: the
  -- LATERAL helper repeats this owner check per source student).
  CROSS JOIN LATERAL public.matching_provider_student_ids(src.id) AS m(mid)
  JOIN students s ON s.id = m.mid
  JOIN profiles p ON p.id = s.provider_id
  JOIN schedule_sessions ss ON ss.student_id = s.id
  WHERE src.id = ANY(p_student_ids)
    AND src.provider_id = auth.uid()
    -- Template (unscheduled-date) sessions only, actually scheduled, not soft-deleted — same
    -- session predicates as find_matching_provider_sessions (SPE-255/290).
    AND ss.session_date IS NULL
    AND ss.start_time IS NOT NULL
    AND ss.end_time IS NOT NULL
    AND ss.deleted_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.find_matching_provider_sessions_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_matching_provider_sessions_batch(uuid[]) TO authenticated, service_role;
