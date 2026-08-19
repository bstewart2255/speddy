export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activated_school_years: {
        Row: {
          activated_at: string
          activated_by: string
          id: string
          school_id: string
          school_year: string
        }
        Insert: {
          activated_at?: string
          activated_by: string
          id?: string
          school_id: string
          school_year: string
        }
        Update: {
          activated_at?: string
          activated_by?: string
          id?: string
          school_id?: string
          school_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "activated_school_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_type_availability: {
        Row: {
          activity_type: string
          created_at: string | null
          friday: boolean
          friday_end_time: string | null
          friday_start_time: string | null
          id: string
          monday: boolean
          monday_end_time: string | null
          monday_start_time: string | null
          school_id: string
          school_year: string
          thursday: boolean
          thursday_end_time: string | null
          thursday_start_time: string | null
          tuesday: boolean
          tuesday_end_time: string | null
          tuesday_start_time: string | null
          updated_at: string | null
          wednesday: boolean
          wednesday_end_time: string | null
          wednesday_start_time: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          friday?: boolean
          friday_end_time?: string | null
          friday_start_time?: string | null
          id?: string
          monday?: boolean
          monday_end_time?: string | null
          monday_start_time?: string | null
          school_id: string
          school_year?: string
          thursday?: boolean
          thursday_end_time?: string | null
          thursday_start_time?: string | null
          tuesday?: boolean
          tuesday_end_time?: string | null
          tuesday_start_time?: string | null
          updated_at?: string | null
          wednesday?: boolean
          wednesday_end_time?: string | null
          wednesday_start_time?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          friday?: boolean
          friday_end_time?: string | null
          friday_start_time?: string | null
          id?: string
          monday?: boolean
          monday_end_time?: string | null
          monday_start_time?: string | null
          school_id?: string
          school_year?: string
          thursday?: boolean
          thursday_end_time?: string | null
          thursday_start_time?: string | null
          tuesday?: boolean
          tuesday_end_time?: string | null
          tuesday_start_time?: string | null
          updated_at?: string | null
          wednesday?: boolean
          wednesday_end_time?: string | null
          wednesday_start_time?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          admin_id: string
          district_id: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          role: string
          school_id: string | null
          state_id: string | null
        }
        Insert: {
          admin_id: string
          district_id?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: string
          school_id?: string | null
          state_id?: string | null
        }
        Update: {
          admin_id?: string
          district_id?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: string
          school_id?: string | null
          state_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      assessment_types: {
        Row: {
          category: string
          confidence_weight: number | null
          created_at: string | null
          data_schema: Json
          id: string
          interpretation_rules: Json
          name: string
          prompt_fragments: Json
          updated_at: string | null
        }
        Insert: {
          category: string
          confidence_weight?: number | null
          created_at?: string | null
          data_schema: Json
          id?: string
          interpretation_rules: Json
          name: string
          prompt_fragments: Json
          updated_at?: string | null
        }
        Update: {
          category?: string
          confidence_weight?: number | null
          created_at?: string | null
          data_schema?: Json
          id?: string
          interpretation_rules?: Json
          name?: string
          prompt_fragments?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          absence_reason: string | null
          created_at: string
          id: string
          marked_by: string | null
          present: boolean
          session_date: string
          session_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          absence_reason?: string | null
          created_at?: string
          id?: string
          marked_by?: string | null
          present?: boolean
          session_date: string
          session_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          absence_reason?: string | null
          created_at?: string
          id?: string
          marked_by?: string | null
          present?: boolean
          session_date?: string
          session_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cross_provider_visibility"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "schedule_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "shared_students"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          timestamp: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      backup_spe459_school_year_retag: {
        Row: {
          previous_school_year: string
          retagged_at: string
          row_id: string
          table_name: string
        }
        Insert: {
          previous_school_year: string
          retagged_at?: string
          row_id: string
          table_name: string
        }
        Update: {
          previous_school_year?: string
          retagged_at?: string
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      bell_schedules: {
        Row: {
          content_hash: string | null
          created_at: string | null
          created_by_id: string | null
          created_by_role: string | null
          day_of_week: number
          district_id: string | null
          end_time: string
          grade_level: string
          id: string
          period_name: string | null
          provider_id: string | null
          school_id: string | null
          school_site: string | null
          school_year: string
          start_time: string
          state_id: string | null
          updated_at: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_role?: string | null
          day_of_week: number
          district_id?: string | null
          end_time: string
          grade_level: string
          id?: string
          period_name?: string | null
          provider_id?: string | null
          school_id?: string | null
          school_site?: string | null
          school_year?: string
          start_time: string
          state_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_role?: string | null
          day_of_week?: number
          district_id?: string | null
          end_time?: string
          grade_level?: string
          id?: string
          period_name?: string | null
          provider_id?: string | null
          school_id?: string | null
          school_site?: string | null
          school_year?: string
          start_time?: string
          state_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bell_schedules_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bell_schedules_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bell_schedules_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bell_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bell_schedules_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token_encrypted: string | null
          created_at: string | null
          google_email: string | null
          id: string
          profile_id: string
          provider: string
          refresh_token_encrypted: string | null
          scopes: string[] | null
          status: string
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string | null
          google_email?: string | null
          id?: string
          profile_id: string
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string | null
          google_email?: string | null
          id?: string
          profile_id?: string
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          attendees: string[] | null
          created_at: string | null
          date: string
          description: string | null
          district_id: string | null
          end_time: string | null
          event_type: string | null
          id: string
          location: string | null
          provider_id: string
          school_district: string | null
          school_id: string | null
          school_site: string | null
          start_time: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          attendees?: string[] | null
          created_at?: string | null
          date: string
          description?: string | null
          district_id?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          location?: string | null
          provider_id: string
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          start_time?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          attendees?: string[] | null
          created_at?: string | null
          date?: string
          description?: string | null
          district_id?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          location?: string | null
          provider_id?: string
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      care_action_items: {
        Row: {
          assignee_id: string | null
          case_id: string
          completed_at: string | null
          created_at: string | null
          description: string
          due_date: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string | null
          description: string
          due_date?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_action_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_action_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "care_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      care_case_status_history: {
        Row: {
          case_id: string
          changed_by: string
          created_at: string
          id: string
          status: string
        }
        Insert: {
          case_id: string
          changed_by: string
          created_at?: string
          id?: string
          status: string
        }
        Update: {
          case_id?: string
          changed_by?: string
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_case_status_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "care_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_case_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_cases: {
        Row: {
          academic_testing_completed: boolean | null
          academic_testing_date: string | null
          ap_due_date: string | null
          ap_due_date_note: string | null
          ap_received_date: string | null
          ap_sent_date: string | null
          assigned_to: string | null
          created_at: string | null
          current_disposition: string | null
          eligibility_category: string | null
          eligibility_meeting_date: string | null
          eligibility_outcome: string | null
          follow_up_date: string | null
          id: string
          iep_due_date: string | null
          iep_due_date_note: string | null
          ot_testing_completed: boolean | null
          ot_testing_date: string | null
          ot_testing_needed: boolean | null
          psych_testing_completed: boolean | null
          psych_testing_date: string | null
          referral_id: string
          speech_testing_completed: boolean | null
          speech_testing_date: string | null
          speech_testing_needed: boolean | null
          sst_notes_link: string | null
          sst_scheduled_date: string | null
          updated_at: string | null
        }
        Insert: {
          academic_testing_completed?: boolean | null
          academic_testing_date?: string | null
          ap_due_date?: string | null
          ap_due_date_note?: string | null
          ap_received_date?: string | null
          ap_sent_date?: string | null
          assigned_to?: string | null
          created_at?: string | null
          current_disposition?: string | null
          eligibility_category?: string | null
          eligibility_meeting_date?: string | null
          eligibility_outcome?: string | null
          follow_up_date?: string | null
          id?: string
          iep_due_date?: string | null
          iep_due_date_note?: string | null
          ot_testing_completed?: boolean | null
          ot_testing_date?: string | null
          ot_testing_needed?: boolean | null
          psych_testing_completed?: boolean | null
          psych_testing_date?: string | null
          referral_id: string
          speech_testing_completed?: boolean | null
          speech_testing_date?: string | null
          speech_testing_needed?: boolean | null
          sst_notes_link?: string | null
          sst_scheduled_date?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_testing_completed?: boolean | null
          academic_testing_date?: string | null
          ap_due_date?: string | null
          ap_due_date_note?: string | null
          ap_received_date?: string | null
          ap_sent_date?: string | null
          assigned_to?: string | null
          created_at?: string | null
          current_disposition?: string | null
          eligibility_category?: string | null
          eligibility_meeting_date?: string | null
          eligibility_outcome?: string | null
          follow_up_date?: string | null
          id?: string
          iep_due_date?: string | null
          iep_due_date_note?: string | null
          ot_testing_completed?: boolean | null
          ot_testing_date?: string | null
          ot_testing_needed?: boolean | null
          psych_testing_completed?: boolean | null
          psych_testing_date?: string | null
          referral_id?: string
          speech_testing_completed?: boolean | null
          speech_testing_date?: string | null
          speech_testing_needed?: boolean | null
          sst_notes_link?: string | null
          sst_scheduled_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "care_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      care_meeting_notes: {
        Row: {
          case_id: string
          created_at: string | null
          created_by: string
          id: string
          note_text: string
        }
        Insert: {
          case_id: string
          created_at?: string | null
          created_by: string
          id?: string
          note_text: string
        }
        Update: {
          case_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_meeting_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "care_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_meeting_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_referrals: {
        Row: {
          category: string | null
          created_at: string | null
          deleted_at: string | null
          district_id: string | null
          grade: string
          id: string
          private_school_name: string | null
          referral_reason: string
          referral_source: string
          referring_user_id: string
          request_received_date: string | null
          requested_by: string | null
          school_id: string | null
          state_id: string | null
          status: string
          student_name: string
          submitted_at: string
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          deleted_at?: string | null
          district_id?: string | null
          grade: string
          id?: string
          private_school_name?: string | null
          referral_reason: string
          referral_source: string
          referring_user_id: string
          request_received_date?: string | null
          requested_by?: string | null
          school_id?: string | null
          state_id?: string | null
          status?: string
          student_name: string
          submitted_at?: string
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          deleted_at?: string | null
          district_id?: string | null
          grade?: string
          id?: string
          private_school_name?: string | null
          referral_reason?: string
          referral_source?: string
          referring_user_id?: string
          request_received_date?: string | null
          requested_by?: string | null
          school_id?: string | null
          state_id?: string | null
          status?: string
          student_name?: string
          submitted_at?: string
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_referrals_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_referrals_referring_user_id_fkey"
            columns: ["referring_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_referrals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_referrals_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_referrals_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          accommodations: string[]
          case_manager: string | null
          created_at: string
          date_of_birth: string | null
          district_id: string | null
          district_student_id: string | null
          first_name: string | null
          grade_level: string
          id: string
          initials: string
          last_name: string | null
          school_id: string | null
          state_id: string | null
          upcoming_iep_date: string | null
          upcoming_triennial_date: string | null
          updated_at: string
        }
        Insert: {
          accommodations?: string[]
          case_manager?: string | null
          created_at?: string
          date_of_birth?: string | null
          district_id?: string | null
          district_student_id?: string | null
          first_name?: string | null
          grade_level: string
          id?: string
          initials: string
          last_name?: string | null
          school_id?: string | null
          state_id?: string | null
          upcoming_iep_date?: string | null
          upcoming_triennial_date?: string | null
          updated_at?: string
        }
        Update: {
          accommodations?: string[]
          case_manager?: string | null
          created_at?: string
          date_of_birth?: string | null
          district_id?: string | null
          district_student_id?: string | null
          first_name?: string | null
          grade_level?: string
          id?: string
          initials?: string
          last_name?: string | null
          school_id?: string | null
          state_id?: string | null
          upcoming_iep_date?: string | null
          upcoming_triennial_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          added_at: string
          conversation_id: string
          profile_id: string
        }
        Insert: {
          added_at?: string
          conversation_id: string
          profile_id: string
        }
        Update: {
          added_at?: string
          conversation_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_read_state: {
        Row: {
          conversation_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_read_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_read_state_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          dm_key: string | null
          id: string
          school_id: string | null
          student_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dm_key?: string | null
          id?: string
          school_id?: string | null
          student_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dm_key?: string | null
          id?: string
          school_id?: string | null
          student_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      curriculum_tracking: {
        Row: {
          created_at: string | null
          current_lesson: number
          curriculum_level: string
          curriculum_type: string
          id: string
          prompt_answered: boolean
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_lesson: number
          curriculum_level: string
          curriculum_type: string
          id?: string
          prompt_answered?: boolean
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_lesson?: number
          curriculum_level?: string
          curriculum_type?: string
          id?: string
          prompt_answered?: boolean
          session_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_curriculum_tracking_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cross_provider_visibility"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "fk_curriculum_tracking_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "schedule_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_curriculum_tracking_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "shared_students"
            referencedColumns: ["session_id"]
          },
        ]
      }
      debug_signup_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: number
          message: string | null
          metadata: Json | null
          trigger_name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          message?: string | null
          metadata?: Json | null
          trigger_name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          message?: string | null
          metadata?: Json | null
          trigger_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      district_curriculums: {
        Row: {
          created_at: string
          created_by: string | null
          curriculum_id: string
          district_id: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          curriculum_id: string
          district_id: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          curriculum_id?: string
          district_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "district_curriculums_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "district_curriculums_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      district_sis_connections: {
        Row: {
          aeries_certificate_encrypted: string | null
          base_url: string | null
          created_at: string
          created_by: string | null
          credential_hint: string | null
          district_id: string
          dpa_cleared_at: string | null
          id: string
          last_test_result: Json | null
          last_tested_at: string | null
          oneroster_client_id_encrypted: string | null
          oneroster_client_secret_encrypted: string | null
          sis_type: string
          status: string
          token_url: string | null
          updated_at: string
        }
        Insert: {
          aeries_certificate_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          credential_hint?: string | null
          district_id: string
          dpa_cleared_at?: string | null
          id?: string
          last_test_result?: Json | null
          last_tested_at?: string | null
          oneroster_client_id_encrypted?: string | null
          oneroster_client_secret_encrypted?: string | null
          sis_type: string
          status?: string
          token_url?: string | null
          updated_at?: string
        }
        Update: {
          aeries_certificate_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          credential_hint?: string | null
          district_id?: string
          dpa_cleared_at?: string | null
          id?: string
          last_test_result?: Json | null
          last_tested_at?: string | null
          oneroster_client_id_encrypted?: string | null
          oneroster_client_secret_encrypted?: string | null
          sis_type?: string
          status?: string
          token_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "district_sis_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "district_sis_connections_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          city: string | null
          county: string | null
          created_at: string | null
          district_type: string | null
          id: string
          mailing_address: string | null
          name: string
          phone: string | null
          state_id: string
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          county?: string | null
          created_at?: string | null
          district_type?: string | null
          id: string
          mailing_address?: string | null
          name: string
          phone?: string | null
          state_id: string
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          county?: string | null
          created_at?: string | null
          district_type?: string | null
          id?: string
          mailing_address?: string | null
          name?: string
          phone?: string | null
          state_id?: string
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "districts_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string
          document_type: string
          documentable_id: string
          documentable_type: string
          file_path: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          original_filename: string | null
          session_date: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by: string
          document_type: string
          documentable_id: string
          documentable_type: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          session_date?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string
          document_type?: string
          documentable_id?: string
          documentable_type?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          session_date?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          district_id: string | null
          id: string
          name: string | null
          reason: string | null
          school_district: string | null
          school_id: string | null
          school_site: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          district_id?: string | null
          id?: string
          name?: string | null
          reason?: string | null
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          district_id?: string | null
          id?: string
          name?: string | null
          reason?: string | null
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iep_meeting_attendees: {
        Row: {
          attendee_role: string
          created_at: string | null
          display_name: string | null
          id: string
          is_required: boolean
          meeting_id: string
          parent_contact_id: string | null
          profile_id: string | null
          rsvp_source: string | null
          rsvp_status: string
          updated_at: string | null
        }
        Insert: {
          attendee_role: string
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_required?: boolean
          meeting_id: string
          parent_contact_id?: string | null
          profile_id?: string | null
          rsvp_source?: string | null
          rsvp_status?: string
          updated_at?: string | null
        }
        Update: {
          attendee_role?: string
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_required?: boolean
          meeting_id?: string
          parent_contact_id?: string | null
          profile_id?: string | null
          rsvp_source?: string | null
          rsvp_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iep_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "iep_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iep_meeting_attendees_parent_contact_id_fkey"
            columns: ["parent_contact_id"]
            isOneToOne: false
            referencedRelation: "student_parent_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iep_meeting_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iep_meetings: {
        Row: {
          confirmation_log: string | null
          created_at: string | null
          deleted_at: string | null
          due_date: string | null
          google_event_id: string | null
          id: string
          location: string | null
          meeting_type: string
          organizer_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          school_id: string | null
          status: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          confirmation_log?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_date?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_type?: string
          organizer_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          school_id?: string | null
          status?: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          confirmation_log?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_date?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          meeting_type?: string
          organizer_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          school_id?: string | null
          status?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iep_meetings_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iep_meetings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iep_meetings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iep_meetings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      instruction_schedules: {
        Row: {
          created_at: string | null
          created_by_id: string
          day_of_week: number
          end_time: string
          id: string
          school_id: string
          school_year: string
          start_time: string
          subject: string
          teacher_id: string
          teacher_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_id: string
          day_of_week: number
          end_time: string
          id?: string
          school_id: string
          school_year: string
          start_time: string
          subject: string
          teacher_id: string
          teacher_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          school_id?: string
          school_year?: string
          start_time?: string
          subject?: string
          teacher_id?: string
          teacher_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instruction_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instruction_schedules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_signups: {
        Row: {
          audience: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          ai_model: string | null
          ai_prompt: string | null
          ai_raw_response: Json | null
          completion_tokens: number | null
          content: Json
          created_at: string
          district_id: string | null
          duration_minutes: number | null
          generation_metadata: Json | null
          generation_version: string | null
          grade_levels: string[] | null
          group_id: string | null
          group_ref: string | null
          id: string
          lesson_date: string
          lesson_source: Database["public"]["Enums"]["lesson_source"]
          lesson_status: Database["public"]["Enums"]["lesson_status"]
          metadata: Json | null
          notes: string | null
          prompt_tokens: number | null
          provider_id: string
          school_id: string | null
          session_ids: string[] | null
          state_id: string | null
          student_details: Json | null
          student_ids: string[] | null
          subject: string | null
          time_slot: string | null
          title: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_prompt?: string | null
          ai_raw_response?: Json | null
          completion_tokens?: number | null
          content?: Json
          created_at?: string
          district_id?: string | null
          duration_minutes?: number | null
          generation_metadata?: Json | null
          generation_version?: string | null
          grade_levels?: string[] | null
          group_id?: string | null
          group_ref?: string | null
          id?: string
          lesson_date: string
          lesson_source?: Database["public"]["Enums"]["lesson_source"]
          lesson_status?: Database["public"]["Enums"]["lesson_status"]
          metadata?: Json | null
          notes?: string | null
          prompt_tokens?: number | null
          provider_id: string
          school_id?: string | null
          session_ids?: string[] | null
          state_id?: string | null
          student_details?: Json | null
          student_ids?: string[] | null
          subject?: string | null
          time_slot?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_prompt?: string | null
          ai_raw_response?: Json | null
          completion_tokens?: number | null
          content?: Json
          created_at?: string
          district_id?: string | null
          duration_minutes?: number | null
          generation_metadata?: Json | null
          generation_version?: string | null
          grade_levels?: string[] | null
          group_id?: string | null
          group_ref?: string | null
          id?: string
          lesson_date?: string
          lesson_source?: Database["public"]["Enums"]["lesson_source"]
          lesson_status?: Database["public"]["Enums"]["lesson_status"]
          metadata?: Json | null
          notes?: string | null
          prompt_tokens?: number | null
          provider_id?: string
          school_id?: string | null
          session_ids?: string[] | null
          state_id?: string | null
          student_details?: Json | null
          student_ids?: string[] | null
          subject?: string | null
          time_slot?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_group_ref_fkey"
            columns: ["group_ref"]
            isOneToOne: false
            referencedRelation: "session_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      mainstreaming_blocks: {
        Row: {
          child_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          label: string | null
          provider_id: string
          school_id: string
          school_year: string
          start_time: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          label?: string | null
          provider_id: string
          school_id: string
          school_year?: string
          start_time: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          label?: string | null
          provider_id?: string
          school_id?: string
          school_year?: string
          start_time?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mainstreaming_blocks_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mainstreaming_blocks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mainstreaming_blocks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mainstreaming_blocks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mainstreaming_blocks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "mainstreaming_blocks_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_goal_progress: {
        Row: {
          created_at: string | null
          district_id: string | null
          id: string
          iep_goal_index: number
          notes: string | null
          observation_date: string
          provider_id: string
          school_id: string | null
          score: number
          source: string | null
          state_id: string | null
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          district_id?: string | null
          id?: string
          iep_goal_index: number
          notes?: string | null
          observation_date: string
          provider_id: string
          school_id?: string | null
          score: number
          source?: string | null
          state_id?: string | null
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          district_id?: string | null
          id?: string
          iep_goal_index?: number
          notes?: string | null
          observation_date?: string
          provider_id?: string
          school_id?: string | null
          score?: number
          source?: string | null
          state_id?: string | null
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_goal_progress_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_goal_progress_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_goal_progress_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_goal_progress_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_goal_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_goal_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      material_constraints: {
        Row: {
          active: boolean | null
          constraint_type: string
          created_at: string | null
          description: string
          id: string
          validation_regex: string | null
        }
        Insert: {
          active?: boolean | null
          constraint_type: string
          created_at?: string | null
          description: string
          id?: string
          validation_regex?: string | null
        }
        Update: {
          active?: boolean | null
          constraint_type?: string
          created_at?: string | null
          description?: string
          id?: string
          validation_regex?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_confirmation_tokens: {
        Row: {
          contact_id: string
          created_at: string | null
          expires_at: string
          id: string
          meeting_id: string
          responded_at: string | null
          response: string | null
          token_hash: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          meeting_id: string
          responded_at?: string | null
          response?: string | null
          token_hash: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          meeting_id?: string
          responded_at?: string | null
          response?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_confirmation_tokens_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "student_parent_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_confirmation_tokens_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "iep_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          daily_schedule_email_enabled: boolean
          district_domain: string
          district_id: string | null
          email: string
          full_name: string
          id: string
          is_speddy_admin: boolean | null
          multi_school_banner_dismissed: boolean
          must_change_password: boolean | null
          password_reset_requested_at: string | null
          role: string
          school_district: string
          school_district_original: string | null
          school_id: string | null
          school_site: string
          school_site_original: string | null
          selected_curriculums: string[] | null
          setup_banner_dismissed: boolean
          state: string | null
          state_id: string | null
          updated_at: string | null
          works_at_multiple_schools: boolean | null
        }
        Insert: {
          created_at?: string | null
          daily_schedule_email_enabled?: boolean
          district_domain: string
          district_id?: string | null
          email: string
          full_name: string
          id: string
          is_speddy_admin?: boolean | null
          multi_school_banner_dismissed?: boolean
          must_change_password?: boolean | null
          password_reset_requested_at?: string | null
          role: string
          school_district: string
          school_district_original?: string | null
          school_id?: string | null
          school_site: string
          school_site_original?: string | null
          selected_curriculums?: string[] | null
          setup_banner_dismissed?: boolean
          state?: string | null
          state_id?: string | null
          updated_at?: string | null
          works_at_multiple_schools?: boolean | null
        }
        Update: {
          created_at?: string | null
          daily_schedule_email_enabled?: boolean
          district_domain?: string
          district_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_speddy_admin?: boolean | null
          multi_school_banner_dismissed?: boolean
          must_change_password?: boolean | null
          password_reset_requested_at?: string | null
          role?: string
          school_district?: string
          school_district_original?: string | null
          school_id?: string | null
          school_site?: string
          school_site_original?: string | null
          selected_curriculums?: string[] | null
          setup_banner_dismissed?: boolean
          state?: string | null
          state_id?: string | null
          updated_at?: string | null
          works_at_multiple_schools?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          id: string
          provider_id: string | null
          school_district: string
          school_site: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          id?: string
          provider_id?: string | null
          school_district: string
          school_site: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          id?: string
          provider_id?: string | null
          school_district?: string
          school_site?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_availability_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_availability_provider_id_school_district_school_s_fkey"
            columns: ["provider_id", "school_district", "school_site"]
            isOneToOne: false
            referencedRelation: "provider_schools"
            referencedColumns: ["provider_id", "school_district", "school_site"]
          },
        ]
      }
      provider_schools: {
        Row: {
          created_at: string | null
          district_id: string | null
          id: string
          is_primary: boolean | null
          provider_id: string | null
          school_district: string
          school_id: string | null
          school_site: string
          state_id: string | null
        }
        Insert: {
          created_at?: string | null
          district_id?: string | null
          id?: string
          is_primary?: boolean | null
          provider_id?: string | null
          school_district: string
          school_id?: string | null
          school_site: string
          state_id?: string | null
        }
        Update: {
          created_at?: string | null
          district_id?: string | null
          id?: string
          is_primary?: boolean | null
          provider_id?: string | null
          school_district?: string
          school_id?: string | null
          school_site?: string
          state_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_schools_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_schools_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_schools_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_activity_pairs: {
        Row: {
          activity_type_a: string
          activity_type_b: string
          created_at: string | null
          id: string
          school_id: string
          school_year: string
          updated_at: string | null
        }
        Insert: {
          activity_type_a: string
          activity_type_b: string
          created_at?: string | null
          id?: string
          school_id: string
          school_year?: string
          updated_at?: string | null
        }
        Update: {
          activity_type_a?: string
          activity_type_b?: string
          created_at?: string | null
          id?: string
          school_id?: string
          school_year?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rotation_activity_pairs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_group_members: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          group_id: string
          id: string
          school_year: string
          start_time: string
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          group_id: string
          id?: string
          school_year?: string
          start_time: string
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          group_id?: string
          id?: string
          school_year?: string
          start_time?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "rotation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_group_members_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_groups: {
        Row: {
          created_at: string | null
          id: string
          name: string
          pair_id: string
          school_year: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          pair_id: string
          school_year?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          pair_id?: string
          school_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_groups_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "rotation_activity_pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_week_assignments: {
        Row: {
          activity_type: string
          created_at: string | null
          group_id: string
          id: string
          pair_id: string
          school_year: string
          week_start_date: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          group_id: string
          id?: string
          pair_id: string
          school_year?: string
          week_start_date: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          group_id?: string
          id?: string
          pair_id?: string
          school_year?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_week_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "rotation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_week_assignments_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "rotation_activity_pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_sessions: {
        Row: {
          assigned_to_sea_id: string | null
          assigned_to_specialist_id: string | null
          completed_at: string | null
          completed_by: string | null
          conflict_reason: string | null
          created_at: string | null
          day_of_week: number | null
          deleted_at: string | null
          delivered_by: string | null
          end_time: string | null
          group_color: number | null
          group_id: string | null
          group_name: string | null
          group_ref: string | null
          has_conflict: boolean | null
          id: string
          is_completed: boolean
          is_template: boolean | null
          manually_placed: boolean | null
          outside_schedule_conflict: boolean
          provider_id: string | null
          service_type: string
          session_date: string | null
          session_notes: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["session_status"]
          student_absent: boolean
          student_id: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to_sea_id?: string | null
          assigned_to_specialist_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          conflict_reason?: string | null
          created_at?: string | null
          day_of_week?: number | null
          deleted_at?: string | null
          delivered_by?: string | null
          end_time?: string | null
          group_color?: number | null
          group_id?: string | null
          group_name?: string | null
          group_ref?: string | null
          has_conflict?: boolean | null
          id?: string
          is_completed?: boolean
          is_template?: boolean | null
          manually_placed?: boolean | null
          outside_schedule_conflict?: boolean
          provider_id?: string | null
          service_type: string
          session_date?: string | null
          session_notes?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          student_absent?: boolean
          student_id?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to_sea_id?: string | null
          assigned_to_specialist_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          conflict_reason?: string | null
          created_at?: string | null
          day_of_week?: number | null
          deleted_at?: string | null
          delivered_by?: string | null
          end_time?: string | null
          group_color?: number | null
          group_id?: string | null
          group_name?: string | null
          group_ref?: string | null
          has_conflict?: boolean | null
          id?: string
          is_completed?: boolean
          is_template?: boolean | null
          manually_placed?: boolean | null
          outside_schedule_conflict?: boolean
          provider_id?: string | null
          service_type?: string
          session_date?: string | null
          session_notes?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          student_absent?: boolean
          student_id?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sessions_assigned_to_sea_id_fkey"
            columns: ["assigned_to_sea_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_assigned_to_specialist_id_fkey"
            columns: ["assigned_to_specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_group_ref_fkey"
            columns: ["group_ref"]
            isOneToOne: false
            referencedRelation: "session_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "schedule_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cross_provider_visibility"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "schedule_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shared_students"
            referencedColumns: ["session_id"]
          },
        ]
      }
      school_hours: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          grade_level: string
          id: string
          provider_id: string
          school_id: string | null
          school_site: string | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          grade_level: string
          id?: string
          provider_id: string
          school_id?: string | null
          school_site?: string | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          grade_level?: string
          id?: string
          provider_id?: string
          school_id?: string | null
          school_site?: string | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      school_year_config: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          school_id: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          school_id: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          school_id?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_year_config_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          city: string | null
          county: string | null
          created_at: string | null
          district_id: string
          enrollment: number | null
          grade_span_high: string | null
          grade_span_low: string | null
          id: string
          latitude: number | null
          longitude: number | null
          mailing_address: string | null
          name: string
          phone: string | null
          school_type: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          county?: string | null
          created_at?: string | null
          district_id: string
          enrollment?: number | null
          grade_span_high?: string | null
          grade_span_low?: string | null
          id: string
          latitude?: number | null
          longitude?: number | null
          mailing_address?: string | null
          name: string
          phone?: string | null
          school_type?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          county?: string | null
          created_at?: string | null
          district_id?: string
          enrollment?: number | null
          grade_span_high?: string | null
          grade_span_low?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mailing_address?: string | null
          name?: string
          phone?: string | null
          school_type?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      session_groups: {
        Row: {
          assigned_to_sea_id: string | null
          assigned_to_specialist_id: string | null
          color: number | null
          created_at: string
          delivered_by: string
          id: string
          name: string | null
          provider_id: string
          retired_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_to_sea_id?: string | null
          assigned_to_specialist_id?: string | null
          color?: number | null
          created_at?: string
          delivered_by?: string
          id?: string
          name?: string | null
          provider_id: string
          retired_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to_sea_id?: string | null
          assigned_to_specialist_id?: string | null
          color?: number | null
          created_at?: string
          delivered_by?: string
          id?: string
          name?: string | null
          provider_id?: string
          retired_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_groups_assigned_to_sea_id_fkey"
            columns: ["assigned_to_sea_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_groups_assigned_to_specialist_id_fkey"
            columns: ["assigned_to_specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_groups_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_logs: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          ip_address: string | null
          provider: string | null
          role: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          ip_address?: string | null
          provider?: string | null
          role?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          ip_address?: string | null
          provider?: string | null
          role?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_meeting_rules: {
        Row: {
          allowed_windows: Json
          blackout_ranges: Json
          created_at: string | null
          external_iep_calendar_id: string | null
          id: string
          max_meetings_per_day: number | null
          rooms: string[] | null
          school_id: string
          updated_at: string | null
        }
        Insert: {
          allowed_windows?: Json
          blackout_ranges?: Json
          created_at?: string | null
          external_iep_calendar_id?: string | null
          id?: string
          max_meetings_per_day?: number | null
          rooms?: string[] | null
          school_id: string
          updated_at?: string | null
        }
        Update: {
          allowed_windows?: Json
          blackout_ranges?: Json
          created_at?: string | null
          external_iep_calendar_id?: string | null
          id?: string
          max_meetings_per_day?: number | null
          rooms?: string[] | null
          school_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_meeting_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      special_activities: {
        Row: {
          activity_name: string | null
          content_hash: string | null
          created_at: string | null
          created_by_id: string | null
          created_by_role: string | null
          day_of_week: number
          deleted_at: string | null
          district_id: string | null
          end_time: string
          id: string
          provider_id: string | null
          school_id: string | null
          school_site: string | null
          school_year: string
          start_time: string
          teacher_id: string | null
          teacher_name: string
          updated_at: string | null
        }
        Insert: {
          activity_name?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_role?: string | null
          day_of_week: number
          deleted_at?: string | null
          district_id?: string | null
          end_time: string
          id?: string
          provider_id?: string | null
          school_id?: string | null
          school_site?: string | null
          school_year?: string
          start_time: string
          teacher_id?: string | null
          teacher_name: string
          updated_at?: string | null
        }
        Update: {
          activity_name?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_role?: string | null
          day_of_week?: number
          deleted_at?: string | null
          district_id?: string | null
          end_time?: string
          id?: string
          provider_id?: string | null
          school_id?: string | null
          school_site?: string | null
          school_year?: string
          start_time?: string
          teacher_id?: string | null
          teacher_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "special_activities_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_activities_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_activities_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string | null
          first_name: string
          id: string
          last_name: string
          program: string | null
          role: string
          room_number: string | null
          school_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          first_name: string
          id?: string
          last_name: string
          program?: string | null
          role: string
          room_number?: string | null
          school_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
          program?: string | null
          role?: string
          room_number?: string | null
          school_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_hours: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          staff_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          staff_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_teacher_assignments: {
        Row: {
          created_at: string | null
          id: string
          provider_id: string | null
          staff_id: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          provider_id?: string | null
          staff_id: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          provider_id?: string | null
          staff_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_teacher_assignments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_teacher_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      states: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
          name: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      student_assessments: {
        Row: {
          assessment_date: string
          assessment_type: string
          created_at: string
          data: Json
          id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_date: string
          assessment_type: string
          created_at?: string
          data?: Json
          id?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          assessment_type?: string
          created_at?: string
          data?: Json
          id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_blocked_times: {
        Row: {
          child_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          label: string
          provider_id: string
          school_id: string
          school_year: string
          start_time: string
          student_id: string
          updated_at: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          label: string
          provider_id: string
          school_id: string
          school_year?: string
          start_time: string
          student_id: string
          updated_at?: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          label?: string
          provider_id?: string
          school_id?: string
          school_year?: string
          start_time?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_blocked_times_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_blocked_times_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_blocked_times_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_blocked_times_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_blocked_times_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_details: {
        Row: {
          accommodations: string[] | null
          created_at: string | null
          date_of_birth: string | null
          district_id: string | null
          first_name: string | null
          goals_iep_date: string | null
          id: string
          iep_goals: string[] | null
          last_exit_ticket_goal_index: number | null
          last_name: string | null
          student_id: string | null
          upcoming_iep_date: string | null
          upcoming_triennial_date: string | null
          updated_at: string | null
        }
        Insert: {
          accommodations?: string[] | null
          created_at?: string | null
          date_of_birth?: string | null
          district_id?: string | null
          first_name?: string | null
          goals_iep_date?: string | null
          id?: string
          iep_goals?: string[] | null
          last_exit_ticket_goal_index?: number | null
          last_name?: string | null
          student_id?: string | null
          upcoming_iep_date?: string | null
          upcoming_triennial_date?: string | null
          updated_at?: string | null
        }
        Update: {
          accommodations?: string[] | null
          created_at?: string | null
          date_of_birth?: string | null
          district_id?: string | null
          first_name?: string | null
          goals_iep_date?: string | null
          id?: string
          iep_goals?: string[] | null
          last_exit_ticket_goal_index?: number | null
          last_name?: string | null
          student_id?: string | null
          upcoming_iep_date?: string | null
          upcoming_triennial_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_details_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_details_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_parent_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          preferred_channel: string | null
          preferred_language: string | null
          relationship: string | null
          school_id: string | null
          student_id: string
          updated_at: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          preferred_channel?: string | null
          preferred_language?: string | null
          relationship?: string | null
          school_id?: string | null
          student_id: string
          updated_at?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          preferred_channel?: string | null
          preferred_language?: string | null
          relationship?: string | null
          school_id?: string | null
          student_id?: string
          updated_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_parent_contacts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_parent_contacts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_parent_contacts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_service_times: {
        Row: {
          child_id: string | null
          created_at: string
          day_of_week: number
          id: string
          note: string | null
          period_name: string
          provider_id: string
          school_id: string
          school_year: string
          setting: string
          student_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          note?: string | null
          period_name: string
          provider_id: string
          school_id: string
          school_year?: string
          setting: string
          student_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          note?: string | null
          period_name?: string
          provider_id?: string
          school_id?: string
          school_year?: string
          setting?: string
          student_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_service_times_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_service_times_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_service_times_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_service_times_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_service_times_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_service_times_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      student_teachers: {
        Row: {
          child_id: string
          created_at: string
          id: string
          period: string | null
          subject: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          period?: string | null
          subject?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          period?: string | null
          subject?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_teachers_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          child_id: string | null
          created_at: string | null
          district_id: string | null
          district_student_id: string | null
          grade_level: string
          id: string
          initials: string
          minutes_per_session: number | null
          provider_id: string | null
          school_district: string | null
          school_id: string | null
          school_site: string | null
          sessions_per_week: number | null
          state_id: string | null
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string | null
        }
        Insert: {
          child_id?: string | null
          created_at?: string | null
          district_id?: string | null
          district_student_id?: string | null
          grade_level: string
          id?: string
          initials: string
          minutes_per_session?: number | null
          provider_id?: string | null
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          sessions_per_week?: number | null
          state_id?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string | null
        }
        Update: {
          child_id?: string | null
          created_at?: string | null
          district_id?: string | null
          district_student_id?: string | null
          grade_level?: string
          id?: string
          initials?: string
          minutes_per_session?: number | null
          provider_id?: string | null
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          sessions_per_week?: number | null
          state_id?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability_prefs: {
        Row: {
          created_at: string | null
          id: string
          meeting_time_preference: string | null
          prep_description: string | null
          prep_end: string | null
          prep_start: string | null
          profile_id: string
          school_id: string | null
          school_year: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          meeting_time_preference?: string | null
          prep_description?: string | null
          prep_end?: string | null
          prep_start?: string | null
          profile_id: string
          school_id?: string | null
          school_year: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          meeting_time_preference?: string | null
          prep_description?: string | null
          prep_end?: string | null
          prep_start?: string | null
          profile_id?: string
          school_id?: string | null
          school_year?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_availability_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_availability_prefs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          account_id: string | null
          classroom_number: string | null
          created_at: string | null
          created_by_admin: boolean | null
          email: string | null
          first_name: string | null
          grade_level: string | null
          id: string
          last_name: string | null
          phone_number: string | null
          school_id: string | null
          school_site: string | null
          sis_id: string | null
          sis_source: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          classroom_number?: string | null
          created_at?: string | null
          created_by_admin?: boolean | null
          email?: string | null
          first_name?: string | null
          grade_level?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          school_id?: string | null
          school_site?: string | null
          sis_id?: string | null
          sis_source?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          classroom_number?: string | null
          created_at?: string | null
          created_by_admin?: boolean | null
          email?: string | null
          first_name?: string | null
          grade_level?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          school_id?: string | null
          school_site?: string | null
          sis_id?: string | null
          sis_source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          id: string
          name: string
          school_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          school_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          school_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      todos: {
        Row: {
          completed: boolean | null
          created_at: string
          district_id: string | null
          due_date: string | null
          id: string
          school_id: string | null
          state_id: string | null
          task: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          district_id?: string | null
          due_date?: string | null
          id?: string
          school_id?: string | null
          state_id?: string | null
          task: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          district_id?: string | null
          due_date?: string | null
          id?: string
          school_id?: string | null
          state_id?: string | null
          task?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      user_site_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number
          id: string
          site_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          id?: string
          site_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          id?: string
          site_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_site_schedules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "provider_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      yard_duty_assignments: {
        Row: {
          assignee_name: string
          created_at: string | null
          created_by_id: string
          day_of_week: number
          end_time: string
          id: string
          period_name: string
          provider_id: string | null
          school_id: string
          school_year: string
          staff_id: string | null
          start_time: string
          teacher_id: string | null
          updated_at: string | null
          zone_name: string | null
        }
        Insert: {
          assignee_name: string
          created_at?: string | null
          created_by_id: string
          day_of_week: number
          end_time: string
          id?: string
          period_name: string
          provider_id?: string | null
          school_id: string
          school_year: string
          staff_id?: string | null
          start_time: string
          teacher_id?: string | null
          updated_at?: string | null
          zone_name?: string | null
        }
        Update: {
          assignee_name?: string
          created_at?: string | null
          created_by_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          period_name?: string
          provider_id?: string | null
          school_id?: string
          school_year?: string
          staff_id?: string | null
          start_time?: string
          teacher_id?: string | null
          updated_at?: string | null
          zone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yard_duty_assignments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yard_duty_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yard_duty_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yard_duty_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      yard_duty_zones: {
        Row: {
          created_at: string | null
          id: string
          school_id: string
          zone_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          school_id: string
          zone_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          school_id?: string
          zone_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "yard_duty_zones_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cross_provider_visibility: {
        Row: {
          day_of_week: number | null
          email: string | null
          end_time: string | null
          grade_level: string | null
          provider_id: string | null
          school_site: string | null
          service_type: string | null
          session_id: string | null
          start_time: string | null
          student_id: string | null
          student_initials: string | null
          teacher_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sessions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      shared_students: {
        Row: {
          day_of_week: number | null
          email: string | null
          end_time: string | null
          grade_level: string | null
          provider_id: string | null
          school_site: string | null
          service_type: string | null
          session_id: string | null
          start_time: string | null
          student_id: string | null
          student_initials: string | null
          teacher_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sessions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      unmatched_student_teachers: {
        Row: {
          created_at: string | null
          grade_level: string | null
          initials: string | null
          school_district: string | null
          school_id: string | null
          school_site: string | null
          student_id: string | null
          teacher_name: string | null
        }
        Insert: {
          created_at?: string | null
          grade_level?: string | null
          initials?: string | null
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          student_id?: string | null
          teacher_name?: string | null
        }
        Update: {
          created_at?: string | null
          grade_level?: string | null
          initials?: string | null
          school_district?: string | null
          school_id?: string | null
          school_site?: string | null
          student_id?: string | null
          teacher_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _groups_v2_retire_if_empty: {
        Args: { p_group_ref: string }
        Returns: undefined
      }
      _groups_v2_stamp: {
        Args: {
          p_color: number
          p_group_ref: string
          p_name: string
          p_template_id: string
        }
        Returns: undefined
      }
      can_access_conversation: {
        Args: { p_conversation_id: string; p_uid: string }
        Returns: boolean
      }
      can_assign_sea_to_session:
        | { Args: { provider_id: string; sea_id: string }; Returns: boolean }
        | {
            Args: { provider_id: string; sea_id: string; session_id?: string }
            Returns: boolean
          }
      can_assign_specialist_to_session:
        | {
            Args: { provider_id: string; specialist_id: string }
            Returns: boolean
          }
        | {
            Args: {
              current_school_id: string
              provider_id: string
              specialist_id: string
            }
            Returns: boolean
          }
      can_view_team_member: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      chat_is_student_participant: {
        Args: { p_student_id: string; p_uid: string }
        Returns: boolean
      }
      chat_shares_site: { Args: { p_a: string; p_b: string }; Returns: boolean }
      copy_schedule_to_year: {
        Args: { p_from_year: string; p_school_id: string; p_to_year: string }
        Returns: Json
      }
      create_profile_for_new_user: {
        Args: { user_email: string; user_id: string; user_metadata: Json }
        Returns: undefined
      }
      current_school_year: { Args: never; Returns: string }
      delete_chat_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      find_all_team_members_multi_school: {
        Args: { current_user_id: string; target_school_id: string }
        Returns: {
          created_at: string
          district_id: string
          email: string
          full_name: string
          id: string
          role: string
          school_id: string
          state_id: string
        }[]
      }
      find_all_team_members_v2: {
        Args: { current_user_id: string }
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          district_id: string
          email: string
          grade_level: string
          id: string
          matching_method: string
          role: string
          school_district: string
          school_id: string
          school_site: string
          state_id: string
          subject: string
        }[]
      }
      find_matching_provider_roles: {
        Args: { p_student_id: string }
        Returns: string[]
      }
      find_matching_provider_sessions: {
        Args: { p_student_id: string }
        Returns: {
          day_of_week: number
          end_time: string
          provider_role: string
          start_time: string
        }[]
      }
      find_matching_provider_sessions_batch: {
        Args: { p_student_ids: string[] }
        Returns: {
          day_of_week: number
          end_time: string
          provider_role: string
          source_student_id: string
          start_time: string
        }[]
      }
      find_school_ids_by_names: {
        Args: {
          p_school_district_name: string
          p_school_site_name: string
          p_state_name: string
        }
        Returns: {
          confidence_score: number
          matched_district_id: string
          matched_school_id: string
          matched_state_id: string
        }[]
      }
      find_shared_child_candidates: {
        Args: { p_rows: Json; p_school_id: string }
        Returns: Json
      }
      find_team_members: {
        Args: {
          p_exclude_user_id?: string
          p_school_district: string
          p_school_site: string
        }
        Returns: {
          full_name: string
          id: string
          role: string
          school_district: string
          school_site: string
        }[]
      }
      find_team_members_multi_school: {
        Args: {
          p_exclude_user_id?: string
          p_school_district: string
          p_school_site: string
        }
        Returns: {
          full_name: string
          id: string
          role: string
          school_district: string
          school_site: string
        }[]
      }
      generate_referral_code: { Args: never; Returns: string }
      get_available_specialists:
        | {
            Args: { current_user_id: string }
            Returns: {
              full_name: string
              id: string
              role: string
            }[]
          }
        | {
            Args: { current_school_id: string; current_user_id: string }
            Returns: {
              full_name: string
              id: string
              role: string
            }[]
          }
        | {
            Args: { current_user_id: string; filter_school_id?: string }
            Returns: {
              full_name: string
              id: string
              role: string
            }[]
          }
      get_care_assignable_users: {
        Args: { p_school_id: string }
        Returns: {
          full_name: string
          id: string
          role: string
          user_type: string
        }[]
      }
      get_dm_eligible_people: {
        Args: { p_school_id: string }
        Returns: {
          full_name: string
          id: string
          role: string
        }[]
      }
      get_my_chat_students: {
        Args: { p_school_id?: string }
        Returns: {
          grade_level: string
          id: string
          initials: string
          school_id: string
        }[]
      }
      get_my_conversations: {
        Args: { p_school_id?: string }
        Returns: {
          created_at: string
          id: string
          kind: string
          last_message_at: string
          last_message_preview: string
          other_id: string
          other_name: string
          other_role: string
          school_id: string
          student_grade: string
          student_id: string
          student_initials: string
          unread: boolean
        }[]
      }
      get_my_school_ids: {
        Args: never
        Returns: {
          school_id: string
        }[]
      }
      get_providers_at_my_schools: {
        Args: never
        Returns: {
          provider_id: string
        }[]
      }
      get_school_migration_stats: {
        Args: never
        Returns: {
          migrated_users: number
          migration_percentage: number
          total_users: number
          unmigrated_users: number
        }[]
      }
      get_school_seas: {
        Args: {
          p_school_district?: string
          p_school_id?: string
          p_school_site?: string
        }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_school_site_admins: {
        Args: { p_school_id: string }
        Returns: {
          admin_id: string
          email: string
          full_name: string
        }[]
      }
      get_sea_assigned_sessions: {
        Args: { sea_user_id: string }
        Returns: {
          completed_at: string
          day_of_week: number
          end_time: string
          service_type: string
          session_id: string
          session_notes: string
          start_time: string
          student_grade: string
          student_id: string
          student_initials: string
        }[]
      }
      get_sea_students: {
        Args: {
          p_school_district?: string
          p_school_id?: string
          p_school_site?: string
        }
        Returns: {
          created_at: string
          first_name: string
          grade_level: string
          id: string
          iep_goals: string[]
          initials: string
          last_name: string
          minutes_per_session: number
          provider_id: string
          school_id: string
          sessions_per_week: number
          teacher_id: string
          teacher_name: string
          updated_at: string
        }[]
      }
      get_sign_in_logs: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          ip_address: string
          provider: string
          role: string
          session_duration_minutes: number
          user_agent: string
          user_id: string
        }[]
      }
      get_special_activity_teacher_name: {
        Args: { activity_teacher_id: string; activity_teacher_name: string }
        Returns: string
      }
      get_student_chat_participants: {
        Args: { p_student_id: string }
        Returns: string[]
      }
      get_student_district_id: {
        Args: { p_student_id: string }
        Returns: string
      }
      get_student_school_id: { Args: { p_student_id: string }; Returns: string }
      get_teacher_student_ids: { Args: { user_id: string }; Returns: string[] }
      get_user_schools: {
        Args: { user_id: string }
        Returns: {
          district_id: string
          district_name: string
          is_primary: boolean
          school_id: string
          school_name: string
          state_id: string
        }[]
      }
      groups_v2_assign: {
        Args: { p_assignee: string; p_delivered_by: string; p_group_id: string }
        Returns: undefined
      }
      groups_v2_form: { Args: { p_session_ids: string[] }; Returns: string }
      groups_v2_join: {
        Args: { p_group_id: string; p_session_id: string }
        Returns: undefined
      }
      groups_v2_leave: { Args: { p_session_id: string }; Returns: undefined }
      groups_v2_merge: {
        Args: { p_from_group_id: string; p_into_group_id: string }
        Returns: undefined
      }
      groups_v2_rename: {
        Args: { p_color: number; p_group_id: string; p_name: string }
        Returns: undefined
      }
      groups_v2_split: {
        Args: { p_group_id: string; p_session_ids: string[] }
        Returns: string
      }
      import_child_candidates: {
        Args: { p_rows: Json; p_school_id: string }
        Returns: {
          child_id: string
          idx: number
          reason: string
        }[]
      }
      increment_referral_uses: {
        Args: { referrer_user_id: string }
        Returns: undefined
      }
      is_chat_eligible: { Args: { p_uid: string }; Returns: boolean }
      is_teacher_for_student: {
        Args: { p_account_id: string; p_student_id: string }
        Returns: boolean
      }
      is_teacher_of_student: {
        Args: { student_uuid: string }
        Returns: boolean
      }
      log_conversation_open: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_password_reset: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      matching_provider_student_ids: {
        Args: { p_student_id: string }
        Returns: string[]
      }
      merge_iep_goals: {
        Args: { p_entries: Json; p_provider_id: string }
        Returns: {
          error_message: string
          matched_student_id: string
          ord: number
          success: boolean
        }[]
      }
      merge_iep_goals_array: {
        Args: { p_existing: string[]; p_incoming: string[] }
        Returns: string[]
      }
      norm_student_name: {
        Args: { p_first: string; p_last: string }
        Returns: string
      }
      normalize_district_name: {
        Args: { district_name: string }
        Returns: string
      }
      normalize_existing_school_data: {
        Args: never
        Returns: {
          records_updated: number
          table_name: string
        }[]
      }
      open_direct_conversation: {
        Args: { p_other_id: string }
        Returns: string
      }
      open_student_conversation: {
        Args: { p_student_id: string }
        Returns: string
      }
      recalculate_session_end_time: {
        Args: { p_minutes_per_session: number; p_start_time: string }
        Returns: string
      }
      topup_session_instances: {
        Args: { p_weeks_ahead?: number }
        Returns: {
          instances_created: number
          templates_processed: number
        }[]
      }
      upsert_bell_schedule:
        | {
            Args: {
              p_content_hash: string
              p_day_of_week: number
              p_end_time: string
              p_grade_level: string
              p_period_name: string
              p_provider_id: string
              p_school_id: string
              p_school_site: string
              p_start_time: string
            }
            Returns: {
              action: string
              id: string
            }[]
          }
        | {
            Args: {
              p_content_hash: string
              p_day_of_week: number
              p_end_time: string
              p_grade_level: string
              p_period_name: string
              p_provider_id: string
              p_school_id: string
              p_school_site: string
              p_start_time: string
            }
            Returns: {
              action: string
              id: string
            }[]
          }
      upsert_special_activity:
        | {
            Args: {
              p_activity_name: string
              p_content_hash: string
              p_day_of_week: number
              p_end_time: string
              p_provider_id: string
              p_school_id: string
              p_school_site: string
              p_start_time: string
              p_teacher_name: string
            }
            Returns: {
              action: string
              id: string
            }[]
          }
        | {
            Args: {
              p_activity_name: string
              p_content_hash: string
              p_day_of_week: number
              p_end_time: string
              p_provider_id: string
              p_school_id: string
              p_school_site: string
              p_start_time: string
              p_teacher_name: string
            }
            Returns: {
              action: string
              id: string
            }[]
          }
      upsert_students_atomic: {
        Args: { p_provider_id: string; p_students: Json }
        Returns: Json
      }
      user_accessible_school_ids: {
        Args: never
        Returns: {
          school_id: string
        }[]
      }
    }
    Enums: {
      lesson_source: "ai_generated" | "ai_enhanced" | "manual" | "imported"
      lesson_status: "draft" | "published" | "archived"
      session_status: "active" | "conflict" | "needs_attention"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lesson_source: ["ai_generated", "ai_enhanced", "manual", "imported"],
      lesson_status: ["draft", "published", "archived"],
      session_status: ["active", "conflict", "needs_attention"],
    },
  },
} as const
