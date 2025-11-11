-- Fix RLS policy for exit_ticket_results to work correctly with joins
-- The issue is that the subqueries in the original policy don't work well
-- when the table is joined in a nested select

-- Drop the old SELECT policy
DROP POLICY IF EXISTS "Users can view exit ticket results in their org" ON exit_ticket_results;

-- Create a simpler, more efficient policy that works with joins
-- This joins to students and checks the IDs directly without subqueries
CREATE POLICY "Users can view exit ticket results in their org"
    ON exit_ticket_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM students s
            INNER JOIN profiles p ON (
                p.id = auth.uid()
                AND (
                    s.school_id = p.school_id
                    OR s.district_id = p.district_id
                    OR s.state_id = p.state_id
                )
            )
            WHERE s.id = exit_ticket_results.student_id
        )
    );

-- Add comment explaining the fix
COMMENT ON POLICY "Users can view exit ticket results in their org" ON exit_ticket_results IS
'Fixed RLS policy that works correctly with nested selects/joins. Checks school/district/state match without subqueries.';
