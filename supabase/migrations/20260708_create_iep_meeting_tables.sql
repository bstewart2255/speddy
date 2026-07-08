-- IEP Meeting Scheduling Tables (SPE-203)
-- Spec: docs/IEP_MEETING_SCHEDULING_SPEC.md §11
-- Meetings, attendees, parent contacts, confirmation tokens, calendar
-- connections, site rules, teacher availability preferences.
-- Deliberately separate from schedule_sessions (spec §3 principle #1).

-- 1. student_parent_contacts (created first: referenced by attendees/tokens)
CREATE TABLE IF NOT EXISTS student_parent_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

  -- School context (denormalized for RLS, matching care_referrals)
  school_id VARCHAR REFERENCES schools(id),

  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  preferred_language TEXT,
  preferred_channel TEXT CHECK (preferred_channel IN ('email', 'text', 'phone')),
  verified_at TIMESTAMPTZ, -- last "still current?" confirmation

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. iep_meetings
CREATE TABLE IF NOT EXISTS iep_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id VARCHAR REFERENCES schools(id),

  -- Organizer survives staff turnover (SET NULL, not CASCADE)
  organizer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- v1 uses annual/triennial; enum models all four so v2+ needs no migration
  meeting_type TEXT NOT NULL DEFAULT 'annual'
    CHECK (meeting_type IN ('annual', 'triennial', 'amendment', 'initial')),

  due_date DATE, -- compliance deadline (from student_details.upcoming_* fields)
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  location TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reserved', 'confirming', 'confirmed', 'held', 'cancelled')),

  -- Google Calendar event created from the organizer's calendar (nullable:
  -- meetings are fully functional without calendar integration)
  google_event_id TEXT,

  -- Free-text log for offline coordination ("parent confirmed by phone 1/28")
  confirmation_log TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ -- soft delete
);

