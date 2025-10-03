-- Drop unused indexes to improve performance and reduce storage
-- These indexes have idx_scan = 0, meaning they have never been used
-- This migration will free up approximately 3+ MB of storage

-- Lessons table indexes (1.4 MB total)
DROP INDEX IF EXISTS idx_lessons_content;
DROP INDEX IF EXISTS idx_lessons_calendar;
DROP INDEX IF EXISTS idx_lessons_grade_levels;
DROP INDEX IF EXISTS idx_lessons_student_ids;
DROP INDEX IF EXISTS idx_lessons_provider_date;
DROP INDEX IF EXISTS idx_lessons_source;
DROP INDEX IF EXISTS idx_lessons_status;
DROP INDEX IF EXISTS idx_lessons_subject;
DROP INDEX IF EXISTS lessons_scheduled_unique;
DROP INDEX IF EXISTS lessons_unique_calendar_timeslot;

-- Schools table indexes (1 MB total)
DROP INDEX IF EXISTS idx_schools_district_name;
DROP INDEX IF EXISTS idx_schools_name;
DROP INDEX IF EXISTS idx_schools_district_id;
DROP INDEX IF EXISTS idx_schools_type;

-- Districts table indexes (168 KB total)
DROP INDEX IF EXISTS idx_districts_state_name;
DROP INDEX IF EXISTS idx_districts_name;
DROP INDEX IF EXISTS idx_districts_state_id;

-- Schedule sessions indexes (288 KB total)
-- Note: unique_session_per_date is a unique constraint, not droppable as index
DROP INDEX IF EXISTS idx_schedule_sessions_date;
DROP INDEX IF EXISTS idx_sessions_provider_school;
DROP INDEX IF EXISTS idx_sessions_times;
DROP INDEX IF EXISTS idx_schedule_time;
DROP INDEX IF EXISTS idx_schedule_student;
DROP INDEX IF EXISTS idx_sessions_provider_day;
DROP INDEX IF EXISTS idx_schedule_sessions_assigned_specialist;
DROP INDEX IF EXISTS idx_schedule_provider;
DROP INDEX IF EXISTS idx_schedule_sessions_delivered_by;
DROP INDEX IF EXISTS idx_schedule_sessions_delivery_assignment;
DROP INDEX IF EXISTS idx_schedule_sessions_manually_placed;
DROP INDEX IF EXISTS idx_schedule_sessions_sea_assignment;
DROP INDEX IF EXISTS idx_schedule_sessions_specialist_assignment;

-- Bell schedules indexes (152 KB total)
DROP INDEX IF EXISTS idx_bell_schedules_unique;
DROP INDEX IF EXISTS idx_bell_schedules_grade;
DROP INDEX IF EXISTS idx_bell_schedules_provider_day;
DROP INDEX IF EXISTS idx_bell_schedules_school_id;
DROP INDEX IF EXISTS idx_bell_schedules_content_hash;

-- Special activities indexes (112 KB total)
DROP INDEX IF EXISTS idx_special_activities_teacher;
DROP INDEX IF EXISTS idx_special_activities_unique;
DROP INDEX IF EXISTS idx_special_activities_provider_day;
DROP INDEX IF EXISTS idx_special_activities_school_id;
DROP INDEX IF EXISTS idx_special_activities_content_hash;

-- Exit tickets indexes (80 KB total)
DROP INDEX IF EXISTS idx_exit_tickets_created_at;
DROP INDEX IF EXISTS idx_exit_tickets_provider_id;
DROP INDEX IF EXISTS idx_exit_tickets_school_id;
DROP INDEX IF EXISTS idx_exit_tickets_student_id;

-- Students indexes (96 KB total)
DROP INDEX IF EXISTS idx_students_matching;
DROP INDEX IF EXISTS idx_students_normalized_district;
DROP INDEX IF EXISTS idx_students_provider;
DROP INDEX IF EXISTS idx_students_school_id;
DROP INDEX IF EXISTS idx_students_school_site;
DROP INDEX IF EXISTS idx_students_teacher_id;

-- Profiles indexes (128 KB total)
DROP INDEX IF EXISTS idx_profiles_district_id;
DROP INDEX IF EXISTS idx_profiles_normalized_district;
DROP INDEX IF EXISTS idx_profiles_school;
DROP INDEX IF EXISTS idx_profiles_school_district;
DROP INDEX IF EXISTS idx_profiles_school_id;
DROP INDEX IF EXISTS idx_profiles_school_sharing;
DROP INDEX IF EXISTS idx_profiles_shared_at_school;
DROP INDEX IF EXISTS idx_profiles_state_id;

