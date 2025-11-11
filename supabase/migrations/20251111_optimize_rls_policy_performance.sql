-- Optimize RLS policies to prevent per-row re-evaluation of auth functions
-- Security/Performance Issue: Direct calls to auth.uid() in RLS policies are re-evaluated for each row
-- Documentation: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- This migration wraps auth.uid() calls in SELECT subqueries to evaluate once per query
-- instead of once per row, significantly improving performance at scale.
--
-- Note: Document SELECT and INSERT policies were consolidated in 20251111_consolidate_multiple_rls_policies.sql
--
-- Affected tables: holidays, saved_worksheets, students, student_details, documents,
-- exit_ticket_results, schedule_sessions (13 policies total)

-- ========================================
-- Table: holidays (1 policy)
-- ========================================

DROP POLICY IF EXISTS "Users can view holidays for their school" ON public.holidays;
CREATE POLICY "Users can view holidays for their school" ON public.holidays
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
          OR (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL)
          OR (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  );


-- ========================================
-- Table: saved_worksheets (4 policies)
-- ========================================

DROP POLICY IF EXISTS "Users can view their own saved worksheets" ON public.saved_worksheets;
CREATE POLICY "Users can view their own saved worksheets" ON public.saved_worksheets
  FOR SELECT
  USING ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Users can insert their own saved worksheets" ON public.saved_worksheets;
CREATE POLICY "Users can insert their own saved worksheets" ON public.saved_worksheets
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Users can update their own saved worksheets" ON public.saved_worksheets;
CREATE POLICY "Users can update their own saved worksheets" ON public.saved_worksheets
  FOR UPDATE
  USING ((SELECT auth.uid()) = provider_id)
  WITH CHECK ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Users can delete their own saved worksheets" ON public.saved_worksheets;
CREATE POLICY "Users can delete their own saved worksheets" ON public.saved_worksheets
  FOR DELETE
  USING ((SELECT auth.uid()) = provider_id);


-- ========================================
-- Table: students (1 policy)
-- ========================================

DROP POLICY IF EXISTS "SEAs can view students assigned to them" ON public.students;
CREATE POLICY "SEAs can view students assigned to them" ON public.students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM schedule_sessions ss
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE ss.student_id = students.id
        AND ss.assigned_to_sea_id = p.id
        AND ss.delivered_by = 'sea'
        AND p.role = 'sea'
    )
  );


-- ========================================
-- Table: student_details (1 policy)
-- ========================================

DROP POLICY IF EXISTS "SEAs can view student details for assigned students" ON public.student_details;
CREATE POLICY "SEAs can view student details for assigned students" ON public.student_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM schedule_sessions ss
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE ss.student_id = student_details.student_id
        AND ss.assigned_to_sea_id = p.id
        AND ss.delivered_by = 'sea'
        AND p.role = 'sea'
    )
  );


-- ========================================
-- Table: documents (3 policies)
-- Note: SELECT and INSERT policies were consolidated in 20251111_consolidate_multiple_rls_policies.sql
-- Only optimizing the remaining non-consolidated policies here
-- ========================================

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents" ON public.documents
  FOR DELETE
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
CREATE POLICY "Users can update their own documents" ON public.documents
  FOR UPDATE
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));


-- ========================================
-- Table: exit_ticket_results (3 policies)
-- ========================================

DROP POLICY IF EXISTS "Users can create exit ticket results in their org" ON public.exit_ticket_results;
CREATE POLICY "Users can create exit ticket results in their org" ON public.exit_ticket_results
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE s.id = exit_ticket_results.student_id
        AND (
          s.school_id::text = p.school_id::text
          OR s.district_id::text = p.district_id::text
          OR s.state_id::text = p.state_id::text
        )
    )
    AND graded_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own exit ticket results" ON public.exit_ticket_results;
CREATE POLICY "Users can update their own exit ticket results" ON public.exit_ticket_results
  FOR UPDATE
  USING (graded_by = (SELECT auth.uid()))
  WITH CHECK (graded_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view exit ticket results in their org" ON public.exit_ticket_results;
CREATE POLICY "Users can view exit ticket results in their org" ON public.exit_ticket_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = (SELECT auth.uid())
        AND (
          s.school_id::text = p.school_id::text
          OR s.district_id::text = p.district_id::text
          OR s.state_id::text = p.state_id::text
        )
      WHERE s.id = exit_ticket_results.student_id
    )
  );


-- ========================================
-- Table: schedule_sessions (1 policy)
-- ========================================

DROP POLICY IF EXISTS "Users and assigned members can update sessions" ON public.schedule_sessions;
CREATE POLICY "Users and assigned members can update sessions" ON public.schedule_sessions
  FOR UPDATE
  USING (
    provider_id = (SELECT auth.uid())
    OR assigned_to_specialist_id = (SELECT auth.uid())
    OR assigned_to_sea_id = (SELECT auth.uid())
  )
  WITH CHECK (
    provider_id = (SELECT auth.uid())
    OR assigned_to_specialist_id = (SELECT auth.uid())
    OR assigned_to_sea_id = (SELECT auth.uid())
  );


-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'RLS policy performance optimization completed.';
  RAISE NOTICE 'All auth.uid() calls have been wrapped in SELECT subqueries.';
  RAISE NOTICE 'This should significantly improve query performance at scale.';
END $$;