-- 3. iep_meeting_attendees
CREATE TABLE IF NOT EXISTS iep_meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES iep_meetings(id) ON DELETE CASCADE,

  -- Exactly one identity: staff profile, parent contact, or free-text name
  -- (interpreter, outside provider — keeps the manual path first-class).
  -- parent_contact_id cascades: with the exactly-one CHECK below, SET NULL
  -- would make contact deletion fail.
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  parent_contact_id UUID REFERENCES student_parent_contacts(id) ON DELETE CASCADE,
  display_name TEXT,
  CONSTRAINT iep_meeting_attendees_one_identity
    CHECK (num_nonnulls(profile_id, parent_contact_id, display_name) = 1),

  attendee_role TEXT NOT NULL
    CHECK (attendee_role IN ('lea_rep', 'case_manager', 'teacher', 'provider', 'parent', 'other')),
  is_required BOOLEAN NOT NULL DEFAULT true,

  rsvp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (rsvp_status IN ('pending', 'accepted', 'declined', 'tentative')),
  rsvp_source TEXT CHECK (rsvp_source IN ('google', 'speddy', 'offline')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. parent_confirmation_tokens
-- Parents are unauthenticated: the tokenized page is served by an API route
-- using the service role (bypasses RLS) after hashing the presented token.
-- Only the hash is stored — a DB read never exposes a usable link.
CREATE TABLE IF NOT EXISTS parent_confirmation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES iep_meetings(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES student_parent_contacts(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  response TEXT CHECK (response IN ('confirmed', 'requested_change')),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. calendar_connections
-- Tokens are encrypted at the application layer before insert; these columns
-- hold ciphertext only. RLS is owner-only — never school-scoped.
CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),

  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (profile_id, provider)
);

-- 6. site_meeting_rules
CREATE TABLE IF NOT EXISTS site_meeting_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR NOT NULL UNIQUE REFERENCES schools(id),

  -- [{ "day_of_week": 2, "start_time": "07:30", "end_time": "08:15" }, ...]
  allowed_windows JSONB NOT NULL DEFAULT '[]',
  -- [{ "start_date": "2026-11-02", "end_date": "2026-11-13", "label": "State testing" }, ...]
  blackout_ranges JSONB NOT NULL DEFAULT '[]',
  rooms TEXT[],
  max_meetings_per_day INTEGER,

  -- Existing shared "IEP Calendar" to read as a busy source (optional input,
  -- never a dependency — spec §6)
  external_iep_calendar_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. teacher_availability_prefs
CREATE TABLE IF NOT EXISTS teacher_availability_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id VARCHAR REFERENCES schools(id),
  school_year TEXT NOT NULL, -- e.g. '2026-27'

  -- Manual entry works for both levels: elementary derives from bell
  -- schedule, secondary free-enters a prep window (spec §8)
  prep_start TIME,
  prep_end TIME,
  prep_description TEXT, -- e.g. '4th period'
  meeting_time_preference TEXT
    CHECK (meeting_time_preference IN ('before_school', 'after_school', 'prep', 'any')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (profile_id, school_year)
);

-- Indexes
CREATE INDEX idx_iep_meetings_school_status ON iep_meetings(school_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_iep_meetings_student ON iep_meetings(student_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_iep_meetings_organizer ON iep_meetings(organizer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_iep_meetings_due_date ON iep_meetings(due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_iep_meeting_attendees_meeting ON iep_meeting_attendees(meeting_id);
CREATE INDEX idx_iep_meeting_attendees_profile ON iep_meeting_attendees(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_student_parent_contacts_student ON student_parent_contacts(student_id);
CREATE INDEX idx_parent_confirmation_tokens_meeting ON parent_confirmation_tokens(meeting_id);
CREATE INDEX idx_calendar_connections_profile ON calendar_connections(profile_id);
CREATE INDEX idx_teacher_availability_prefs_school ON teacher_availability_prefs(school_id, school_year);

-- One attendee row per staff member per meeting
CREATE UNIQUE INDEX idx_iep_meeting_attendees_unique_profile
  ON iep_meeting_attendees(meeting_id, profile_id) WHERE profile_id IS NOT NULL;

-- Keep updated_at fresh on UPDATE (update_updated_at_column() defined in
-- 20250820_add_student_assessments_table.sql)
CREATE TRIGGER update_student_parent_contacts_updated_at
  BEFORE UPDATE ON student_parent_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_iep_meetings_updated_at
  BEFORE UPDATE ON iep_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_iep_meeting_attendees_updated_at
  BEFORE UPDATE ON iep_meeting_attendees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_site_meeting_rules_updated_at
  BEFORE UPDATE ON site_meeting_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teacher_availability_prefs_updated_at
  BEFORE UPDATE ON teacher_availability_prefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE student_parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE iep_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE iep_meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_meeting_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_availability_prefs ENABLE ROW LEVEL SECURITY;

-- RLS: iep_meetings — school-scoped via get_my_school_ids() (SECURITY DEFINER
-- helper from 20251223_allow_providers_view_school_profiles.sql)
CREATE POLICY "iep_meetings_select" ON iep_meetings
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

CREATE POLICY "iep_meetings_insert" ON iep_meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    organizer_id = auth.uid()
    AND school_id IN (SELECT school_id FROM get_my_school_ids())
  );

CREATE POLICY "iep_meetings_update" ON iep_meetings
  FOR UPDATE TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

CREATE POLICY "iep_meetings_delete" ON iep_meetings
  FOR DELETE TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

-- RLS: iep_meeting_attendees — scope via parent meeting
CREATE POLICY "iep_meeting_attendees_select" ON iep_meeting_attendees
  FOR SELECT TO authenticated
  USING (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

CREATE POLICY "iep_meeting_attendees_insert" ON iep_meeting_attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

CREATE POLICY "iep_meeting_attendees_update" ON iep_meeting_attendees
  FOR UPDATE TO authenticated
  USING (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

CREATE POLICY "iep_meeting_attendees_delete" ON iep_meeting_attendees
  FOR DELETE TO authenticated
  USING (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

-- RLS: student_parent_contacts — school-scoped (parent PII: read/write limited
-- to the student's school community; service role handles parent-facing reads)
CREATE POLICY "student_parent_contacts_select" ON student_parent_contacts
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

CREATE POLICY "student_parent_contacts_insert" ON student_parent_contacts
  FOR INSERT TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM get_my_school_ids()));

CREATE POLICY "student_parent_contacts_update" ON student_parent_contacts
  FOR UPDATE TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

CREATE POLICY "student_parent_contacts_delete" ON student_parent_contacts
  FOR DELETE TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

-- RLS: parent_confirmation_tokens — staff see status via meeting scope;
-- token issuance/redemption happens server-side with the service role
CREATE POLICY "parent_confirmation_tokens_select" ON parent_confirmation_tokens
  FOR SELECT TO authenticated
  USING (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

CREATE POLICY "parent_confirmation_tokens_insert" ON parent_confirmation_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

CREATE POLICY "parent_confirmation_tokens_delete" ON parent_confirmation_tokens
  FOR DELETE TO authenticated
  USING (
    meeting_id IN (SELECT id FROM iep_meetings
      WHERE school_id IN (SELECT school_id FROM get_my_school_ids()))
  );

-- RLS: calendar_connections — strictly owner-only, all operations
CREATE POLICY "calendar_connections_select" ON calendar_connections
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "calendar_connections_insert" ON calendar_connections
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "calendar_connections_update" ON calendar_connections
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "calendar_connections_delete" ON calendar_connections
  FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

-- RLS: site_meeting_rules — school community reads; admins with scope write
CREATE POLICY "site_meeting_rules_select" ON site_meeting_rules
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM get_my_school_ids()));

CREATE POLICY "site_meeting_rules_insert" ON site_meeting_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = site_meeting_rules.school_id)
          OR (ap.role = 'district_admin'
              AND ap.district_id = (SELECT district_id FROM schools s WHERE s.id = site_meeting_rules.school_id))
        )
    )
  );

CREATE POLICY "site_meeting_rules_update" ON site_meeting_rules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = site_meeting_rules.school_id)
          OR (ap.role = 'district_admin'
              AND ap.district_id = (SELECT district_id FROM schools s WHERE s.id = site_meeting_rules.school_id))
        )
    )
  );