-- Calendar events indexes (64 KB total)
DROP INDEX IF EXISTS idx_calendar_events_date;
DROP INDEX IF EXISTS idx_calendar_events_provider_date;
DROP INDEX IF EXISTS idx_calendar_events_provider_id;

-- Holidays indexes (48 KB total)
DROP INDEX IF EXISTS idx_holidays_school_id;
DROP INDEX IF EXISTS idx_holidays_unique_date_location;
DROP INDEX IF EXISTS idx_holidays_created_by;
DROP INDEX IF EXISTS idx_holidays_district_id;

-- Provider schools indexes (96 KB total)
DROP INDEX IF EXISTS idx_provider_schools_normalized_district;
DROP INDEX IF EXISTS idx_provider_schools_provider;
DROP INDEX IF EXISTS idx_provider_schools_provider_id;
DROP INDEX IF EXISTS idx_provider_schools_provider_school;
DROP INDEX IF EXISTS idx_provider_schools_school;
DROP INDEX IF EXISTS idx_provider_schools_school_id;

-- School hours indexes (32 KB total)
DROP INDEX IF EXISTS idx_school_hours_provider_school;
DROP INDEX IF EXISTS idx_school_hours_provider_school_day;

-- Schedule share requests indexes (48 KB total)
-- Note: unique_share_request is a unique constraint, not droppable as index
DROP INDEX IF EXISTS idx_schedule_share_requests_school_id;
DROP INDEX IF EXISTS idx_schedule_share_requests_sharer_id;

-- Teachers indexes (64 KB total)
DROP INDEX IF EXISTS idx_teachers_email;
DROP INDEX IF EXISTS idx_teachers_name;
DROP INDEX IF EXISTS idx_teachers_provider_id;
DROP INDEX IF EXISTS idx_teachers_school_id;

-- Subscriptions indexes (48 KB total)
DROP INDEX IF EXISTS idx_subscriptions_status;
DROP INDEX IF EXISTS idx_subscriptions_stripe_customer_id;
DROP INDEX IF EXISTS idx_subscriptions_user_id;

-- Worksheets indexes (32 KB total)
DROP INDEX IF EXISTS idx_worksheets_qr;
DROP INDEX IF EXISTS idx_worksheets_student;

-- Todos indexes (16 KB total)
DROP INDEX IF EXISTS idx_todos_created_at;

-- Analytics events indexes (40 KB total)
DROP INDEX IF EXISTS idx_analytics_events_created_at;
DROP INDEX IF EXISTS idx_analytics_events_worksheet_code;
DROP INDEX IF EXISTS idx_analytics_events_user_id;
DROP INDEX IF EXISTS idx_analytics_events_event_created;
DROP INDEX IF EXISTS idx_analytics_events_event;

-- Worksheet submissions indexes (16 KB total)
DROP INDEX IF EXISTS idx_submissions_worksheet;
DROP INDEX IF EXISTS idx_submissions_date;

-- Upload rate limits indexes (16 KB total)
DROP INDEX IF EXISTS idx_rate_limit_worksheet;
DROP INDEX IF EXISTS idx_rate_limit_ip;

-- Audit logs indexes (24 KB total)
DROP INDEX IF EXISTS idx_audit_logs_user_id;
DROP INDEX IF EXISTS idx_audit_logs_timestamp;
DROP INDEX IF EXISTS idx_audit_logs_action;

-- Student assessments indexes (16 KB total)
DROP INDEX IF EXISTS idx_student_assessments_date;
DROP INDEX IF EXISTS idx_student_assessments_student_id;

-- IEP goal progress indexes (8 KB total)
DROP INDEX IF EXISTS idx_goal_progress_student;

-- Lesson adjustment queue indexes (16 KB total)
DROP INDEX IF EXISTS idx_adjustment_queue_priority;
DROP INDEX IF EXISTS idx_adjustment_queue_student;

-- Lesson performance history indexes (8 KB total)
DROP INDEX IF EXISTS idx_lesson_performance_student;

-- Progress notifications indexes (16 KB total)
DROP INDEX IF EXISTS idx_progress_notifications_provider;
DROP INDEX IF EXISTS idx_progress_notifications_student;

-- Student performance metrics indexes (8 KB total)
DROP INDEX IF EXISTS idx_performance_metrics_student;

-- Subscription pauses indexes (8 KB total)
DROP INDEX IF EXISTS idx_subscription_pauses_subscription_id;

-- Referral relationships indexes (8 KB total)
DROP INDEX IF EXISTS idx_referral_relationships_status;
