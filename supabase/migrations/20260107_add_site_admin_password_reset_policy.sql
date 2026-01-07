-- Database function for site admins to mark password as reset
-- This is more secure than a broad RLS policy since it only allows
-- updating specific fields (must_change_password, password_reset_requested_at)

CREATE OR REPLACE FUNCTION mark_password_reset(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_school_id TEXT;
BEGIN
  -- Get target user's school
  SELECT school_id INTO target_school_id
  FROM profiles
  WHERE id = target_user_id;

  -- Verify caller is site_admin for target's school
  IF NOT EXISTS (
    SELECT 1 FROM admin_permissions
    WHERE admin_id = auth.uid()
    AND role = 'site_admin'
    AND school_id = target_school_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: must be site_admin for user''s school';
  END IF;

  -- Prevent admins from resetting their own password via this function
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot reset your own password through this function';
  END IF;

  -- Update only the password-related fields
  UPDATE profiles
  SET
    must_change_password = TRUE,
    password_reset_requested_at = NULL
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;
