-- SPE-384: scope an SEA to their own caseload, not to the whole school.
--
-- `students_select` and `children_select` each carried an SEA branch granting
-- school-wide reads:
--
--     school_id IN (SELECT school_id FROM get_my_school_ids())
--     AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'sea')
--
-- That disagreed with how the product actually behaves. The Students and Plan
-- pages read through `get_sea_students()`, a SECURITY DEFINER function scoped by
-- session assignment (`ss.assigned_to_sea_id = auth.uid() AND ss.delivered_by =
-- 'sea'`), and `lib/supabase/queries/sea-students.ts` uses that result whenever
-- the RPC succeeds — falling back to the RLS-backed query only on error. So the
-- school-wide grant was invisible in the main UI while still being live on the
-- table underneath it.
--
-- Of the two, assignment-scoped is the intended behaviour, so the policy is
-- narrowed to match rather than the UI widened to match the policy. Removing
-- the branch outright leaves the SEA with the session-assignment branch that is
-- already present directly above it:
--
--     EXISTS (SELECT 1 FROM schedule_sessions
--             WHERE student_id = students.id AND assigned_to_sea_id = auth.uid())
--
-- which is the same grant the RPC gives, minus the `delivered_by` filter — an
-- SEA assigned to a session can still read that student either way.
--
-- This SUPERSEDES the SEA half of SPE-362 (20260805): that migration widened
-- this branch from primary-school-only to all assigned schools. The branch is
-- now gone, so the widening is moot. SPE-362's `teachers_insert` change — the
-- one with live users behind it — is untouched.
--
-- Blast radius, measured against prod before applying: this removes visibility
-- of students at an SEA's own school whom they are not assigned to — 18 students
-- for one real SEA, 5 for another, 0 for the rest. None of it was reachable
-- through the SEA UI, which has always gone through the assignment-scoped RPC.
--
-- Non-SEA callers are unaffected: the removed branch was gated on
-- `role = 'sea'`. Every other branch of both policies is reproduced verbatim.

-- 1. students_select -------------------------------------------------------

DROP POLICY IF EXISTS "students_select" ON students;

CREATE POLICY "students_select" ON students
  FOR SELECT TO authenticated
  USING (
    provider_id = (SELECT auth.uid())
    OR teacher_id IN (
      SELECT teachers.id FROM teachers WHERE teachers.account_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM schedule_sessions
      WHERE schedule_sessions.student_id = students.id
        AND schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
    )
    OR EXISTS (
      -- The SEA's caseload: this is now their ONLY route to a student record.
      SELECT 1 FROM schedule_sessions
      WHERE schedule_sessions.student_id = students.id
        AND schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE admin_permissions.admin_id = (SELECT auth.uid())
        AND admin_permissions.role = 'site_admin'
        AND admin_permissions.school_id::text = students.school_id::text
    )
  );

-- 2. children_select -------------------------------------------------------
-- Mirrors students_select through the `students s` join; same branch removed.

DROP POLICY IF EXISTS "children_select" ON children;

CREATE POLICY "children_select" ON children
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_id = children.id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR s.teacher_id IN (
            SELECT t.id FROM teachers t WHERE t.account_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM schedule_sessions ss
            WHERE ss.student_id = s.id
              AND ss.assigned_to_specialist_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM schedule_sessions ss
            WHERE ss.student_id = s.id
              AND ss.assigned_to_sea_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  );
