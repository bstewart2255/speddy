-- Consolidate multiple permissive RLS policies into single policies
-- Performance Issue: Multiple permissive policies for the same role/action cause redundant evaluation
-- Documentation: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
--
-- This migration combines multiple permissive policies into single policies using OR conditions,
-- reducing the number of policy evaluations per query and improving performance.
--
-- Affected tables: documents, exit_tickets, student_details, students

-- ========================================
-- Table: documents
-- Consolidate 2 INSERT policies and 2 SELECT policies
-- ========================================

-- Consolidate INSERT policies: "Users can create documents for their groups" + "Users can create documents for their sessions"
DROP POLICY IF EXISTS "Users can create documents for their groups" ON public.documents;
DROP POLICY IF EXISTS "Users can create documents for their sessions" ON public.documents;

CREATE POLICY "Users can create documents" ON public.documents
  FOR INSERT
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      -- For group documents
      (
        documentable_type = 'group'
        AND EXISTS (
          SELECT 1
          FROM schedule_sessions s
          WHERE s.group_id = documents.documentable_id
            AND (
              s.provider_id = (SELECT auth.uid())
              OR s.assigned_to_specialist_id = (SELECT auth.uid())
              OR s.assigned_to_sea_id = (SELECT auth.uid())
            )
          LIMIT 1
        )
      )
      OR
      -- For session documents
      (
        documentable_type = 'session'
        AND EXISTS (
          SELECT 1
          FROM schedule_sessions s
          WHERE s.id = documents.documentable_id
            AND (
              s.provider_id = (SELECT auth.uid())
              OR s.assigned_to_specialist_id = (SELECT auth.uid())
              OR s.assigned_to_sea_id = (SELECT auth.uid())
            )
        )
      )
    )
  );

-- Consolidate SELECT policies: "Users can view their group documents" + "Users can view their session documents"
DROP POLICY IF EXISTS "Users can view their group documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view their session documents" ON public.documents;

CREATE POLICY "Users can view their documents" ON public.documents
  FOR SELECT
  USING (
    -- For group documents
    (
      documentable_type = 'group'
      AND EXISTS (
        SELECT 1
        FROM schedule_sessions s
        WHERE s.group_id = documents.documentable_id
          AND (
            s.provider_id = (SELECT auth.uid())
            OR s.assigned_to_specialist_id = (SELECT auth.uid())
            OR s.assigned_to_sea_id = (SELECT auth.uid())
          )
        LIMIT 1
      )
    )
    OR
    -- For session documents
    (
      documentable_type = 'session'
      AND EXISTS (
        SELECT 1
        FROM schedule_sessions s
        WHERE s.id = documents.documentable_id
          AND (
            s.provider_id = (SELECT auth.uid())
            OR s.assigned_to_specialist_id = (SELECT auth.uid())
            OR s.assigned_to_sea_id = (SELECT auth.uid())
          )
      )
    )
  );


-- ========================================
-- Table: exit_tickets
-- Consolidate 2 INSERT policies and 2 SELECT policies
-- ========================================

-- Consolidate INSERT policies: "Providers can create exit tickets" + "SEAs can create exit tickets for assigned students"
DROP POLICY IF EXISTS "Providers can create exit tickets" ON public.exit_tickets;
DROP POLICY IF EXISTS "SEAs can create exit tickets for assigned students" ON public.exit_tickets;

CREATE POLICY "Users can create exit tickets" ON public.exit_tickets
  FOR INSERT
  WITH CHECK (
    -- Provider can create for their own students
    (
      provider_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM students s
        WHERE s.id = exit_tickets.student_id
          AND s.provider_id = (SELECT auth.uid())
      )
    )
    OR
    -- SEA can create for assigned students (provider_id must match student's provider)
    (
      provider_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM schedule_sessions ss
        JOIN profiles p ON p.id = (SELECT auth.uid())
        JOIN students s ON s.id = exit_tickets.student_id
        WHERE ss.student_id = exit_tickets.student_id
          AND ss.assigned_to_sea_id = p.id
          AND ss.delivered_by = 'sea'
          AND p.role = 'sea'
          AND exit_tickets.provider_id = s.provider_id
      )
    )
  );

