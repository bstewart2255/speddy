-- SPE-425: migrate John Swett's secondary-resource caseloads to the weekly
-- bucket, and sweep the phantom unscheduled sessions the old shape left behind.
--
-- SPE-424 changed how secondary resource service is STORED — one weekly bucket
-- (sessions_per_week = 1 × the full weekly amount) instead of a chop into
-- 30-minute pull-outs — but it only changed the write paths. Caseloads imported
-- before it merged still carry the chopped shape ("19×30" at the John Swett
-- pilot) plus one unscheduled `schedule_sessions` template per phantom session.
-- This is the one-time data fix for those rows (cleanup precedent:
-- 20251031_cleanup_duplicate_sessions.sql).
--
-- The conversion is the same arithmetic the app itself applies when one of
-- these students is edited or re-imported: weekly total = sessions_per_week ×
-- minutes_per_session, stored as 1 × total. Total service minutes per student
-- are therefore UNCHANGED — this migration changes the shape, never the amount.
-- (Where a row came from the import chop, that preserved total is the chop's
-- rounded-UP number, which can sit up to 29 min/week above the IEP's exact
-- figure. Recovering the exact figure needs a re-import of the Deliveries file,
-- which is step 1 of SPE-425 and independent of this sweep. Rounding up never
-- under-serves a mandate, consistent with lib/services/weekly-minutes.ts.)
--
-- Scope is the two John Swett secondary sites BY ID, not a general
-- "secondary + resource" rule. A general rule would also match the Sim
-- District's Cedar Middle / Redwood High caseloads, whose chopped rows are
-- deliberate fixtures owned by scripts/sim-district and must only ever be
-- touched by those scripts. Rodeo Hills (elementary) and every non-resource
-- role keep the 30-minute chop, which is correct for them.
--
-- Applied to production 2026-08-11: 56 students converted, 592 templates → 56
-- (one each), weekly minutes unchanged at 17,985, 536 phantom rows removed and
-- nothing else written. Idempotent — the scope below is now empty, so a re-run
-- is a no-op, and it stays safe for any environment restoring this history.
--
-- Everything lives in one DO block so the fix is all-or-nothing however it is
-- applied: a student left at 1 × weekly total while still holding 19 templates
-- would read as ~19× their real caseload.

DO $$
DECLARE
  v_scope     uuid[];
  v_drifted   integer;
  v_students  integer;
  v_templates integer;
  v_residual  integer;
