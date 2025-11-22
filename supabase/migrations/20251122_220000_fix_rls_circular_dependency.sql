-- Fix circular dependency between students and schedule_sessions RLS policies
-- The infinite recursion occurs because:
-- 1. schedule_sessions policy checks students table (for teachers)
-- 2. students policy checks schedule_sessions table (for SEAs)
-- This creates a cycle that PostgreSQL cannot resolve

-- =============================================================================
-- FIX SCHEDULE_SESSIONS POLICY - Remove student table reference
-- =============================================================================

DROP POLICY IF EXISTS "Users can view accessible sessions" ON schedule_sessions;

-- Recreate without the student/teacher join that causes recursion
-- Users can see sessions where they are:
-- 1. The session provider (created it)
-- 2. Assigned as a specialist
-- 3. Assigned as an SEA
CREATE POLICY "Users can view accessible sessions" ON schedule_sessions
    FOR SELECT USING (
        provider_id = (select auth.uid())  -- Session provider
        OR assigned_to_specialist_id = (select auth.uid())  -- Assigned specialist
        OR assigned_to_sea_id = (select auth.uid())  -- Assigned SEA
    );

-- =============================================================================
-- NOTES
-- =============================================================================
-- This breaks the circular dependency by removing the students table join.
-- The teacher access check has been removed because it caused infinite recursion.
--
-- Impact: Teachers will only see sessions where they are explicitly assigned
-- via provider_id, assigned_to_specialist_id, or assigned_to_sea_id fields.
--
-- If teachers need broader access to sessions for their students, this should
-- be handled at the application layer or by ensuring teachers are properly
-- assigned to relevant sessions via the assignment fields.