-- Consolidate SELECT policies: "Providers can view own exit tickets" + "SEAs can view exit tickets for assigned students"
DROP POLICY IF EXISTS "Providers can view own exit tickets" ON public.exit_tickets;
DROP POLICY IF EXISTS "SEAs can view exit tickets for assigned students" ON public.exit_tickets;

CREATE POLICY "Users can view exit tickets" ON public.exit_tickets
  FOR SELECT
  USING (
    -- Provider can view their own exit tickets
    provider_id = (SELECT auth.uid())
    OR
    -- SEA can view exit tickets for assigned students
    EXISTS (
      SELECT 1
      FROM schedule_sessions ss
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE ss.student_id = exit_tickets.student_id
        AND ss.assigned_to_sea_id = p.id
        AND ss.delivered_by = 'sea'
        AND p.role = 'sea'
    )
  );


-- ========================================
-- Table: student_details
-- Consolidate 2 SELECT policies and 2 UPDATE policies
-- ========================================

-- Consolidate SELECT policies: "Providers can manage their students details" + "SEAs can view student details for assigned students"
DROP POLICY IF EXISTS "Providers can manage their students details" ON public.student_details;
DROP POLICY IF EXISTS "SEAs can view student details for assigned students" ON public.student_details;

CREATE POLICY "Users can view student details" ON public.student_details
  FOR SELECT
  USING (
    -- Provider can view their own students' details
    EXISTS (
      SELECT 1
      FROM students
      WHERE students.id = student_details.student_id
        AND students.provider_id = (SELECT auth.uid())
    )
    OR
    -- SEA can view details for assigned students
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

-- Re-create provider UPDATE policy (was using ALL command which includes SELECT)
CREATE POLICY "Providers can update their students details" ON public.student_details
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM students
      WHERE students.id = student_details.student_id
        AND students.provider_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM students
      WHERE students.id = student_details.student_id
        AND students.provider_id = (SELECT auth.uid())
    )
  );

-- Re-create provider INSERT and DELETE policies (were using ALL command)
CREATE POLICY "Providers can insert their students details" ON public.student_details
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM students
      WHERE students.id = student_details.student_id
        AND students.provider_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Providers can delete their students details" ON public.student_details
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM students
      WHERE students.id = student_details.student_id
        AND students.provider_id = (SELECT auth.uid())
    )
  );

-- Keep SEA UPDATE policy separate as it has different conditions
-- (Only allowing updates to specific fields like exit ticket rotation)


-- ========================================
-- Table: students
-- Consolidate 2 SELECT policies
-- ========================================

-- Consolidate SELECT policies: "Users can view their own students" + "SEAs can view students assigned to them"
DROP POLICY IF EXISTS "Users can view their own students" ON public.students;
DROP POLICY IF EXISTS "SEAs can view students assigned to them" ON public.students;

CREATE POLICY "Users can view students" ON public.students
  FOR SELECT
  USING (
    -- Provider can view their own students
    provider_id = (SELECT auth.uid())
    OR
    -- Assigned specialist can view students
    EXISTS (
      SELECT 1
      FROM schedule_sessions
      WHERE schedule_sessions.student_id = students.id
        AND (
          schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
          OR schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
        )
    )
  );


-- ========================================
-- Verification
-- ========================================

DO $$
DECLARE
  multi_policy_count INTEGER;
BEGIN
  -- Check for remaining multiple permissive policies
  SELECT COUNT(*) INTO multi_policy_count
  FROM (
    SELECT schemaname, tablename, cmd, COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND tablename IN ('documents', 'exit_tickets', 'student_details', 'students')
    GROUP BY schemaname, tablename, cmd
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF multi_policy_count > 0 THEN
    RAISE WARNING 'Some tables still have multiple permissive policies for the same action. Count: %', multi_policy_count;
  ELSE
    RAISE NOTICE 'RLS policy consolidation completed successfully.';
    RAISE NOTICE 'All duplicate permissive policies have been consolidated.';
    RAISE NOTICE 'This should improve RLS policy evaluation performance.';
  END IF;
END $$;
