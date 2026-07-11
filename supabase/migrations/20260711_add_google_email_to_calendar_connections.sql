-- SPE-205: record which Google account a calendar connection is bound to,
-- for "Connected as …" display and wrong-account detection (district vs
-- personal Gmail). Nullable; rows from before this column backfill on the
-- next reconnect.
ALTER TABLE calendar_connections ADD COLUMN IF NOT EXISTS google_email TEXT;

COMMENT ON COLUMN calendar_connections.google_email IS
  'Email of the connected Google account (from the OAuth id_token); display/diagnostics only';
