-- SPE-8: stop re-evaluating auth.uid() per row in the two admin SELECT policies
-- on schedule_sessions.
--
-- Both policies call auth.uid() bare inside an EXISTS subquery, so Postgres
-- re-evaluates it for every row scanned instead of once per query — the
-- `auth_rls_initplan` advisor warning. Wrapping the call in a scalar subquery
-- makes the planner hoist it to an InitPlan and evaluate it once.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Why only these two, out of the 56 the advisor flags: 54 of the 56 sit on
-- tables holding fewer than 300 rows, where the difference is unmeasurable.
-- schedule_sessions holds 15,618 rows and is the app's hot path — the schedule
-- grid and dashboard read it constantly. Permissive policies are OR'd, so these
-- two admin policies are evaluated on every provider's read as well, not just an
-- admin's. The remaining 54 stay tracked on SPE-8 as non-urgent; the SPE-441
-- gate stops new ones arriving in the meantime.
--
-- Scope / safety:
--   * ALTER POLICY, not DROP + CREATE. The rewrite touches only the USING
--     expression: the role list ({authenticated}) and command (SELECT) are
--     preserved by construction. That matters here — a DROP/CREATE rewrite is
--     exactly how a previously-applied `TO authenticated` narrowing silently
--     reverted to `TO public` on `profiles` (caught by review on PR #805).
--   * Historical note: when this migration landed, the SPE-441 gate sliced on
--     CREATE POLICY only, so it scored this file — and the rollback below — as
--     clean either way, and the safety came from ALTER POLICY's semantics rather
--     than from the gate. SPE-472 has since closed that: the gate now reads
--     ALTER POLICY and ALTER FUNCTION too, and the rollback below is covered by
--     a test pinning exactly that statement.
--   * The USING expressions below are the live definitions reproduced verbatim
--     (pulled from pg_policies on 2026-08-12), with the single change of
--     auth.uid() -> (SELECT auth.uid()). No predicate logic is altered, so the
--     set of rows each caller can see is unchanged.
--   * Semantically inert is a claim, not a fact, so it was verified rather than
--     asserted: scripts/sim-district/verify-schedule-sessions-rls.ts signs in as
--     real sim personas (district admin, two site admins at different schools, a
--     district-tech negative, and a provider) and compares the exact set of
--     visible session ids before and after. Row ids, not counts — a policy that
--     swapped one row for another would keep the count identical.
--
-- Rollback: re-run this file with `(SELECT auth.uid())` changed back to
-- `auth.uid()` in both statements.

ALTER POLICY "District admins can view schedule sessions in their district"
  ON public.schedule_sessions
  USING (
    EXISTS (
      SELECT 1
        FROM admin_permissions ap
       WHERE ap.admin_id = (SELECT auth.uid())
         AND ap.role = 'district_admin'::text
         AND (ap.district_id)::text = get_student_district_id(schedule_sessions.student_id)
    )
  );

ALTER POLICY "Site admins can view schedule sessions at their school"
  ON public.schedule_sessions
  USING (
    EXISTS (
      SELECT 1
        FROM admin_permissions ap
       WHERE ap.admin_id = (SELECT auth.uid())
         AND ap.role = 'site_admin'::text
         AND (ap.school_id)::text = get_student_school_id(schedule_sessions.student_id)
    )
  );
