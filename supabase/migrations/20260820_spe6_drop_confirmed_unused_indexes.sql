-- SPE-6: drop indexes confirmed genuinely unused, not just idle.
--
-- The advisor flagged 20 "unused_index" candidates. Cross-checked each
-- against pg_stat_user_indexes (idx_scan) and live query code:
--
-- 17 of the 20 were NOT dropped — they cover FK/access-pattern columns on
-- actively-developed features (CARE, admin_permissions, staff, todos,
-- rotation groups, iep_meetings, user_site_schedules, student_assessments)
-- whose tables are just small enough today (single-page, <70 rows) that
-- Postgres's planner ignores any index and seq-scans instead. idx_scan=0
-- there is a row-count artifact, not evidence the index is wrong — dropping
-- them now would likely just require SPE-7 to re-add the same indexes once
-- these tables grow past the seq-scan threshold.
--
-- These 3 are genuinely dead:
--   * idx_team_members_user_id: `team_members` has zero live query code
--     anywhere in the app (grep confirmed) and zero rows. Schema exists,
--     feature isn't wired up to anything yet.
--   * idx_holidays_created_by / idx_holidays_updated_by: created_by is
--     touched by exactly one rare admin-cleanup path
--     (app/api/admin/providers/[providerId]/route.ts, nulling on provider
--     delete) against a 12-row table; updated_by has no query usage at all.

DROP INDEX IF EXISTS idx_team_members_user_id;
DROP INDEX IF EXISTS idx_holidays_created_by;
DROP INDEX IF EXISTS idx_holidays_updated_by;