BEGIN
  -- The population, captured once. Both steps below work from this exact list,
  -- so the sweep can never reach a student the pre-flight did not validate —
  -- notably a resource student already sitting at sessions_per_week = 1, whose
  -- templates were never created by the chopped shape.
  SELECT array_agg(st.id) INTO v_scope
  FROM students st
  JOIN profiles p ON p.id = st.provider_id
  WHERE st.school_id IN ('061899002299', '061899002302')  -- Carquinez Middle, John Swett High
    AND p.role = 'resource'
    AND st.sessions_per_week > 1
    AND st.minutes_per_session > 0;

  IF v_scope IS NULL THEN
    RAISE NOTICE 'SPE-425: no chopped caseloads in scope — nothing to do.';
    RETURN;
  END IF;

  -- Take the templates under row locks BEFORE inspecting them. Without this,
  -- a provider scheduling one of the phantom pull-outs between the pre-flight
  -- read and the DELETE would slip past both: the student would still be
  -- converted to a 570-minute weekly requirement, while the delete guards
  -- (correctly) skipped the now-scheduled row — exactly the half-fixed state
  -- the pre-flight exists to prevent. Holding the locks makes that concurrent
  -- write wait for this transaction instead of racing it.
  PERFORM 1
  FROM schedule_sessions ss
  WHERE ss.student_id = ANY(v_scope)
    AND ss.session_date IS NULL
    AND ss.deleted_at IS NULL
  FOR UPDATE OF ss;

  -- Pre-flight. This sweep assumes every in-scope template is still an
  -- untouched, unscheduled placeholder: nothing scheduled, completed, grouped,
  -- assigned, and no instance, attendance, or curriculum history hanging off
  -- it. If that has stopped being true, the right move is a human re-audit, not
  -- a partial write.
  SELECT count(*) INTO v_drifted
  FROM schedule_sessions ss
  WHERE ss.student_id = ANY(v_scope)
    AND ss.session_date IS NULL
    AND ss.deleted_at IS NULL
    AND (
      ss.day_of_week IS NOT NULL
      OR ss.is_completed
      OR ss.group_ref IS NOT NULL
      OR ss.group_id IS NOT NULL
      OR ss.assigned_to_sea_id IS NOT NULL
      OR ss.assigned_to_specialist_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM schedule_sessions child WHERE child.template_id = ss.id)
      OR EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = ss.id)
      OR EXISTS (SELECT 1 FROM curriculum_tracking c WHERE c.session_id = ss.id)
    );

  IF v_drifted > 0 THEN
    RAISE EXCEPTION
      'SPE-425: % in-scope template(s) are no longer untouched placeholders (scheduled, completed, grouped, assigned, or carrying history). Re-audit before sweeping — see the ticket.',
      v_drifted;
  END IF;

  -- 1. Chopped rows → one weekly bucket.
  UPDATE students st
  SET sessions_per_week = 1,
      minutes_per_session = st.sessions_per_week * st.minutes_per_session,
      updated_at = NOW()
  WHERE st.id = ANY(v_scope);

  GET DIAGNOSTICS v_students = ROW_COUNT;

  -- 2. Drop the phantom templates the chopped shape created, leaving each
  -- student exactly `sessions_per_week` of them (1, after step 1).
  --
  -- Deletion order mirrors lib/scheduling/session-requirement-sync.ts: a
  -- provider's actually-scheduled sessions rank first and are kept (earliest
  -- day/time), unscheduled placeholders go first and the oldest-created
  -- survives. The WHERE guards make the statement self-limiting — it can only
  -- ever remove an unscheduled, uncompleted, ungrouped, unassigned template
  -- carrying no instances, attendance, or curriculum history. Anything a
  -- provider has actually built on is out of its reach by construction, not by
  -- luck; the pre-flight above is what turns "out of reach" into "stop".
  WITH ranked AS (
    SELECT ss.id, st.sessions_per_week AS keep_n,
           ROW_NUMBER() OVER (
             PARTITION BY ss.student_id
             ORDER BY (ss.day_of_week IS NULL),  -- scheduled rows rank first, so they are kept
                      ss.day_of_week,
                      ss.start_time,
                      ss.created_at,
                      ss.id
           ) AS rn
    FROM schedule_sessions ss
    JOIN students st ON st.id = ss.student_id
    WHERE ss.student_id = ANY(v_scope)
      AND ss.session_date IS NULL   -- templates only; dated instances are history
      AND ss.deleted_at IS NULL
  )
  DELETE FROM schedule_sessions ss
  USING ranked r
  WHERE ss.id = r.id
    AND r.rn > r.keep_n
    AND ss.day_of_week IS NULL
    AND ss.is_completed = false
    AND ss.group_ref IS NULL
    AND ss.group_id IS NULL
    AND ss.assigned_to_sea_id IS NULL
    AND ss.assigned_to_specialist_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM schedule_sessions child WHERE child.template_id = ss.id)
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = ss.id)
    AND NOT EXISTS (SELECT 1 FROM curriculum_tracking c WHERE c.session_id = ss.id);

  GET DIAGNOSTICS v_templates = ROW_COUNT;

  -- Post-condition. The ranking above counts every live template, including any
  -- the guards then decline to delete, so a protected row could in principle
  -- leave a student holding more than `sessions_per_week`. Assert the invariant
  -- the whole migration exists to establish rather than finishing quietly on a
  -- caseload that is still wrong; raising here rolls back both steps.
  SELECT count(*) INTO v_residual
  FROM students st
  WHERE st.id = ANY(v_scope)
    AND (
      SELECT count(*) FROM schedule_sessions ss
      WHERE ss.student_id = st.id AND ss.session_date IS NULL AND ss.deleted_at IS NULL
    ) <> st.sessions_per_week;

  IF v_residual > 0 THEN
    RAISE EXCEPTION
      'SPE-425: % student(s) did not end with exactly sessions_per_week templates. Rolled back — re-audit before sweeping.',
      v_residual;
  END IF;

  RAISE NOTICE 'SPE-425: % student(s) converted to the weekly bucket, % phantom template(s) removed',
    v_students, v_templates;
END $$;
