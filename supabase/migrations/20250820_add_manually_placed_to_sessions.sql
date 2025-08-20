-- Add manually_placed column to schedule_sessions table
ALTER TABLE schedule_sessions 
ADD COLUMN IF NOT EXISTS manually_placed BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN schedule_sessions.manually_placed IS 'Indicates if this session was manually placed despite conflicts';

-- Create index for faster filtering of manually placed sessions
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_manually_placed 
ON schedule_sessions(manually_placed) 
WHERE manually_placed = TRUE;