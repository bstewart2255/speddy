-- Migration: Create attendance table for tracking student session attendance
-- Purpose: Allow providers to mark whether students were present for each session

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    present BOOLEAN NOT NULL DEFAULT true,
    absence_reason TEXT,
    marked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one attendance record per student per session per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique 
ON attendance(session_id, student_id, session_date);

-- Index for quick lookups by session
CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON attendance(session_id);

-- Index for quick lookups by session_date
CREATE INDEX IF NOT EXISTS idx_attendance_session_date ON attendance(session_date);

-- Index for quick lookups by student
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);

-- Enable Row Level Security
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view attendance for sessions they have access to
CREATE POLICY "Users can view attendance for their sessions"
ON attendance FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM schedule_sessions ss
        WHERE ss.id = attendance.session_id
        AND (
            ss.provider_id = auth.uid()
            OR ss.assigned_to_specialist_id = auth.uid()
            OR ss.assigned_to_sea_id = auth.uid()
        )
    )
);

-- RLS Policy: Users can insert attendance for their sessions
CREATE POLICY "Users can insert attendance for their sessions"
ON attendance FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM schedule_sessions ss
        WHERE ss.id = attendance.session_id
        AND (
            ss.provider_id = auth.uid()
            OR ss.assigned_to_specialist_id = auth.uid()
            OR ss.assigned_to_sea_id = auth.uid()
        )
    )
);

-- RLS Policy: Users can update attendance for their sessions
CREATE POLICY "Users can update attendance for their sessions"
ON attendance FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM schedule_sessions ss
        WHERE ss.id = attendance.session_id
        AND (
            ss.provider_id = auth.uid()
            OR ss.assigned_to_specialist_id = auth.uid()
            OR ss.assigned_to_sea_id = auth.uid()
        )
    )
);

-- RLS Policy: Users can delete attendance for their sessions
CREATE POLICY "Users can delete attendance for their sessions"
ON attendance FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM schedule_sessions ss
        WHERE ss.id = attendance.session_id
        AND (
            ss.provider_id = auth.uid()
            OR ss.assigned_to_specialist_id = auth.uid()
            OR ss.assigned_to_sea_id = auth.uid()
        )
    )
);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_attendance_updated_at ON attendance;
CREATE TRIGGER trigger_attendance_updated_at
    BEFORE UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_attendance_updated_at();

-- Add comments
COMMENT ON TABLE attendance IS 'Tracks student attendance for each session instance';
COMMENT ON COLUMN attendance.session_id IS 'References the session (must be an instance, not a template)';
COMMENT ON COLUMN attendance.student_id IS 'References the student';
COMMENT ON COLUMN attendance.session_date IS 'The date of the session instance';
COMMENT ON COLUMN attendance.present IS 'Whether the student was present (true) or absent (false)';
COMMENT ON COLUMN attendance.absence_reason IS 'Optional reason for absence';
COMMENT ON COLUMN attendance.marked_by IS 'The user who marked the attendance';
