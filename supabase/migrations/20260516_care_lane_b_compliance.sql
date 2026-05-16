-- Migration: CARE Lane B (compliance lane) support
-- Adds referral-source routing + Lane B intake fields to care_referrals,
-- and the get-to-consent + eligibility-outcome fields to care_cases.
--
-- Lane A = discussion lane (teacher/parent/staff concern -> CARE meetings, no clock).
-- Lane B = compliance lane (written eval request or private-school referral ->
--          timeline running). status = 'initial' is the compliance-lane marker;
--          no separate "lane" column is needed.

-- =============================================================
-- Section A: care_referrals -- referral source + Lane B intake
-- =============================================================

-- referral_source drives the intake form and the entry lane.
-- Added nullable first, backfilled, then made NOT NULL.
ALTER TABLE care_referrals ADD COLUMN referral_source TEXT;

-- Backfill: every existing referral predates this column and went through the
-- teacher-centric flow, so teacher_concern is the honest default.
UPDATE care_referrals SET referral_source = 'teacher_concern' WHERE referral_source IS NULL;

ALTER TABLE care_referrals
  ALTER COLUMN referral_source SET NOT NULL,
  ADD CONSTRAINT care_referrals_referral_source_check CHECK (referral_source IN (
    'teacher_concern',
    'parent_concern',
    'staff_concern',
    'parent_written_request',
    'private_school'
  ));

-- Lane B intake fields (remain NULL for Lane A referrals).
ALTER TABLE care_referrals ADD COLUMN request_received_date DATE;
ALTER TABLE care_referrals ADD COLUMN requested_by TEXT;
ALTER TABLE care_referrals ADD COLUMN private_school_name TEXT;

COMMENT ON COLUMN care_referrals.referral_source IS 'How the referral came in; drives intake form and entry lane (Lane A discussion vs Lane B compliance)';
COMMENT ON COLUMN care_referrals.request_received_date IS 'Lane B: date the written evaluation request / private-school referral was received -- start of the 15-day Assessment Plan clock';
COMMENT ON COLUMN care_referrals.requested_by IS 'Lane B: name/relationship of the person who made the written request (typically a parent/guardian)';
COMMENT ON COLUMN care_referrals.private_school_name IS 'Lane B: private school the student attends (referral_source = private_school)';

-- =============================================================
-- Section B: care_cases -- get-to-consent beat + eligibility outcome
-- =============================================================

-- "Get to consent" beat (precedes the existing ap_received_date).
-- ap_due_date defaults in-app to request_received_date + 15 days and is
-- user-editable; ap_due_date_note records any manual adjustment (e.g. breaks).
ALTER TABLE care_cases ADD COLUMN ap_sent_date DATE;
ALTER TABLE care_cases ADD COLUMN ap_due_date DATE;
ALTER TABLE care_cases ADD COLUMN ap_due_date_note TEXT;

-- iep_due_date already exists (= ap_received_date + 60, user-editable);
-- add its adjustment note for parity with ap_due_date.
ALTER TABLE care_cases ADD COLUMN iep_due_date_note TEXT;

-- Eligibility outcome -- the result of the compliance-lane process.
ALTER TABLE care_cases ADD COLUMN eligibility_meeting_date DATE;
ALTER TABLE care_cases ADD COLUMN eligibility_outcome TEXT
  CHECK (eligibility_outcome IN ('eligible', 'not_eligible', 'eligible_504_only'));
ALTER TABLE care_cases ADD COLUMN eligibility_category TEXT
  CHECK (eligibility_category IN (
    'autism',
    'deaf_blindness',
    'deafness',
    'emotional_disturbance',
    'hearing_impairment',
    'intellectual_disability',
    'multiple_disabilities',
    'orthopedic_impairment',
    'other_health_impairment',
    'specific_learning_disability',
    'speech_language_impairment',
    'traumatic_brain_injury',
    'visual_impairment'
  ));

COMMENT ON COLUMN care_cases.ap_sent_date IS 'Date the Assessment Plan was sent to the parent';
COMMENT ON COLUMN care_cases.ap_due_date IS 'Deadline to send the Assessment Plan (default: request_received_date + 15 days, user-editable)';
COMMENT ON COLUMN care_cases.ap_due_date_note IS 'Reason for any manual adjustment to ap_due_date (e.g. school break)';
COMMENT ON COLUMN care_cases.iep_due_date_note IS 'Reason for any manual adjustment to iep_due_date (e.g. school break)';
COMMENT ON COLUMN care_cases.eligibility_meeting_date IS 'Date of the eligibility determination meeting';
COMMENT ON COLUMN care_cases.eligibility_outcome IS 'Result of the eligibility determination';
COMMENT ON COLUMN care_cases.eligibility_category IS 'IDEA disability category when eligibility_outcome = eligible (one of the 13 federal categories)';

-- Note: compliance events (ap_sent, consent_received, eligibility_determined,
-- due_date_adjusted) are logged into the existing care_case_status_history
-- table -- its status column is free-text, so no schema change is required.
