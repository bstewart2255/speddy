-- Fix CARE RLS Policies and Add Constraints
-- Addresses security issues identified in PR review

-- 1. Fix care_referrals INSERT policy to validate school_id belongs to user
DROP POLICY IF EXISTS "care_referrals_insert" ON care_referrals;
CREATE POLICY "care_referrals_insert" ON care_referrals
  FOR INSERT TO authenticated
  WITH CHECK (
    referring_user_id = auth.uid()
    AND school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
    )
  );

-- 2. Fix care_meeting_notes INSERT policy to validate case access
DROP POLICY IF EXISTS "care_meeting_notes_insert" ON care_meeting_notes;
CREATE POLICY "care_meeting_notes_insert" ON care_meeting_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND case_id IN (SELECT c.id FROM care_cases c
      JOIN care_referrals r ON c.referral_id = r.id
      WHERE r.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = auth.uid()
      ))
  );

-- 3. Add UNIQUE constraint on care_cases.referral_id to prevent duplicate cases
ALTER TABLE care_cases ADD CONSTRAINT care_cases_referral_id_unique UNIQUE (referral_id);

-- Comments
COMMENT ON POLICY "care_referrals_insert" ON care_referrals IS 'Users can only insert referrals for schools they have access to';
COMMENT ON POLICY "care_meeting_notes_insert" ON care_meeting_notes IS 'Users can only add notes to cases from schools they have access to';
