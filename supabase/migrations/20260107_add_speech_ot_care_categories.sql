-- Add 'speech' and 'ot' to the care_referrals category constraint
ALTER TABLE care_referrals DROP CONSTRAINT IF EXISTS care_referrals_category_check;
ALTER TABLE care_referrals ADD CONSTRAINT care_referrals_category_check
  CHECK (category IN ('academic', 'behavioral', 'attendance', 'social-emotional', 'speech', 'ot', 'other'));
