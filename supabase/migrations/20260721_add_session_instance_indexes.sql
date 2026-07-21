-- SPE-292: indexes for the hottest read shape on schedule_sessions —
-- "dated instances for a provider/assignee within a date range" (calendar
-- week/day views, Today's Schedule, weekly view, all via
-- SessionGenerator.getSessionsForDateRange).
--
-- Until now no index led with provider_id or an assignee column, so these
-- reads walked the whole table or the full width of unique_session_per_date
-- (leading column student_id is never constrained by these queries):
-- pg_stat_user_tables showed ~54k seq scans / 130M tuples read. Cost grew
-- linearly with TOTAL rows across all tenants.
--
-- The role-based OR filter (provider_id = X OR assigned_to_sea_id = X OR
-- assigned_to_specialist_id = X) can now resolve as a BitmapOr across the
-- three indexes below. The assignee indexes are partial because those columns
-- are NULL on the vast majority of rows.
--
-- Note: 20250813_performance_optimization.sql promised similar indexes but
-- referenced columns that don't exist (`date`, `completed`), so they were
-- never created (cleanup tracked in SPE-299).
--
-- Deliberately NOT `CONCURRENTLY`: this migration is applied transactionally
-- (CONCURRENTLY cannot run inside a transaction — 20250813 made that exact
-- mistake and silently built nothing), the table was ~3.4MB/16k rows at apply
-- time (write-blocking ShareLock held ~100ms), and IF NOT EXISTS makes any
-- replay a no-op against the already-built indexes. If this table is ever
-- orders of magnitude larger, future index work needs a non-transactional
-- CONCURRENTLY path instead.

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_provider_session_date
  ON schedule_sessions (provider_id, session_date);

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_sea_session_date
  ON schedule_sessions (assigned_to_sea_id, session_date)
  WHERE assigned_to_sea_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_specialist_session_date
  ON schedule_sessions (assigned_to_specialist_id, session_date)
  WHERE assigned_to_specialist_id IS NOT NULL;
