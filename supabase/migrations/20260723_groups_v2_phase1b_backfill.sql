-- Groups v2 · Phase 1b (SPE-310) — backfill legacy group_ids into session_groups,
-- reconnect orphaned lessons, and auto-group co-scheduled clusters.
--
-- ⚠️ HELD FOR BLAIR. This migration rewrites HISTORICAL linkage and is
-- USER-VISIBLE at rollout (Step 4 auto-groups co-scheduled clusters, so
-- providers who never grouped will see plates once Phase 3 ships). Validate on a
-- Supabase branch DB before any production apply. It is NOT applied by the PR
-- that introduces it.
--
-- Idempotent / re-runnable: only ever touches rows whose group_ref IS NULL, uses
-- deterministic ids + ON CONFLICT DO NOTHING, and logs per-step counts via
-- RAISE NOTICE. Counts here are illustrative (2026-07-23: 41 legacy group_ids,
-- 11 ghosts, 27 group lessons incl. 11 orphans, 119 implicit clusters) — the SQL
-- recomputes everything at run time.
--
-- Design-spec §5. Deliberate simplification vs the spec: Step 5 (merge
-- identical-member groups across different days into one record) is DEFERRED as a
-- non-destructive follow-up — leaving those as separate per-day groups is
-- correct, just not consolidated; merging is risky (which record survives, how
-- lessons/refs re-point) and is better done deliberately. Steps 1/3 (restore
-- linkage, drift-safe), 2 (lessons + orphans + snapshots), 4 (auto-group), and 6
-- (one-member = dormant) are all here.

DO $$
DECLARE
  v_groups_from_sessions bigint;
  v_ghost_groups bigint;
  v_session_rows_linked bigint;
  v_orphan_group_records bigint;
  v_lessons_linked bigint;
  v_lessons_snapshotted bigint;
  v_lessons_not_inferable bigint;
  v_auto_groups bigint;
  v_auto_rows_linked bigint;
