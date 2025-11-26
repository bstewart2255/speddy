-- Fix: Restore specialist visibility for assigned sessions
--
-- Regression: The 20251122_210000_optimize_rls_auth_policies.sql migration
-- incorrectly removed the assigned_to_specialist_id check from students RLS,
-- breaking cross-specialist session assignments.
--
-- This migration adds back the missing check so specialists can view
-- student details (initials, grade, IEP goals) for sessions assigned to them.

-- Add policy for specialists to view students from their assigned sessions
-- This mirrors the existing "SEAs can view students assigned to them" policy
CREATE POLICY "Specialists can view students from assigned sessions" ON students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM schedule_sessions
            WHERE schedule_sessions.student_id = students.id
            AND schedule_sessions.assigned_to_specialist_id = (select auth.uid())
        )
    );
