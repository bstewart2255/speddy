-- Add group_color column to schedule_sessions for user-selectable group colors
-- Color is stored as an integer index (0-4) mapping to predefined colors:
-- 0 = blue, 1 = green, 2 = purple, 3 = orange, 4 = pink

ALTER TABLE schedule_sessions
ADD COLUMN IF NOT EXISTS group_color integer;

-- Add check constraint to ensure valid color index (0-4)
ALTER TABLE schedule_sessions
ADD CONSTRAINT group_color_valid CHECK (group_color IS NULL OR (group_color >= 0 AND group_color <= 4));

COMMENT ON COLUMN schedule_sessions.group_color IS 'User-selected color index for session groups: 0=blue, 1=green, 2=purple, 3=orange, 4=pink';