BEGIN
  -- =========================================================================
  -- Step 1 + 3 + 6: every legacy group_id becomes a session_groups record whose
  -- id IS the legacy group_id (so linkage is identity-mapped, drift-safe, and
  -- idempotent). Representative attributes are taken from the template row when
  -- present (session_date IS NULL sorts first). Ghosts (ids that live only on
  -- instances, no template) are born retired. One-member groups are created too
  -- and are dormant by construction (<2 live members renders as plain pills).
  -- =========================================================================
  WITH agg AS (
    SELECT
      group_id,
      (array_agg(provider_id                 ORDER BY (session_date IS NULL) DESC))[1] AS provider_id,
      (array_agg(COALESCE(delivered_by,'provider') ORDER BY (session_date IS NULL) DESC))[1] AS delivered_by,
      (array_agg(assigned_to_sea_id          ORDER BY (session_date IS NULL) DESC))[1] AS assigned_to_sea_id,
      (array_agg(assigned_to_specialist_id   ORDER BY (session_date IS NULL) DESC))[1] AS assigned_to_specialist_id,
      (array_agg(group_name                  ORDER BY (session_date IS NULL) DESC))[1] AS group_name,
      (array_agg(group_color                 ORDER BY (session_date IS NULL) DESC))[1] AS group_color,
      bool_or(session_date IS NULL) AS has_template
    FROM schedule_sessions
    WHERE group_id IS NOT NULL AND group_ref IS NULL AND deleted_at IS NULL
    GROUP BY group_id
  )
  INSERT INTO session_groups (id, provider_id, delivered_by, assigned_to_sea_id, assigned_to_specialist_id, name, color, retired_at)
  SELECT
    group_id, provider_id, delivered_by,
    CASE WHEN delivered_by = 'sea'        THEN assigned_to_sea_id        END,
    CASE WHEN delivered_by = 'specialist' THEN assigned_to_specialist_id END,
    group_name, group_color,
    CASE WHEN has_template THEN NULL ELSE now() END
  FROM agg
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_groups_from_sessions = ROW_COUNT;

  SELECT count(*) INTO v_ghost_groups FROM session_groups WHERE retired_at IS NOT NULL;

  -- Link EVERY (non-deleted) session row carrying a legacy id to its own group
  -- (past included). Because group_ref = the row's own group_id, drifted past
  -- instances ref the group they ACTUALLY carried, not the template's current
  -- state. The deleted_at filter matches the record-creation aggregate above —
  -- without it, a group_id living only on soft-deleted rows would have no
  -- session_groups record and this UPDATE would trip the group_ref FK.
  UPDATE schedule_sessions
  SET group_ref = group_id
  WHERE group_id IS NOT NULL AND group_ref IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS v_session_rows_linked = ROW_COUNT;

  -- =========================================================================
  -- Step 2: reconnect group lessons (incl. the orphans whose group_id matches no
  -- session row — those need a retired placeholder record first).
  -- =========================================================================
  INSERT INTO session_groups (id, provider_id, delivered_by, name, retired_at)
  SELECT DISTINCT ON (l.group_id) l.group_id, l.provider_id, 'provider', NULL, now()
  FROM lessons l
  WHERE l.group_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM session_groups sg WHERE sg.id = l.group_id)
  ORDER BY l.group_id, l.created_at
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_orphan_group_records = ROW_COUNT;

  UPDATE lessons
  SET group_ref = group_id
  WHERE group_id IS NOT NULL AND group_ref IS NULL
    AND EXISTS (SELECT 1 FROM session_groups sg WHERE sg.id = lessons.group_id);
  GET DIAGNOSTICS v_lessons_linked = ROW_COUNT;

  -- Backfill participant snapshots where inferable from grouped instances on the
  -- lesson's own date (mirrors the Phase 0 save-time snapshot for old lessons).
  WITH members AS (
    SELECT s.group_ref, s.session_date AS d,
           array_agg(DISTINCT s.student_id) AS ids,
           jsonb_agg(DISTINCT jsonb_build_object('id', st.id, 'initials', st.initials, 'grade_level', st.grade_level)) AS details
    FROM schedule_sessions s
    JOIN students st ON st.id = s.student_id
    WHERE s.group_ref IS NOT NULL AND s.session_date IS NOT NULL AND s.deleted_at IS NULL
    GROUP BY s.group_ref, s.session_date
  )
  UPDATE lessons l
  SET student_ids = m.ids, student_details = m.details
  FROM members m
  WHERE l.group_ref = m.group_ref AND l.lesson_date = m.d
    AND (l.student_ids IS NULL OR array_length(l.student_ids, 1) IS NULL);
  GET DIAGNOSTICS v_lessons_snapshotted = ROW_COUNT;

  SELECT count(*) INTO v_lessons_not_inferable
  FROM lessons
  WHERE group_ref IS NOT NULL
    AND (student_ids IS NULL OR array_length(student_ids, 1) IS NULL);

  -- =========================================================================
  -- Step 4: auto-group co-scheduled clusters — same provider + slot
  -- (day_of_week + start_time) + deliverer person, >=2 distinct ungrouped
  -- students. Deterministic id keyed off the cluster so create + link need no
  -- RETURNING round-trip. Applied to TEMPLATES + FUTURE instances only (name
  -- NULL = auto-derived display name). ⚠️ user-visible at rollout.
  -- =========================================================================
  CREATE TEMP TABLE _clusters ON COMMIT DROP AS
  WITH tmpl AS (
    SELECT provider_id, day_of_week, start_time,
           COALESCE(delivered_by,'provider') AS db,
           assigned_to_sea_id, assigned_to_specialist_id, student_id,
           CASE COALESCE(delivered_by,'provider')
             WHEN 'sea' THEN assigned_to_sea_id
             WHEN 'specialist' THEN assigned_to_specialist_id
             ELSE provider_id END AS deliverer_person
    FROM schedule_sessions
    WHERE session_date IS NULL AND is_template = true AND deleted_at IS NULL
      AND group_id IS NULL AND group_ref IS NULL
      AND day_of_week IS NOT NULL AND start_time IS NOT NULL AND student_id IS NOT NULL
  )
  SELECT provider_id, day_of_week, start_time, db, deliverer_person,
         (array_agg(assigned_to_sea_id))[1] AS sea,
         (array_agg(assigned_to_specialist_id))[1] AS spec,
         md5(provider_id::text||'|'||day_of_week||'|'||start_time::text||'|'||db||'|'||COALESCE(deliverer_person::text,''))::uuid AS group_uuid
  FROM tmpl
  GROUP BY provider_id, day_of_week, start_time, db, deliverer_person
  HAVING count(DISTINCT student_id) >= 2;

  INSERT INTO session_groups (id, provider_id, delivered_by, assigned_to_sea_id, assigned_to_specialist_id, name)
  SELECT group_uuid, provider_id, db,
         CASE WHEN db = 'sea' THEN sea END,
         CASE WHEN db = 'specialist' THEN spec END,
         NULL
  FROM _clusters
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_auto_groups = ROW_COUNT;

  UPDATE schedule_sessions s
  SET group_ref = c.group_uuid
  FROM _clusters c
  WHERE s.provider_id = c.provider_id
    AND s.day_of_week = c.day_of_week
    AND s.start_time = c.start_time
    AND COALESCE(s.delivered_by,'provider') = c.db
    AND (CASE COALESCE(s.delivered_by,'provider')
           WHEN 'sea' THEN s.assigned_to_sea_id
           WHEN 'specialist' THEN s.assigned_to_specialist_id
           ELSE s.provider_id END) IS NOT DISTINCT FROM c.deliverer_person
    AND s.group_id IS NULL AND s.group_ref IS NULL AND s.deleted_at IS NULL
    AND (s.session_date IS NULL OR s.session_date >= CURRENT_DATE);
  GET DIAGNOSTICS v_auto_rows_linked = ROW_COUNT;

  RAISE NOTICE 'Groups v2 Phase 1b backfill complete:';
  RAISE NOTICE '  Step 1: legacy group records created=%, ghosts retired (cumulative)=%', v_groups_from_sessions, v_ghost_groups;
  RAISE NOTICE '  Step 1/3: session rows linked to their own group=%', v_session_rows_linked;
  RAISE NOTICE '  Step 2: orphan placeholder records=%, group lessons linked=%, snapshots backfilled=%, still-non-inferable=%',
    v_orphan_group_records, v_lessons_linked, v_lessons_snapshotted, v_lessons_not_inferable;
  RAISE NOTICE '  Step 4: auto-groups created=%, rows linked (templates+future)=%', v_auto_groups, v_auto_rows_linked;
END $$;

-- Post-migration acceptance checks (should all be 0):
--   SELECT count(*) FROM lessons        WHERE group_id IS NOT NULL AND group_ref IS NULL;  -- 0
--   SELECT count(*) FROM schedule_sessions
--     WHERE group_id IS NOT NULL AND group_ref IS NULL AND deleted_at IS NULL;              -- 0
--   SELECT count(*) FROM lessons l WHERE l.group_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM session_groups sg WHERE sg.id = l.group_ref);            -- 0 (orphans reconnected)
