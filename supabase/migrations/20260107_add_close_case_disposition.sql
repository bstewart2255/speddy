-- Add 'close_case' to the care_cases current_disposition constraint
ALTER TABLE care_cases DROP CONSTRAINT IF EXISTS care_cases_current_disposition_check;
ALTER TABLE care_cases ADD CONSTRAINT care_cases_current_disposition_check
  CHECK (current_disposition IN (
    'teacher_consult', 'wait_for_report_card', 'wait_for_assessment_data',
    'intervention', 'counseling_referral', 'schedule_sst', 'send_ap',
    'move_to_initials', 'close_case'
  ));
