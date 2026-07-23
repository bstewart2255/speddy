-- Groups v2 · Phase 1a (SPE-309) — session_groups table + group_ref FKs + RLS.
--
-- Schema only, ADDITIVE, no behavior change. The legacy denormalized columns
-- (schedule_sessions.group_id/group_name/group_color, lessons.group_id) stay and
-- are dual-written by the API through the migration window; they are dropped in
-- Phase 5 after a bake period. See "Groups v2 — Design Spec" §4.
--
-- Idempotent/re-runnable: IF NOT EXISTS on structures, DROP POLICY IF EXISTS
-- before each CREATE POLICY.

-- ---------------------------------------------------------------------------
-- 1. session_groups: the durable, thin group record (identity + memory).
--    Rows are NEVER hard-deleted in normal operation (retire = set retired_at).
--    Nothing in schedule_sessions/lessons cascade-deletes a row here — the whole
--    point of Groups v2 is that reshuffling sessions never destroys group
--    history. (provider_id CASCADE matches lessons.provider_id: a full provider
--    account deletion still erases that provider's own groups.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivered_by text NOT NULL DEFAULT 'provider'
    CHECK (delivered_by IN ('provider', 'sea', 'specialist')),
  assigned_to_sea_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to_specialist_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text,
  color integer CHECK (color IS NULL OR (color BETWEEN 0 AND 4)),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_groups_provider
  ON public.session_groups(provider_id);
CREATE INDEX IF NOT EXISTS idx_session_groups_sea
  ON public.session_groups(assigned_to_sea_id) WHERE assigned_to_sea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_groups_specialist
  ON public.session_groups(assigned_to_specialist_id) WHERE assigned_to_specialist_id IS NOT NULL;

COMMENT ON TABLE public.session_groups IS
  'Groups v2 durable group record (identity/name/color/delivery). Retire, never hard-delete (retired_at). schedule_sessions.group_ref / lessons.group_ref point here.';

-- ---------------------------------------------------------------------------
-- 2. group_ref FKs. Historical instances keep their group_ref forever.
--    schedule_sessions: ON DELETE RESTRICT — a group with live session rows
--    cannot be deleted (enforces "never orphan history"; we retire instead).
--    lessons: ON DELETE SET NULL — a lesson survives its group being removed;
--    its student_ids/student_details snapshot keeps it legible.
-- ---------------------------------------------------------------------------
ALTER TABLE public.schedule_sessions
  ADD COLUMN IF NOT EXISTS group_ref uuid REFERENCES public.session_groups(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_group_ref
  ON public.schedule_sessions(group_ref) WHERE group_ref IS NOT NULL;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS group_ref uuid REFERENCES public.session_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_group_ref
  ON public.lessons(group_ref) WHERE group_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger (reuse the shared update_updated_at() from
--    20250906_unified_lessons_simple.sql).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS session_groups_updated_at ON public.session_groups;
CREATE TRIGGER session_groups_updated_at
  BEFORE UPDATE ON public.session_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS. SELECT for the owning provider and the current assignee
--    (sea/specialist); INSERT/UPDATE owner-only. No DELETE policy — rows are
--    never hard-deleted. Mirrors the schedule_sessions policy idioms
--    (`(select auth.uid())`).
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_groups_select ON public.session_groups;
CREATE POLICY session_groups_select ON public.session_groups
  FOR SELECT USING (
    provider_id = (select auth.uid())
    OR assigned_to_sea_id = (select auth.uid())
    OR assigned_to_specialist_id = (select auth.uid())
  );

DROP POLICY IF EXISTS session_groups_insert ON public.session_groups;
CREATE POLICY session_groups_insert ON public.session_groups
  FOR INSERT WITH CHECK (provider_id = (select auth.uid()));

DROP POLICY IF EXISTS session_groups_update ON public.session_groups;
CREATE POLICY session_groups_update ON public.session_groups
  FOR UPDATE USING (provider_id = (select auth.uid()))
  WITH CHECK (provider_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Instance materialization must copy group_ref. Recreate
--    topup_session_instances() (20260721_add_topup_session_instances_fn.sql)
--    with group_ref added to the copied template fields. Everything else is
--    byte-for-byte the same (clamp, DOW math, ON CONFLICT, grants).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.topup_session_instances(p_weeks_ahead integer DEFAULT 12)
RETURNS TABLE (templates_processed bigint, instances_created bigint)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
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
    manually_placed, group_id, group_name, group_color, group_ref, status,
    student_absent, outside_schedule_conflict, is_completed,
    template_id, is_template
  )
  SELECT
    t.student_id, t.provider_id, t.day_of_week, t.start_time, t.end_time,
    t.service_type, d.instance_date, t.delivered_by,
    t.assigned_to_specialist_id, t.assigned_to_sea_id,
    t.manually_placed, t.group_id, t.group_name, t.group_color, t.group_ref, t.status,
    false, false, false,
    t.id, false
  FROM schedule_sessions t
  CROSS JOIN LATERAL (
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

REVOKE ALL ON FUNCTION public.topup_session_instances(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.topup_session_instances(integer) FROM anon;
REVOKE ALL ON FUNCTION public.topup_session_instances(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.topup_session_instances(integer) TO service_role;
