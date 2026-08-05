-- SPE-362: RLS paths that scope a provider by their *primary* school only, so
-- a multi-school user silently has fewer rights at their other assigned schools.
--
-- Same fix shape as SPE-361 (20260804_fix_special_activities_select_multi_school):
-- swap the `profiles.school_id`-only subquery for `get_my_school_ids()`, which is
-- SECURITY DEFINER / STABLE, granted to `authenticated`, and unions the profile
-- school with the caller's `provider_schools` rows.
--
-- Three of the four paths surveyed in SPE-362 are covered here:
--
--   1. `teachers_insert`   — a provider could only create teacher records at
--                            their primary school, while `teachers_select`
--                            already unions `provider_schools`. So they could
--                            SEE teachers at every assigned school but only ADD
--                            at one. This is the only one with live impact:
--                            8 providers are assigned to more than one school.
--   2. `students_select`   — SEA branch; a multi-school SEA saw school-wide
--                            students at their primary school only.
--   3. `children_select`   — the same SEA branch, reached through `students s`.
--
-- The fourth path, `profiles_update`'s site-admin branch, is deliberately NOT
-- changed here. It governs role and permission columns, so it gets its own
-- review rather than riding along with these.
--
-- Blast radius of 2 and 3 today is zero: no SEA is currently assigned to more
-- than one school, so the widened branch matches exactly the rows it already
-- matched. They are fixed now because they are the same one-line change as 1
-- and would be wrong the day an SEA is assigned to a second site.
--
-- Every other branch of each policy is reproduced verbatim from the live
-- definitions; only the profile-school subquery moves.

-- 1. teachers_insert -------------------------------------------------------
-- A provider may create a teacher at any school they are assigned to, not just
-- their primary. Site-admin branch unchanged.

DROP POLICY IF EXISTS "teachers_insert" ON teachers;

CREATE POLICY "teachers_insert" ON teachers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE admin_permissions.admin_id = (SELECT auth.uid())
        AND admin_permissions.role = 'site_admin'
        AND admin_permissions.school_id::text = teachers.school_id::text
    )
    OR school_id::text IN (SELECT school_id FROM get_my_school_ids())
  );

-- 2. students_select -------------------------------------------------------
-- SEA school-wide branch only; provider / teacher / session-assignment /
-- site-admin branches are unchanged.

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
      SELECT 1 FROM schedule_sessions
      WHERE schedule_sessions.student_id = students.id
        AND schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
    )
    OR (
      -- SEAs see students at ANY school they are assigned to, not primary alone
      school_id::text IN (SELECT school_id FROM get_my_school_ids())
      AND (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE profiles.role = 'sea')
    )
    OR EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE admin_permissions.admin_id = (SELECT auth.uid())
        AND admin_permissions.role = 'site_admin'
        AND admin_permissions.school_id::text = students.school_id::text
    )
  );

-- 3. children_select -------------------------------------------------------
-- Mirrors students_select through the `students s` join; same SEA branch swap.

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
          OR (
            -- SEAs see children at ANY school they are assigned to
            s.school_id::text IN (SELECT school_id FROM get_my_school_ids())
            AND (SELECT auth.uid()) IN (SELECT p.id FROM profiles p WHERE p.role = 'sea')
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
