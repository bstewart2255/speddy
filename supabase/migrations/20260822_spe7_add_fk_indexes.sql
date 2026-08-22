-- SPE-7: add covering indexes for unindexed foreign keys that are actually
-- queried, joined, or filtered by an RLS policy on every request.
--
-- The advisor flagged 49 unindexed FKs. Per the ticket's own caveat ("don't
-- blindly index all of them"), each was checked against live app code and
-- RLS policy text, not just column name. Verdict: 13 index, 36 skip — though
-- 2 of the 13 (calendar_events.district_id/.school_id) turned out to be
-- mistakes on a stale RLS-policy citation and were dropped by a same-day
-- follow-up migration; see the per-column notes below. Net result: 11 kept.
--
-- All 13 tables here are small today (all comfortably under 1000 rows, the
-- largest at 829), so this is a non-concurrent CREATE INDEX (plain
-- transactional migration, no CREATE INDEX CONCURRENTLY) with an acceptable
-- brief write-lock. What earns these an index isn't table size — per SPE-6,
-- Postgres seq-scans small tables regardless of an index's existence — it's
-- that the column is a live RLS predicate (evaluated on every request
-- against the table, regardless of row count) or a genuine multi-row app
-- query filter:
--
--   * bell_schedules.provider_id       - RLS: provider_id = auth.uid()
--   * calendar_events.district_id      - WRONG at the time this migration
--                                         was written (cited a policy named
--                                         "SEAs can view provider calendar
--                                         events" that no longer exists —
--                                         see 20260822_spe7_drop_unjustified_
--                                         calendar_events_indexes.sql). Kept
--                                         here, not edited, as the honest
--                                         record of what actually ran; the
--                                         follow-up migration drops it.
--   * calendar_events.provider_id      - RLS: provider_id = auth.uid() (x4);
--                                         indexed previously, dropped as
--                                         "unused" in 20251003 before this
--                                         RLS dependency existed
--   * calendar_events.school_id        - same WRONG justification as
--                                         district_id above; dropped by the
--                                         same follow-up migration
--   * conversation_read_state.profile_id - RLS: profile_id = auth.uid();
--                                         scanned in get_my_conversations()
--                                         on every chat-list load
--   * conversations.school_id          - filtered in get_my_conversations():
--                                         c.school_id = p_school_id
--   * districts.state_id               - app filter .eq('state_id', ...) in
--                                         app/api/schools/districts/route.ts
--   * documents.created_by             - RLS: created_by = auth.uid() (x4);
--                                         indexed at table creation, dropped
--                                         as "unused" in 20251111 before the
--                                         RLS dependency was scrutinized
--   * profiles.district_id             - RLS: district-admin branch matches
--                                         ap.district_id = profiles.district_id
--                                         directly (20260806_spe394)
--   * provider_schools.school_id       - RLS: site-admin and district-admin
--                                         branches both match school_id
--   * special_activities.provider_id   - RLS: provider_id = auth.uid()
--   * student_parent_contacts.school_id - RLS: school_id IN
--                                         (SELECT school_id FROM get_my_school_ids())
--                                         on all 4 policies
--   * todos.school_id                  - app filter in todo-widget.tsx:
--                                         .or('school_id.eq.X,school_id.is.null')
--
-- The other 36 flagged FKs are write-time attribution columns (created_by/
-- updated_by/granted_by/marked_by/changed_by) never read back, or
-- denormalized id copies that RLS/app code deliberately scopes through a
-- different column instead — same pattern SPE-6 already established for
-- holidays.created_by/updated_by and team_members.user_id.

CREATE INDEX IF NOT EXISTS idx_bell_schedules_provider_id ON public.bell_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_district_id ON public.calendar_events(district_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_provider_id ON public.calendar_events(provider_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_school_id ON public.calendar_events(school_id);
CREATE INDEX IF NOT EXISTS idx_conversation_read_state_profile_id ON public.conversation_read_state(profile_id);
CREATE INDEX IF NOT EXISTS idx_conversations_school_id ON public.conversations(school_id);
CREATE INDEX IF NOT EXISTS idx_districts_state_id ON public.districts(state_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_district_id ON public.profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_provider_schools_school_id ON public.provider_schools(school_id);
CREATE INDEX IF NOT EXISTS idx_special_activities_provider_id ON public.special_activities(provider_id);
CREATE INDEX IF NOT EXISTS idx_student_parent_contacts_school_id ON public.student_parent_contacts(school_id);
CREATE INDEX IF NOT EXISTS idx_todos_school_id ON public.todos(school_id);
