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
-- Teachers will need to access sessions through direct assignment fields only
CREATE POLICY "Users can view accessible sessions" ON schedule_sessions
    FOR SELECT USING (
        provider_id = (select auth.uid())  -- Session provider
        OR assigned_to_specialist_id = (select auth.uid())  -- Assigned specialist
        OR assigned_to_sea_id = (select auth.uid())  -- Assigned SEA
    );

-- =============================================================================
-- ALTERNATIVE: Add a separate policy for teachers using a simpler check
-- =============================================================================

-- Teachers can view sessions where they are listed in a teacher-related field
-- This avoids the circular dependency by not joining to students table
CREATE POLICY "Teachers can view sessions at their school" ON schedule_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.account_id = (select auth.uid())
            AND teachers.school_id = schedule_sessions.school_id
        )
    );

-- =============================================================================
-- NOTES
-- =============================================================================
-- This breaks the circular dependency by removing the students table join
-- from the schedule_sessions policy. Teachers can now see:
-- 1. Sessions they're directly assigned to (provider/specialist/SEA fields)
-- 2. All sessions at their school (via the new school-based policy)
--
-- This is actually more performant and aligns with typical access patterns
-- where teachers need to see all sessions at their school, not just specific
-- student sessions.
