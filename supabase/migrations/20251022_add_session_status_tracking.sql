-- Add session status tracking to schedule_sessions table
-- This enables marking sessions as conflicted or needing attention

-- Create enum type for session status
CREATE TYPE session_status AS ENUM ('active', 'conflict', 'needs_attention');

-- Add status column with default value 'active'
ALTER TABLE public.schedule_sessions
  ADD COLUMN status session_status NOT NULL DEFAULT 'active';

-- Add conflict_reason column to store explanation of issues
ALTER TABLE public.schedule_sessions
  ADD COLUMN conflict_reason text;

-- Create index for efficient querying of non-active sessions
CREATE INDEX idx_schedule_sessions_status
  ON public.schedule_sessions(status)
  WHERE status != 'active';

-- Add comment
COMMENT ON COLUMN public.schedule_sessions.status IS
  'Status of the session: active (normal), conflict (overlaps/invalid), needs_attention (requires review)';

COMMENT ON COLUMN public.schedule_sessions.conflict_reason IS
  'Human-readable explanation of why session is flagged (e.g., "Overlaps with another session", "Exceeds bell schedule hours")';
