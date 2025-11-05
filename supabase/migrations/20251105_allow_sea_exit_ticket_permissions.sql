-- Migration: Allow SEAs to generate exit tickets and progress checks for assigned students
-- Issue: SEAs cannot update student_details rotation tracking or insert exit_tickets
-- Solution: Add targeted RLS policies for SEA permissions

-- Drop existing policies if they exist (in case of re-running migration)
DROP POLICY IF EXISTS "SEAs can update exit ticket rotation for assigned students" ON student_details;
DROP POLICY IF EXISTS "SEAs can create exit tickets for assigned students" ON exit_tickets;
DROP POLICY IF EXISTS "SEAs can view exit tickets for assigned students" ON exit_tickets;

-- Allow SEAs to UPDATE last_exit_ticket_goal_index in student_details for assigned students
-- This is needed when generating exit tickets to track which goal was used
CREATE POLICY "SEAs can update exit ticket rotation for assigned students"
ON student_details
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = (SELECT auth.uid())
    WHERE ss.student_id = student_details.student_id
      AND ss.assigned_to_sea_id = (SELECT auth.uid())
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = (SELECT auth.uid())
    WHERE ss.student_id = student_details.student_id
      AND ss.assigned_to_sea_id = (SELECT auth.uid())
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
  )
);

-- Allow SEAs to INSERT exit_tickets for their assigned students
-- Note: The existing policy only allows providers to create exit tickets where auth.uid() = provider_id
-- This new policy allows SEAs to create tickets for students they're assigned to via schedule_sessions
CREATE POLICY "SEAs can create exit tickets for assigned students"
ON exit_tickets
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = (SELECT auth.uid())
    WHERE ss.student_id = exit_tickets.student_id
      AND ss.assigned_to_sea_id = (SELECT auth.uid())
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
      AND exit_tickets.provider_id = (SELECT auth.uid())
  )
);

-- Allow SEAs to view exit tickets for their assigned students
-- This allows SEAs to see the exit tickets they created
CREATE POLICY "SEAs can view exit tickets for assigned students"
ON exit_tickets
FOR SELECT
USING (
  -- SEAs can view tickets they created (where they are the provider)
  exit_tickets.provider_id = (SELECT auth.uid())
  OR
  -- SEAs can view tickets for students assigned to them
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = (SELECT auth.uid())
    WHERE ss.student_id = exit_tickets.student_id
      AND ss.assigned_to_sea_id = (SELECT auth.uid())
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
  )
);
