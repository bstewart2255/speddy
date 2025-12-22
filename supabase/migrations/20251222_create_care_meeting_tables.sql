-- CARE Meeting Module Tables
-- Referrals, Cases, Meeting Notes, Action Items

-- 1. care_referrals table
CREATE TABLE IF NOT EXISTS care_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Student info (manual entry, NOT linked to students table)
  student_name TEXT NOT NULL,
  grade TEXT NOT NULL,

  -- Referral details
  referring_user_id UUID NOT NULL REFERENCES profiles(id),
  referral_reason TEXT NOT NULL,
  category TEXT CHECK (category IN ('academic', 'behavioral', 'attendance', 'social-emotional', 'other')),

  -- School context
  school_id VARCHAR REFERENCES schools(id),
  district_id VARCHAR REFERENCES districts(id),
  state_id VARCHAR REFERENCES states(id),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'closed')),

  -- Timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ -- soft delete
);

-- 2. care_cases table (created when referral becomes active)
CREATE TABLE IF NOT EXISTS care_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES care_referrals(id) ON DELETE CASCADE,

  -- Case management
  current_disposition TEXT CHECK (current_disposition IN (
    'classroom_interventions',
    'tier_2_interventions',
    'refer_for_evaluation',
    'counseling_referral',
    'closed_resolved'
  )),
  assigned_to UUID REFERENCES profiles(id),
  follow_up_date DATE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. care_meeting_notes table
CREATE TABLE IF NOT EXISTS care_meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,

  note_text TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. care_action_items table
CREATE TABLE IF NOT EXISTS care_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  assignee_id UUID REFERENCES profiles(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_care_referrals_school_id ON care_referrals(school_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_care_referrals_status ON care_referrals(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_care_referrals_referring_user ON care_referrals(referring_user_id);
CREATE INDEX idx_care_cases_referral_id ON care_cases(referral_id);
CREATE INDEX idx_care_meeting_notes_case_id ON care_meeting_notes(case_id);
CREATE INDEX idx_care_action_items_case_id ON care_action_items(case_id);
CREATE INDEX idx_care_action_items_assignee ON care_action_items(assignee_id) WHERE completed_at IS NULL;

-- Enable RLS
ALTER TABLE care_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_action_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for care_referrals
CREATE POLICY "care_referrals_select" ON care_referrals
  FOR SELECT TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    )
  );

CREATE POLICY "care_referrals_insert" ON care_referrals
  FOR INSERT TO authenticated
  WITH CHECK (referring_user_id = auth.uid());

CREATE POLICY "care_referrals_update" ON care_referrals
  FOR UPDATE TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    )
  );

CREATE POLICY "care_referrals_delete" ON care_referrals
  FOR DELETE TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    )
  );

-- RLS Policies for care_cases
CREATE POLICY "care_cases_select" ON care_cases
  FOR SELECT TO authenticated
  USING (
    referral_id IN (SELECT id FROM care_referrals WHERE school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    ))
  );

CREATE POLICY "care_cases_insert" ON care_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    referral_id IN (SELECT id FROM care_referrals WHERE school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    ))
  );

CREATE POLICY "care_cases_update" ON care_cases
  FOR UPDATE TO authenticated
  USING (
    referral_id IN (SELECT id FROM care_referrals WHERE school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    ))
  );

CREATE POLICY "care_cases_delete" ON care_cases
  FOR DELETE TO authenticated
  USING (
    referral_id IN (SELECT id FROM care_referrals WHERE school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    ))
  );

-- RLS Policies for care_meeting_notes
CREATE POLICY "care_meeting_notes_select" ON care_meeting_notes
  FOR SELECT TO authenticated
  USING (
    case_id IN (SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
      ))
  );

CREATE POLICY "care_meeting_notes_insert" ON care_meeting_notes
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "care_meeting_notes_update" ON care_meeting_notes
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "care_meeting_notes_delete" ON care_meeting_notes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for care_action_items
CREATE POLICY "care_action_items_select" ON care_action_items
  FOR SELECT TO authenticated
  USING (
    case_id IN (SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
      ))
  );

CREATE POLICY "care_action_items_insert" ON care_action_items
  FOR INSERT TO authenticated
  WITH CHECK (
    case_id IN (SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
      ))
  );

CREATE POLICY "care_action_items_update" ON care_action_items
  FOR UPDATE TO authenticated
  USING (
    case_id IN (SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
      ))
  );

CREATE POLICY "care_action_items_delete" ON care_action_items
  FOR DELETE TO authenticated
  USING (
    case_id IN (SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
      ))
  );

-- Comments
COMMENT ON TABLE care_referrals IS 'CARE meeting referrals for student support discussions';
COMMENT ON TABLE care_cases IS 'Active cases created from CARE referrals';
COMMENT ON TABLE care_meeting_notes IS 'Notes from CARE meetings about specific cases';
COMMENT ON TABLE care_action_items IS 'Action items assigned during CARE meetings';
