-- Migration: Add initial assessment tracking fields to care_cases
-- These fields track assessment progress when a case is in the 'initial' stage

ALTER TABLE care_cases
  ADD COLUMN ap_received_date DATE,
  ADD COLUMN iep_due_date DATE,
  ADD COLUMN academic_testing_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN academic_testing_date DATE,
  ADD COLUMN speech_testing_needed BOOLEAN DEFAULT FALSE,
  ADD COLUMN speech_testing_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN speech_testing_date DATE,
  ADD COLUMN psych_testing_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN psych_testing_date DATE,
  ADD COLUMN ot_testing_needed BOOLEAN DEFAULT FALSE,
  ADD COLUMN ot_testing_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN ot_testing_date DATE;

-- Add comment for documentation
COMMENT ON COLUMN care_cases.ap_received_date IS 'Date the Assessment Plan was received';
COMMENT ON COLUMN care_cases.iep_due_date IS 'Due date for the initial IEP meeting (60 days from AP)';
COMMENT ON COLUMN care_cases.academic_testing_completed IS 'Whether academic testing has been completed';
COMMENT ON COLUMN care_cases.academic_testing_date IS 'Date academic testing was completed';
COMMENT ON COLUMN care_cases.speech_testing_needed IS 'Whether speech testing is needed for this case';
COMMENT ON COLUMN care_cases.speech_testing_completed IS 'Whether speech testing has been completed';
COMMENT ON COLUMN care_cases.speech_testing_date IS 'Date speech testing was completed';
COMMENT ON COLUMN care_cases.psych_testing_completed IS 'Whether psych testing has been completed';
COMMENT ON COLUMN care_cases.psych_testing_date IS 'Date psych testing was completed';
COMMENT ON COLUMN care_cases.ot_testing_needed IS 'Whether OT testing is needed for this case';
COMMENT ON COLUMN care_cases.ot_testing_completed IS 'Whether OT testing has been completed';
COMMENT ON COLUMN care_cases.ot_testing_date IS 'Date OT testing was completed';
