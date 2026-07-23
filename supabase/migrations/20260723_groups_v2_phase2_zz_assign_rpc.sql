-- Groups v2 · Phase 2 (SPE-311), increment 3 — assign a whole group to an
-- SEA/specialist (decision #10), non-destructively.
--
-- The delivered_by delegation triggers force-ungroup a session when its deliverer
-- changes. Group assignment must instead keep the group intact and move ALL
-- members' deliverer together. Both triggers now short-circuit while a
-- transaction-local guard (app.groups_v2_assigning = '1') is set, which ONLY
-- groups_v2_assign sets — every other delivered_by change (the per-session assign
-- flow) still ungroups exactly as before. The member UPDATE still passes through
-- validate_session_assignment_permissions (can_assign_sea_to_session), so a
-- provider can only assign to SEAs/specialists they're permitted to.
--
-- ORDERING (the `zz` in the filename): this file recreates the two delegation
-- trigger functions WITH the guard; 20260723_groups_v2_phase2_triggers_clear_group_ref.sql
-- recreates the SAME functions WITHOUT it. On a fresh file-order apply
-- (`supabase db reset` / CI), the last definition wins — so this file MUST sort
-- AFTER that one, hence the `phase2_zz_assign_rpc` name. Do not rename it earlier.

CREATE OR REPLACE FUNCTION auto_ungroup_on_delivered_by_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL
     AND current_setting('app.groups_v2_assigning', true) IS DISTINCT FROM '1' THEN
    NEW.group_id := NULL;
    NEW.group_name := NULL;
    NEW.group_color := NULL;
    NEW.group_ref := NULL;
    RAISE NOTICE 'Auto-ungrouped template session % due to delivered_by change from % to %',
      NEW.id, OLD.delivered_by, NEW.delivered_by;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION propagate_ungroup_after_delivered_by_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  remaining_count INTEGER; last_template_id UUID; last_provider_id UUID;
  last_student_id UUID; last_day_of_week INTEGER; last_start_time TIME;
BEGIN
  IF OLD.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL
     AND NEW.group_id IS NULL
     AND current_setting('app.groups_v2_assigning', true) IS DISTINCT FROM '1' THEN

    UPDATE schedule_sessions
    SET group_id = NULL, group_name = NULL, group_color = NULL, group_ref = NULL, updated_at = NOW()
    WHERE provider_id = OLD.provider_id AND student_id = OLD.student_id
      AND day_of_week = OLD.day_of_week AND start_time = OLD.start_time
      AND session_date IS NOT NULL AND session_date >= CURRENT_DATE;

    SELECT COUNT(*) INTO remaining_count FROM schedule_sessions
    WHERE group_id = OLD.group_id AND session_date IS NULL AND deleted_at IS NULL;

    IF remaining_count = 1 THEN
      SELECT id, provider_id, student_id, day_of_week, start_time
      INTO last_template_id, last_provider_id, last_student_id, last_day_of_week, last_start_time
      FROM schedule_sessions WHERE group_id = OLD.group_id AND session_date IS NULL AND deleted_at IS NULL LIMIT 1;
      UPDATE schedule_sessions SET group_id=NULL, group_name=NULL, group_color=NULL, group_ref=NULL, updated_at=NOW()
      WHERE id = last_template_id;
      UPDATE schedule_sessions SET group_id=NULL, group_name=NULL, group_color=NULL, group_ref=NULL, updated_at=NOW()
      WHERE provider_id=last_provider_id AND student_id=last_student_id AND day_of_week=last_day_of_week
        AND start_time=last_start_time AND session_date IS NOT NULL AND session_date >= CURRENT_DATE;
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM anon;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM authenticated;

CREATE OR REPLACE FUNCTION public.groups_v2_assign(p_group_id uuid, p_delivered_by text, p_assignee uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_g record; v_tid uuid;
  v_provider uuid; v_student uuid; v_dow int; v_start time; v_sea uuid; v_spec uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_delivered_by NOT IN ('provider','sea','specialist') THEN RAISE EXCEPTION 'invalid deliverer'; END IF;
  IF p_delivered_by IN ('sea','specialist') AND p_assignee IS NULL THEN RAISE EXCEPTION 'an assignee is required'; END IF;
  SELECT * INTO v_g FROM session_groups WHERE id = p_group_id;
  IF v_g IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;
  IF v_g.provider_id <> v_uid THEN RAISE EXCEPTION 'not the owner of this group'; END IF;
  IF v_g.retired_at IS NOT NULL THEN RAISE EXCEPTION 'cannot assign a retired group'; END IF;
  -- Permission is enforced per-member by validate_session_assignment_permissions
  -- during the UPDATE loop below; a memberless group would skip the loop and thus
  -- the check, so reject it (it also has nothing to deliver).
  IF NOT EXISTS (
    SELECT 1 FROM schedule_sessions
    WHERE group_ref = p_group_id AND session_date IS NULL AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot assign a group with no members';
  END IF;

  v_sea  := CASE WHEN p_delivered_by = 'sea' THEN p_assignee ELSE NULL END;
  v_spec := CASE WHEN p_delivered_by = 'specialist' THEN p_assignee ELSE NULL END;

  PERFORM set_config('app.groups_v2_assigning', '1', true);  -- suppress the ungroup triggers

  UPDATE session_groups
  SET delivered_by = p_delivered_by, assigned_to_sea_id = v_sea,
      assigned_to_specialist_id = v_spec, updated_at = now()
  WHERE id = p_group_id;

  FOR v_tid IN SELECT id FROM schedule_sessions
    WHERE group_ref = p_group_id AND session_date IS NULL AND deleted_at IS NULL LOOP
    SELECT provider_id, student_id, day_of_week, start_time
      INTO v_provider, v_student, v_dow, v_start FROM schedule_sessions WHERE id = v_tid;
    UPDATE schedule_sessions s
    SET delivered_by = p_delivered_by, assigned_to_sea_id = v_sea,
        assigned_to_specialist_id = v_spec, updated_at = now()
    WHERE (s.id = v_tid OR s.template_id = v_tid
           OR (s.provider_id = v_provider AND s.student_id = v_student
               AND s.day_of_week = v_dow AND s.start_time = v_start))
      AND (s.session_date IS NULL OR s.session_date >= CURRENT_DATE)
      AND s.deleted_at IS NULL;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.groups_v2_assign(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.groups_v2_assign(uuid, text, uuid) TO authenticated;
