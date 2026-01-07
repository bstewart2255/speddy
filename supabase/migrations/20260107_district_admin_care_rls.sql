-- Migration: District Admin CARE RLS Policies
-- Date: 2026-01-07
-- Description: Allow district admins to view CARE data (read-only) across all schools in their district

-- =====================================================
-- CARE_REFERRALS: Add district admin SELECT access
-- =====================================================
CREATE POLICY "District admins can view care_referrals in their district"
ON care_referrals FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    JOIN schools s ON s.district_id::text = ap.district_id::text
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role = 'district_admin'
      AND s.id::text = care_referrals.school_id::text
  )
);

-- =====================================================
-- CARE_CASES: Add district admin SELECT access
-- =====================================================
CREATE POLICY "District admins can view care_cases in their district"
ON care_cases FOR SELECT TO authenticated
USING (
  referral_id IN (
    SELECT cr.id FROM care_referrals cr
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role = 'district_admin'
  )
);

-- =====================================================
-- CARE_ACTION_ITEMS: Add district admin SELECT access
-- =====================================================
CREATE POLICY "District admins can view care_action_items in their district"
ON care_action_items FOR SELECT TO authenticated
USING (
  case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals cr ON c.referral_id = cr.id
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role = 'district_admin'
  )
);

-- =====================================================
-- CARE_MEETING_NOTES: Add district admin SELECT access
-- =====================================================
CREATE POLICY "District admins can view care_meeting_notes in their district"
ON care_meeting_notes FOR SELECT TO authenticated
USING (
  case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals cr ON c.referral_id = cr.id
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role = 'district_admin'
  )
);

-- =====================================================
-- CARE_CASE_STATUS_HISTORY: Add district admin SELECT access
-- =====================================================
CREATE POLICY "District admins can view care_case_status_history in their district"
ON care_case_status_history FOR SELECT TO authenticated
USING (
  case_id IN (
    SELECT c.id FROM care_cases c
    JOIN care_referrals cr ON c.referral_id = cr.id
    JOIN schools s ON s.id::text = cr.school_id::text
    JOIN admin_permissions ap ON ap.district_id::text = s.district_id::text
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role = 'district_admin'
  )
);