CREATE POLICY "site_meeting_rules_delete" ON site_meeting_rules
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = site_meeting_rules.school_id)
          OR (ap.role = 'district_admin'
              AND ap.district_id = (SELECT district_id FROM schools s WHERE s.id = site_meeting_rules.school_id))
        )
    )
  );

-- RLS: teacher_availability_prefs — owner writes; school community reads
-- (organizers need teachers' windows to plan)
CREATE POLICY "teacher_availability_prefs_select" ON teacher_availability_prefs
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR school_id IN (SELECT school_id FROM get_my_school_ids())
  );

CREATE POLICY "teacher_availability_prefs_insert" ON teacher_availability_prefs
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "teacher_availability_prefs_update" ON teacher_availability_prefs
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "teacher_availability_prefs_delete" ON teacher_availability_prefs
  FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

-- Comments
COMMENT ON TABLE iep_meetings IS 'IEP team meetings (annual/triennial in v1); separate from schedule_sessions by design';
COMMENT ON TABLE iep_meeting_attendees IS 'Meeting attendees: staff (profile_id), parents (parent_contact_id), or free-text (display_name)';
COMMENT ON TABLE student_parent_contacts IS 'Parent/guardian contact info for meeting confirmation — new PII, school-scoped';
COMMENT ON TABLE parent_confirmation_tokens IS 'Hashed tokens for no-account parent confirmation links; redeemed via service role';
COMMENT ON TABLE calendar_connections IS 'Per-user Google OAuth tokens (app-layer encrypted); RLS owner-only';
COMMENT ON TABLE site_meeting_rules IS 'Per-school meeting windows, blackouts, rooms, and optional external IEP calendar';
COMMENT ON TABLE teacher_availability_prefs IS 'Once-a-year teacher meeting availability (prep window + preference)';
COMMENT ON COLUMN iep_meetings.confirmation_log IS 'Free-text offline coordination log, e.g. "parent confirmed by phone 1/28"';
COMMENT ON COLUMN parent_confirmation_tokens.token_hash IS 'SHA-256 of the raw token; raw value never stored';
