-- Fix security definer issue on unmatched_student_teachers view
-- The view was recreated in 20251213_extend_id_columns_for_uuid.sql without
-- setting security_invoker, causing it to use SECURITY DEFINER (default)
-- which bypasses RLS policies.

ALTER VIEW unmatched_student_teachers SET (security_invoker = true);

-- Re-grant select to authenticated users (in case it was also lost)
GRANT SELECT ON unmatched_student_teachers TO authenticated;

COMMENT ON VIEW unmatched_student_teachers IS
'Shows students with teacher_name but no matching teacher_id.
These records may need manual teacher assignment by a site administrator.
Updated: Fixed security_invoker property.';
