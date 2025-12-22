-- Add teacher fields to care_referrals
-- The teacher is the student's classroom teacher (not the person making the referral)

ALTER TABLE care_referrals
ADD COLUMN teacher_id UUID REFERENCES teachers(id),
ADD COLUMN teacher_name TEXT;

-- Create index for teacher lookups
CREATE INDEX idx_care_referrals_teacher_id ON care_referrals(teacher_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN care_referrals.teacher_id IS 'The student''s classroom teacher (from teachers table)';
COMMENT ON COLUMN care_referrals.teacher_name IS 'Denormalized teacher name for display';
