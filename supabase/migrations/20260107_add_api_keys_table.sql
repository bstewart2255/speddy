-- API Keys table for Chrome Extension authentication
-- Keys are hashed (SHA-256) - full key is only shown once at creation

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,  -- SHA-256 hash of the full key
  key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "sk_live_abc")
  name TEXT NOT NULL DEFAULT 'Chrome Extension',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE(key_hash)
);

-- Index for fast lookups by hash during authentication
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- Index for listing user's keys
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- RLS: Users can only see their own keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keys" ON api_keys
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own keys" ON api_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own keys" ON api_keys
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Comment for documentation
COMMENT ON TABLE api_keys IS 'API keys for Chrome Extension authentication. Keys are SHA-256 hashed.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the full API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of key for display identification';
