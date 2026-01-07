-- Add password reset request tracking and force change flag to profiles table
-- Used for provider password reset request workflow

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN profiles.password_reset_requested_at IS 'Timestamp when provider requested a password reset (NULL = no pending request)';
COMMENT ON COLUMN profiles.must_change_password IS 'If TRUE, user must change password on next login';
