-- Secondary-resource service minutes are stored as one weekly bucket
-- (sessions_per_week = 1, minutes_per_session = the full weekly amount) so a
-- middle/high-school resource caseload isn't chopped into phantom 30-minute
-- pull-out sessions ("19x/week, 30 min" at the John Swett pilot). A weekly
-- bucket legitimately runs to ~1500 minutes (a multi-period daily mandate),
-- so the old 120-minute cap must widen; 1800 (30 hours/week) still rejects
-- garbage parses. Elementary pull-out entry keeps its 15-60 minute UI range —
-- this bound is a backstop, not the UX.
ALTER TABLE students DROP CONSTRAINT IF EXISTS check_minutes_per_session;
ALTER TABLE students ADD CONSTRAINT check_minutes_per_session
  CHECK (minutes_per_session > 0 AND minutes_per_session <= 1800);
