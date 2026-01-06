-- Migration: CARE Status Rename and Initial Stage
-- 1. Add 'initial' stage to care_referrals
-- 2. Replace disposition values with new status options
-- 3. Create status history tracking table

-- 1. Add 'initial' to care_referrals status constraint
ALTER TABLE care_referrals DROP CONSTRAINT IF EXISTS care_referrals_status_check;
ALTER TABLE care_referrals ADD CONSTRAINT care_referrals_status_check
  CHECK (status IN ('pending', 'active', 'initial', 'closed'));

-- 2. Clear existing disposition values FIRST (before adding new constraint)
UPDATE care_cases SET current_disposition = NULL WHERE current_disposition IS NOT NULL;

-- 3. Update care_cases disposition constraint with new values
ALTER TABLE care_cases DROP CONSTRAINT IF EXISTS care_cases_current_disposition_check;
ALTER TABLE care_cases ADD CONSTRAINT care_cases_current_disposition_check
  CHECK (current_disposition IN (
    'teacher_consult', 'wait_for_report_card', 'wait_for_assessment_data',
    'intervention', 'counseling_referral', 'schedule_sst', 'send_ap', 'move_to_initials'
  ));

-- 4. Create status history table
CREATE TABLE care_case_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookup by case
CREATE INDEX idx_care_case_status_history_case_id ON care_case_status_history(case_id);

-- RLS policies
ALTER TABLE care_case_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view status history for cases they can access"
  ON care_case_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM care_cases cc
    JOIN care_referrals cr ON cc.referral_id = cr.id
    WHERE cc.id = care_case_status_history.case_id
    AND (cr.school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR cr.district_id IN (SELECT district_id FROM profiles WHERE id = auth.uid()))
  ));

CREATE POLICY "Users can insert status history"
  ON care_case_status_history FOR INSERT
  WITH CHECK (changed_by = auth.uid());
