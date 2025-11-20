-- Create curriculum_tracking table for tracking curriculum progress
-- Supports both group-level and individual session-level tracking

CREATE TABLE IF NOT EXISTS curriculum_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID,
  session_id UUID,
  curriculum_type VARCHAR(100) NOT NULL,
  curriculum_level VARCHAR(50) NOT NULL,
  current_lesson INTEGER NOT NULL CHECK (current_lesson > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure only one of group_id or session_id is set
  CONSTRAINT curriculum_tracking_reference CHECK (
    (group_id IS NOT NULL AND session_id IS NULL) OR
    (group_id IS NULL AND session_id IS NOT NULL)
  ),

  -- Foreign key to schedule_sessions only for session_id (id is the PK)
  CONSTRAINT fk_curriculum_tracking_session
    FOREIGN KEY (session_id)
    REFERENCES schedule_sessions(id)
    ON DELETE CASCADE
);

-- Create unique indexes for efficient lookups and to prevent duplicates
-- Use partial unique indexes to allow NULL values
CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_tracking_group_id_type
  ON curriculum_tracking(group_id, curriculum_type)
  WHERE group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_tracking_session_id_type
  ON curriculum_tracking(session_id, curriculum_type)
  WHERE session_id IS NOT NULL;

-- Create regular indexes for lookups
CREATE INDEX IF NOT EXISTS idx_curriculum_tracking_group_id ON curriculum_tracking(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_curriculum_tracking_session_id ON curriculum_tracking(session_id) WHERE session_id IS NOT NULL;

-- Enable RLS
ALTER TABLE curriculum_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow providers to manage their own curriculum tracking
CREATE POLICY "Providers can view their own curriculum tracking"
  ON curriculum_tracking FOR SELECT
  USING (
    -- Can view if they own the session
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.id = curriculum_tracking.session_id
      AND ss.provider_id = auth.uid()
    ))
    OR
    -- Can view if they own any session in the group
    (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.group_id = curriculum_tracking.group_id
      AND ss.provider_id = auth.uid()
    ))
  );

CREATE POLICY "Providers can insert their own curriculum tracking"
  ON curriculum_tracking FOR INSERT
  WITH CHECK (
    -- Can insert if they own the session
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.id = curriculum_tracking.session_id
      AND ss.provider_id = auth.uid()
    ))
    OR
    -- Can insert if they own any session in the group
    (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.group_id = curriculum_tracking.group_id
      AND ss.provider_id = auth.uid()
    ))
  );

CREATE POLICY "Providers can update their own curriculum tracking"
  ON curriculum_tracking FOR UPDATE
  USING (
    -- Can update if they own the session
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.id = curriculum_tracking.session_id
      AND ss.provider_id = auth.uid()
    ))
    OR
    -- Can update if they own any session in the group
    (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.group_id = curriculum_tracking.group_id
      AND ss.provider_id = auth.uid()
    ))
  );

CREATE POLICY "Providers can delete their own curriculum tracking"
  ON curriculum_tracking FOR DELETE
  USING (
    -- Can delete if they own the session
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.id = curriculum_tracking.session_id
      AND ss.provider_id = auth.uid()
    ))
    OR
    -- Can delete if they own any session in the group
    (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.group_id = curriculum_tracking.group_id
      AND ss.provider_id = auth.uid()
    ))
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_curriculum_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_curriculum_tracking_updated_at_trigger
  BEFORE UPDATE ON curriculum_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_curriculum_tracking_updated_at();

-- Add comment for documentation
COMMENT ON TABLE curriculum_tracking IS 'Tracks curriculum progress for groups and individual sessions. Supports SPIRE (Levels A-J) and Reveal Math (Grades K-12).';
