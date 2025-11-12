-- Fix Sara Harris's auth.users record
-- Issue: email_change_token_current was set to empty string '' instead of NULL
-- This causes "sql: Scan error on column index 8, name 'email_change': converting NULL to string is unsupported"

-- Fix Sara's auth record
UPDATE auth.users
SET
  email_change_token_current = NULL,
  email_change_token_new = NULL
WHERE email = 'harrissara@mdusd.org'
  AND email_change_token_current = '';

-- Verify the fix worked
DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM auth.users
  WHERE email = 'harrissara@mdusd.org'
    AND email_change_token_current IS NULL;

  IF fixed_count = 0 THEN
    RAISE EXCEPTION 'Failed to fix Sara Harris auth record';
  END IF;

  RAISE NOTICE 'Successfully fixed Sara Harris auth record';
END $$;
