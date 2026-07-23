-- Groups v2 · Phase 2 (SPE-311), increment 2 — the transactional mutation layer.
--
-- The legacy /api/sessions/group + /ungroup routes mutate grouping in JS across
-- several non-atomic Supabase calls (fetch → mint record → update template →
-- loop-update instances). That non-transactional shape is the source of this
-- domain's history of partial-update corruption (spec §1). Phase 2 replaces it
-- with SECURITY DEFINER RPCs that do each membership change in ONE transaction.
--
-- Invariants every RPC here upholds (spec §3 #3, §4):
--   • Owner-scoped. auth.uid() must own every session/record touched; SECURITY
--     DEFINER bypasses RLS, so ownership is re-checked explicitly and a mismatch
--     RAISEs (rolls back the whole op).
--   • Future-only. Only the template (session_date IS NULL) and today/future
--     instances are stamped; delivered past instances are immutable.
--   • Dual-write. Legacy group_id/group_name/group_color are written alongside
--     the durable group_ref through the bake window (dropped in Phase 5). The
--     convention is identity-mapped: legacy group_id = session_groups.id, so the
--     Today/Week/Day views that still read legacy columns stay consistent, and
--     lib/groups/access.ts already treats group_id == session_groups.id.
--   • Retire, never delete. A group that loses members goes dormant (record
--     persists) or, at zero members, is retired (retired_at) — never hard-deleted
--     (group_ref FK is ON DELETE RESTRICT anyway).
--
-- Propagation matches the template row itself, its template_id-linked instances,
-- AND the natural key (provider, student, day_of_week, start_time) so instances
-- that predate template_id linkage are still covered. All idempotent/additive.

-- ---------------------------------------------------------------------------
-- Internal helper: stamp one template + its future instances with a group.
-- NOT SECURITY DEFINER and EXECUTE is revoked from clients — only the RPCs
-- below (which have already authorized the caller) may call it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._groups_v2_stamp(
  p_template_id uuid,
  p_group_ref uuid,     -- NULL to clear (leave/ungroup)
  p_name text,
  p_color integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_provider uuid;
  v_student uuid;
  v_dow int;
  v_start time;
BEGIN
  SELECT provider_id, student_id, day_of_week, start_time
    INTO v_provider, v_student, v_dow, v_start
  FROM schedule_sessions
  WHERE id = p_template_id;

  UPDATE schedule_sessions s
  SET group_ref   = p_group_ref,
      group_id    = p_group_ref,      -- identity-mapped legacy dual-write
      group_name  = p_name,
      group_color = p_color,
      updated_at  = now()
  WHERE (
          s.id = p_template_id
          OR s.template_id = p_template_id
          OR (s.provider_id = v_provider
              AND s.student_id = v_student
              AND s.day_of_week = v_dow
              AND s.start_time = v_start)
        )
    AND (s.session_date IS NULL OR s.session_date >= CURRENT_DATE)
    AND s.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._groups_v2_stamp(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._groups_v2_stamp(uuid, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public._groups_v2_stamp(uuid, uuid, text, integer) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Internal helper: retire a group if it has no remaining template members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._groups_v2_retire_if_empty(p_group_ref uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  IF p_group_ref IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_remaining
  FROM schedule_sessions
  WHERE group_ref = p_group_ref AND session_date IS NULL AND deleted_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE session_groups SET retired_at = now(), updated_at = now()
    WHERE id = p_group_ref AND retired_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._groups_v2_retire_if_empty(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._groups_v2_retire_if_empty(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._groups_v2_retire_if_empty(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- form(session_ids) — create (or cross-day auto-link to) a group from 2+
-- ungrouped, co-slot, same-deliverer templates the caller owns. Returns the
-- group id. This is also the "materialize a derived cluster" primitive the
-- group popover calls before naming/splitting/assigning a never-grouped cluster.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.groups_v2_form(p_session_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n int := array_length(p_session_ids, 1);
  v_resolved int;
  v_providers uuid[];
  v_dows int[];
  v_starts time[];
  v_delivs text[];
  v_seas uuid[];
  v_specs uuid[];
  v_refs int;
  v_delivered text;
  v_sea uuid;
  v_spec uuid;
  v_members uuid[];
  v_group uuid;
  v_color int;
  v_tid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF v_n IS NULL OR v_n < 2 THEN
    RAISE EXCEPTION 'a group needs at least 2 sessions';
  END IF;

  -- Aggregate-validate the candidate templates in one pass.
  SELECT count(*),
         array_agg(DISTINCT provider_id),
         array_agg(DISTINCT day_of_week),
         array_agg(DISTINCT start_time),
         array_agg(DISTINCT COALESCE(delivered_by, 'provider')),
         array_agg(DISTINCT assigned_to_sea_id),
         array_agg(DISTINCT assigned_to_specialist_id),
         count(*) FILTER (WHERE group_ref IS NOT NULL),
         array_agg(DISTINCT student_id)
    INTO v_resolved, v_providers, v_dows, v_starts, v_delivs, v_seas, v_specs, v_refs, v_members
  FROM schedule_sessions
  WHERE id = ANY(p_session_ids)
    AND session_date IS NULL
    AND deleted_at IS NULL;

  IF v_resolved <> v_n THEN
    RAISE EXCEPTION 'some sessions were not found, are not templates, or are deleted';
  END IF;
  IF array_length(v_providers, 1) <> 1 OR v_providers[1] <> v_uid THEN
    RAISE EXCEPTION 'all sessions must be owned by the caller';
  END IF;
  IF array_length(v_dows, 1) <> 1 OR array_length(v_starts, 1) <> 1 THEN
    RAISE EXCEPTION 'all sessions must share one slot (day + start time)';
  END IF;
  IF array_length(v_delivs, 1) <> 1
     OR array_length(v_seas, 1) <> 1
     OR array_length(v_specs, 1) <> 1 THEN
    RAISE EXCEPTION 'all sessions must have the same deliverer';
  END IF;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'one or more sessions are already in a group';
  END IF;

  v_delivered := v_delivs[1];
  v_sea := v_seas[1];
  v_spec := v_specs[1];

  -- Cross-day auto-link (decision #4): if a non-retired group of this exact
  -- deliverer already has the identical member set, reuse it instead of minting
  -- a new record — so "same members, different day" is one continuing group.
  SELECT g.id INTO v_group
  FROM session_groups g
  WHERE g.provider_id = v_uid
    AND g.retired_at IS NULL
    AND g.delivered_by = v_delivered
    AND g.assigned_to_sea_id IS NOT DISTINCT FROM v_sea
    AND g.assigned_to_specialist_id IS NOT DISTINCT FROM v_spec
    AND (
      SELECT array_agg(x ORDER BY x) FROM (
        SELECT DISTINCT ss.student_id AS x
        FROM schedule_sessions ss
        WHERE ss.group_ref = g.id AND ss.session_date IS NULL AND ss.deleted_at IS NULL
      ) a
    ) = (
      SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT unnest(v_members) AS x) b
    )
  LIMIT 1;

  IF v_group IS NULL THEN
    -- Auto-pick the lowest color 0..4 not already used by another live group of
    -- this provider in the same slot (mirrors the mockup's freeColor).
    SELECT COALESCE(min(c), 0) INTO v_color
    FROM generate_series(0, 4) c
    WHERE c NOT IN (
      SELECT DISTINCT g2.color
      FROM session_groups g2
      JOIN schedule_sessions s2 ON s2.group_ref = g2.id
      WHERE g2.provider_id = v_uid
        AND g2.retired_at IS NULL
        AND g2.color IS NOT NULL
        AND s2.session_date IS NULL
        AND s2.deleted_at IS NULL
        AND s2.day_of_week = v_dows[1]
        AND s2.start_time = v_starts[1]
    );

    INSERT INTO session_groups (provider_id, delivered_by, assigned_to_sea_id,
                                assigned_to_specialist_id, name, color)
    VALUES (v_uid, v_delivered,
            CASE WHEN v_delivered = 'sea' THEN v_sea ELSE NULL END,
            CASE WHEN v_delivered = 'specialist' THEN v_spec ELSE NULL END,
            NULL, v_color)
    RETURNING id INTO v_group;
  END IF;

  FOREACH v_tid IN ARRAY p_session_ids LOOP
    PERFORM public._groups_v2_stamp(v_tid, v_group,
      (SELECT name FROM session_groups WHERE id = v_group),
      (SELECT color FROM session_groups WHERE id = v_group));
  END LOOP;

  RETURN v_group;
END;
$$;

-- ---------------------------------------------------------------------------
-- join(session_id, group_id) — add one ungrouped template the caller owns to an
-- existing group of the caller's, matching deliverer. (The move pipeline has
-- already placed the session into the group's slot.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.groups_v2_join(p_session_id uuid, p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_s record;
  v_g record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_s FROM schedule_sessions
  WHERE id = p_session_id AND session_date IS NULL AND deleted_at IS NULL;
  IF v_s IS NULL THEN RAISE EXCEPTION 'session not found or not a template'; END IF;
  IF v_s.provider_id <> v_uid THEN RAISE EXCEPTION 'not the owner of this session'; END IF;

  SELECT * INTO v_g FROM session_groups WHERE id = p_group_id;
  IF v_g IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;
  IF v_g.provider_id <> v_uid THEN RAISE EXCEPTION 'not the owner of this group'; END IF;
  IF v_g.retired_at IS NOT NULL THEN RAISE EXCEPTION 'cannot join a retired group'; END IF;
  IF v_g.delivered_by <> COALESCE(v_s.delivered_by, 'provider')
     OR v_g.assigned_to_sea_id IS DISTINCT FROM v_s.assigned_to_sea_id
     OR v_g.assigned_to_specialist_id IS DISTINCT FROM v_s.assigned_to_specialist_id THEN
    RAISE EXCEPTION 'session deliverer does not match the group';
  END IF;

  PERFORM public._groups_v2_stamp(p_session_id, p_group_id, v_g.name, v_g.color);
END;
$$;

-- ---------------------------------------------------------------------------
-- leave(session_id) — remove one template the caller owns from its group
-- (template + future instances). The group persists (dormant at 1 member) and
-- is retired only when it reaches 0 members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.groups_v2_leave(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_s record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_s FROM schedule_sessions
  WHERE id = p_session_id AND session_date IS NULL AND deleted_at IS NULL;
  IF v_s IS NULL THEN RAISE EXCEPTION 'session not found or not a template'; END IF;
  IF v_s.provider_id <> v_uid THEN RAISE EXCEPTION 'not the owner of this session'; END IF;
  IF v_s.group_ref IS NULL THEN RETURN; END IF;  -- already ungrouped, no-op

  PERFORM public._groups_v2_stamp(p_session_id, NULL, NULL, NULL);
  PERFORM public._groups_v2_retire_if_empty(v_s.group_ref);
END;
$$;

-- ---------------------------------------------------------------------------
-- split(group_id, session_ids) — move the given members of a group into a NEW
-- group record (auto-named, fresh color). The original keeps its identity and
-- history. Returns the new group id. Requires ≥1 staying and ≥1 moving.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.groups_v2_split(p_group_id uuid, p_session_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_g record;
  v_moving int;
  v_total int;
  v_new uuid;
  v_color int;
  v_tid uuid;
  v_dow int;
  v_start time;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_g FROM session_groups WHERE id = p_group_id;
  IF v_g IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;
  IF v_g.provider_id <> v_uid THEN RAISE EXCEPTION 'not the owner of this group'; END IF;

  -- All moving sessions must be the caller's templates currently in this group.
  SELECT count(*) INTO v_moving
  FROM schedule_sessions
  WHERE id = ANY(p_session_ids)
    AND provider_id = v_uid
    AND session_date IS NULL
    AND deleted_at IS NULL
    AND group_ref = p_group_id;
  IF v_moving <> COALESCE(array_length(p_session_ids, 1), 0) OR v_moving = 0 THEN
    RAISE EXCEPTION 'moving sessions must all be templates currently in this group';
  END IF;

  SELECT count(*) INTO v_total
  FROM schedule_sessions
  WHERE group_ref = p_group_id AND session_date IS NULL AND deleted_at IS NULL;
  IF v_total - v_moving < 1 THEN
    RAISE EXCEPTION 'split must leave at least one member in the original group';
  END IF;

  -- New record inherits the deliverer; pick a free color in the moving slot.
  SELECT day_of_week, start_time INTO v_dow, v_start
  FROM schedule_sessions WHERE id = p_session_ids[1];

  SELECT COALESCE(min(c), 0) INTO v_color
  FROM generate_series(0, 4) c
  WHERE c NOT IN (
    SELECT DISTINCT g2.color
    FROM session_groups g2
    JOIN schedule_sessions s2 ON s2.group_ref = g2.id
    WHERE g2.provider_id = v_uid AND g2.retired_at IS NULL AND g2.color IS NOT NULL
      AND s2.session_date IS NULL AND s2.deleted_at IS NULL
      AND s2.day_of_week = v_dow AND s2.start_time = v_start
  );

  INSERT INTO session_groups (provider_id, delivered_by, assigned_to_sea_id,
                              assigned_to_specialist_id, name, color)
  VALUES (v_uid, v_g.delivered_by, v_g.assigned_to_sea_id,
          v_g.assigned_to_specialist_id, NULL, v_color)
  RETURNING id INTO v_new;

  FOREACH v_tid IN ARRAY p_session_ids LOOP
    PERFORM public._groups_v2_stamp(v_tid, v_new, NULL, v_color);
  END LOOP;

  RETURN v_new;
END;
$$;

-- ---------------------------------------------------------------------------
-- merge(from_group_id, into_group_id) — re-point every member of `from` onto
-- `into` (template + future), then retire `from`. Both histories are retained
-- (lessons keep their own group_ref; the retired record persists).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.groups_v2_merge(p_from_group_id uuid, p_into_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from record;
  v_into record;
  v_tid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_from_group_id = p_into_group_id THEN RAISE EXCEPTION 'cannot merge a group into itself'; END IF;

  SELECT * INTO v_from FROM session_groups WHERE id = p_from_group_id;
  SELECT * INTO v_into FROM session_groups WHERE id = p_into_group_id;
  IF v_from IS NULL OR v_into IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;
  IF v_from.provider_id <> v_uid OR v_into.provider_id <> v_uid THEN
    RAISE EXCEPTION 'not the owner of both groups';
  END IF;
  IF v_into.retired_at IS NOT NULL THEN RAISE EXCEPTION 'cannot merge into a retired group'; END IF;
  IF v_from.delivered_by <> v_into.delivered_by
     OR v_from.assigned_to_sea_id IS DISTINCT FROM v_into.assigned_to_sea_id
     OR v_from.assigned_to_specialist_id IS DISTINCT FROM v_into.assigned_to_specialist_id THEN
    RAISE EXCEPTION 'groups have different deliverers';
  END IF;

  FOR v_tid IN
    SELECT id FROM schedule_sessions
    WHERE group_ref = p_from_group_id AND session_date IS NULL AND deleted_at IS NULL
  LOOP
    PERFORM public._groups_v2_stamp(v_tid, p_into_group_id, v_into.name, v_into.color);
  END LOOP;

  UPDATE session_groups SET retired_at = now(), updated_at = now()
  WHERE id = p_from_group_id AND retired_at IS NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated users call these with their own JWT; auth.uid() +
-- explicit ownership checks inside each function do the authorization.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.groups_v2_form(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.groups_v2_join(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.groups_v2_leave(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.groups_v2_split(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.groups_v2_merge(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.groups_v2_form(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.groups_v2_join(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.groups_v2_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.groups_v2_split(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.groups_v2_merge(uuid, uuid) TO authenticated;
