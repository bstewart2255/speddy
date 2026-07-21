-- SPE-291: rolling top-up of dated session instances from active templates.
--
-- Dated instances used to be generated only when a template transitioned
-- unscheduled -> scheduled (through school-year end), so the supply of future
-- instances expired every July 1 with nothing renewing it. This function
-- extends every active scheduled template to a rolling N-week horizon in one
-- set-based, conflict-tolerant statement. It is invoked daily from the
-- cleanup-uploads cron route (Vercel Hobby caps cron jobs at two, so the
-- dedicated /api/cron/topup-session-instances route is manual-only) and is
-- safe to re-run at any time (ON CONFLICT DO NOTHING against
-- unique_session_per_date).
--
-- Deliberate parity with existing generation behavior
-- (lib/services/session-instance-generator.ts): copies the same template
-- fields, sets template_id, does NOT skip holidays (SPE-299 tracks doc drift;
-- holiday awareness would be a separate product decision).
--
-- Duplicate semantics: unique_session_per_date is global on
-- (student_id, session_date, start_time), so if two providers' templates
-- target the same student/date/time (possible via the SPE-255 double-book
-- override), this insert claims the slot for whichever template it reaches
-- first and skips the other — and because it runs daily, the other provider's
-- lazy persist-on-touch path will keep losing the race until the overlap is
-- resolved. Zero colliding template pairs exist today; making the per-template
-- generators conflict-tolerant is tracked in SPE-293.

CREATE OR REPLACE FUNCTION public.topup_session_instances(p_weeks_ahead integer DEFAULT 12)
-- templates_processed = templates ELIGIBLE for top-up (counted before the
-- insert); a template whose dates all already exist still counts. In steady
-- state expect (N, ~N/7 per day) — (616, 0) right after a full run is normal.
RETURNS TABLE (templates_processed bigint, instances_created bigint)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Clamp to a sane range: at least 1 week, at most 26 (half a year) so a bad
  -- caller can't mass-materialize rows.
  v_weeks integer := LEAST(GREATEST(COALESCE(p_weeks_ahead, 12), 1), 26);
  v_templates bigint;
  v_created bigint;
BEGIN
  SELECT count(*) INTO v_templates
  FROM schedule_sessions t
  WHERE t.session_date IS NULL
    AND t.deleted_at IS NULL
    AND t.day_of_week IS NOT NULL
    AND t.start_time IS NOT NULL
    AND t.end_time IS NOT NULL
    AND t.student_id IS NOT NULL
    AND t.provider_id IS NOT NULL;

  INSERT INTO schedule_sessions (
    student_id, provider_id, day_of_week, start_time, end_time,
    service_type, session_date, delivered_by,
    assigned_to_specialist_id, assigned_to_sea_id,
    manually_placed, group_id, group_name, group_color, status,
    student_absent, outside_schedule_conflict, is_completed,
    template_id, is_template
  )
  SELECT
    t.student_id, t.provider_id, t.day_of_week, t.start_time, t.end_time,
    t.service_type, d.instance_date, t.delivered_by,
    t.assigned_to_specialist_id, t.assigned_to_sea_id,
    t.manually_placed, t.group_id, t.group_name, t.group_color, t.status,
    false, false, false,
    t.id, false
  FROM schedule_sessions t
  CROSS JOIN LATERAL (
    -- Next occurrence of the template's weekday (today counts), then one date
    -- per week out to the horizon. day_of_week uses Postgres DOW numbering
    -- (1-5 = Mon-Fri), verified against live instance data.
    SELECT (CURRENT_DATE
            + ((t.day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7)
            + (n * 7))::date AS instance_date
    FROM generate_series(0, v_weeks - 1) AS n
  ) d
  WHERE t.session_date IS NULL
    AND t.deleted_at IS NULL
    AND t.day_of_week IS NOT NULL
    AND t.start_time IS NOT NULL
    AND t.end_time IS NOT NULL
    AND t.student_id IS NOT NULL
    AND t.provider_id IS NOT NULL
  ON CONFLICT (student_id, session_date, start_time) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN QUERY SELECT v_templates, v_created;
END;
$$;

-- Service-role only: the cron route is the sole intended caller. Authenticated
-- users must not be able to mass-insert rows for templates RLS lets them see.
REVOKE ALL ON FUNCTION public.topup_session_instances(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topup_session_instances(integer) FROM anon;
REVOKE ALL ON FUNCTION public.topup_session_instances(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.topup_session_instances(integer) TO service_role;
