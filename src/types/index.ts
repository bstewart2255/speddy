/**
 * Common type exports for Supabase database tables
 * Re-exports table types from the generated database types file
 */

import type { Database } from './database';

// Table row types (what you get back from SELECT queries)
export type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
export type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
export type SchoolHour = Database['public']['Tables']['school_hours']['Row'];
export type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
export type Student = Database['public']['Tables']['students']['Row'];
export type StudentDetails = Database['public']['Tables']['student_details']['Row'];
export type Teacher = Database['public']['Tables']['teachers']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type AdminPermission = Database['public']['Tables']['admin_permissions']['Row'];
export type School = Database['public']['Tables']['schools']['Row'];
export type District = Database['public']['Tables']['districts']['Row'];
export type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
export type Staff = Database['public']['Tables']['staff']['Row'];
export type StaffHours = Database['public']['Tables']['staff_hours']['Row'];
export type YardDutyAssignment = Database['public']['Tables']['yard_duty_assignments']['Row'];
export type InstructionSchedule = Database['public']['Tables']['instruction_schedules']['Row'];

// CARE module types
export type CareReferral = Database['public']['Tables']['care_referrals']['Row'];
export type CareCase = Database['public']['Tables']['care_cases']['Row'];
export type CareMeetingNote = Database['public']['Tables']['care_meeting_notes']['Row'];
export type CareActionItem = Database['public']['Tables']['care_action_items']['Row'];

// IEP meeting scheduling types
export type IepMeeting = Database['public']['Tables']['iep_meetings']['Row'];
export type IepMeetingAttendee = Database['public']['Tables']['iep_meeting_attendees']['Row'];
export type StudentParentContact = Database['public']['Tables']['student_parent_contacts']['Row'];
export type ParentConfirmationToken = Database['public']['Tables']['parent_confirmation_tokens']['Row'];
export type CalendarConnection = Database['public']['Tables']['calendar_connections']['Row'];
export type SiteMeetingRules = Database['public']['Tables']['site_meeting_rules']['Row'];
export type TeacherAvailabilityPref = Database['public']['Tables']['teacher_availability_prefs']['Row'];

// Table insert types (for INSERT operations)
export type BellScheduleInsert = Database['public']['Tables']['bell_schedules']['Insert'];
export type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];
export type SchoolHourInsert = Database['public']['Tables']['school_hours']['Insert'];
export type SpecialActivityInsert = Database['public']['Tables']['special_activities']['Insert'];
export type StudentInsert = Database['public']['Tables']['students']['Insert'];
export type StudentDetailsInsert = Database['public']['Tables']['student_details']['Insert'];
export type TeacherInsert = Database['public']['Tables']['teachers']['Insert'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type AdminPermissionInsert = Database['public']['Tables']['admin_permissions']['Insert'];
export type IepMeetingInsert = Database['public']['Tables']['iep_meetings']['Insert'];
export type IepMeetingAttendeeInsert = Database['public']['Tables']['iep_meeting_attendees']['Insert'];
export type StudentParentContactInsert = Database['public']['Tables']['student_parent_contacts']['Insert'];
export type ParentConfirmationTokenInsert = Database['public']['Tables']['parent_confirmation_tokens']['Insert'];
export type CalendarConnectionInsert = Database['public']['Tables']['calendar_connections']['Insert'];
export type SiteMeetingRulesInsert = Database['public']['Tables']['site_meeting_rules']['Insert'];
export type TeacherAvailabilityPrefInsert = Database['public']['Tables']['teacher_availability_prefs']['Insert'];

// Table update types (for UPDATE operations)
export type BellScheduleUpdate = Database['public']['Tables']['bell_schedules']['Update'];
export type ScheduleSessionUpdate = Database['public']['Tables']['schedule_sessions']['Update'];
export type SchoolHourUpdate = Database['public']['Tables']['school_hours']['Update'];
export type SpecialActivityUpdate = Database['public']['Tables']['special_activities']['Update'];
export type StudentUpdate = Database['public']['Tables']['students']['Update'];
export type StudentDetailsUpdate = Database['public']['Tables']['student_details']['Update'];
export type TeacherUpdate = Database['public']['Tables']['teachers']['Update'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type AdminPermissionUpdate = Database['public']['Tables']['admin_permissions']['Update'];

// Re-export Database type
export type { Database };
