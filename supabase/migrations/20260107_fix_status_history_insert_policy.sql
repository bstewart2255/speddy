-- Fix RLS INSERT policy for care_case_status_history
-- The previous policy only verified changed_by = auth.uid()
-- This updated policy also verifies the user has access to the case

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can insert status history" ON care_case_status_history;

-- Create improved INSERT policy that checks both:
-- 1. changed_by matches the authenticated user
-- 2. The user has access to the case (via school_id or district_id)
CREATE POLICY "Users can insert status history for accessible cases"
  ON care_case_status_history FOR INSERT
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM care_cases cc
      JOIN care_referrals cr ON cc.referral_id = cr.id
      WHERE cc.id = care_case_status_history.case_id
      AND (cr.school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
           OR cr.district_id IN (SELECT district_id FROM profiles WHERE id = auth.uid()))
    )
  );
