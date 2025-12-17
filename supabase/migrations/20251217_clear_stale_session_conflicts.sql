-- Migration: Clear stale session conflicts
-- Date: 2025-12-17
--
-- This migration clears phantom conflict flags that were left behind when
-- conflicting sessions were moved. The bug was that when session A conflicted
-- with session B, moving session B to a clear spot would clear B's conflict
-- but leave A's conflict flag set (even though the conflict no longer existed).

-- Clear stale student overlap conflicts (same provider only)
-- This finds sessions marked with conflicts that no longer have actual overlapping sessions
UPDATE schedule_sessions ss
SET status = 'active', has_conflict = false, conflict_reason = null
WHERE has_conflict = true
  AND session_date IS NULL
  AND conflict_reason LIKE '%Student already has a session%'
  AND NOT EXISTS (
    SELECT 1 FROM schedule_sessions other
    WHERE other.student_id = ss.student_id
      AND other.provider_id = ss.provider_id
      AND other.day_of_week = ss.day_of_week
      AND other.id != ss.id
      AND other.session_date IS NULL
      AND other.start_time IS NOT NULL
      AND ss.start_time < other.end_time
      AND ss.end_time > other.start_time
  );

-- Also clear any conflicts with generic "Overlaps" message that no longer have actual overlaps
UPDATE schedule_sessions ss
SET status = 'active', has_conflict = false, conflict_reason = null
WHERE has_conflict = true
  AND session_date IS NULL
  AND conflict_reason LIKE '%Overlaps with another session%'
  AND NOT EXISTS (
    SELECT 1 FROM schedule_sessions other
    WHERE other.student_id = ss.student_id
      AND other.provider_id = ss.provider_id
      AND other.day_of_week = ss.day_of_week
      AND other.id != ss.id
      AND other.session_date IS NULL
      AND other.start_time IS NOT NULL
      AND ss.start_time < other.end_time
      AND ss.end_time > other.start_time
  );
