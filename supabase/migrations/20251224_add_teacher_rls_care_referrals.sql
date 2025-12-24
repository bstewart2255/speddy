-- =====================================================
-- Issue #507: Add RLS policies for teacher-level CARE referral filtering
-- 
-- Security Gap: Teachers could bypass UI restrictions to view all school referrals
-- Fix: Teachers can only see referrals for their students or ones they submitted
-- Non-teacher roles retain existing school-level access
-- =====================================================

-- Update SELECT policy to add teacher-level filtering
DROP POLICY IF EXISTS "care_referrals_select" ON care_referrals;
CREATE POLICY "care_referrals_select" ON care_referrals
  FOR SELECT TO authenticated
  USING (
    -- Path 1: Non-teacher roles get school-level access (existing behavior)
    (
      (SELECT role FROM profiles WHERE id = (SELECT auth.uid())) != 'teacher'
      AND
      school_id::text IN (
        SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
        UNION
        SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
      )
    )
    OR
    -- Path 2: Teachers can only see referrals for their students or ones they submitted
    (
      (SELECT role FROM profiles WHERE id = (SELECT auth.uid())) = 'teacher'
      AND
      (
        -- Referrals for their students
        teacher_id IN (SELECT id FROM teachers WHERE account_id = (SELECT auth.uid()))
        OR
        -- Referrals they personally submitted
        referring_user_id = (SELECT auth.uid())
      )
    )
  );

-- Update UPDATE policy - teachers can only update referrals for their students
DROP POLICY IF EXISTS "care_referrals_update" ON care_referrals;
CREATE POLICY "care_referrals_update" ON care_referrals
  FOR UPDATE TO authenticated
  USING (
    -- Path 1: Non-teacher roles get school-level access
    (
      (SELECT role FROM profiles WHERE id = (SELECT auth.uid())) != 'teacher'
      AND
      school_id::text IN (
        SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
        UNION
        SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
      )
    )
    OR
    -- Path 2: Teachers can update referrals for their students or ones they submitted
    (
      (SELECT role FROM profiles WHERE id = (SELECT auth.uid())) = 'teacher'
      AND
      (
        teacher_id IN (SELECT id FROM teachers WHERE account_id = (SELECT auth.uid()))
        OR
        referring_user_id = (SELECT auth.uid())
      )
    )
  );

-- DELETE policy - teachers should not delete referrals (only admins/providers)
-- Keep existing school-level policy but exclude teachers
DROP POLICY IF EXISTS "care_referrals_delete" ON care_referrals;
CREATE POLICY "care_referrals_delete" ON care_referrals
  FOR DELETE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = (SELECT auth.uid())) != 'teacher'
    AND
    school_id::text IN (
      SELECT profiles.school_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT provider_schools.school_id FROM provider_schools WHERE provider_schools.provider_id = (SELECT auth.uid())
    )
  );

-- INSERT policy remains unchanged - teachers can still submit referrals
-- (already requires referring_user_id = auth.uid() and school-level access)
