-- Migration: Allow SEAs to generate exit tickets and progress checks for assigned students
-- Issue: SEAs cannot update student_details rotation tracking or insert exit_tickets
-- Solution: Add targeted RLS policies for SEA permissions

-- Allow SEAs to UPDATE last_exit_ticket_goal_index in student_details for assigned students
-- This is needed when generating exit tickets to track which goal was used
CREATE POLICY "SEAs can update exit ticket rotation for assigned students"
ON student_details
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = auth.uid()
    WHERE ss.student_id = student_details.student_id
      AND ss.assigned_to_sea_id = auth.uid()
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = auth.uid()
    WHERE ss.student_id = student_details.student_id
      AND ss.assigned_to_sea_id = auth.uid()
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
    INNER JOIN profiles p ON p.id = auth.uid()
    WHERE ss.student_id = exit_tickets.student_id
      AND ss.assigned_to_sea_id = auth.uid()
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
      AND exit_tickets.provider_id = auth.uid()
  )
);
