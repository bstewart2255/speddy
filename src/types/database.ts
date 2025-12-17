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
      analytics_events: {
        Row: {
          created_at: string | null
          device_type: string | null
          error_code: string | null
          error_message: string | null
          event: string
          file_size: number | null
          id: string
          ip_address: unknown
          metadata: Json | null
          method: string | null
          processing_time: number | null
          upload_source: string | null
          user_agent: string | null
          user_id: string | null
          worksheet_code: string | null
        }
        Insert: {
          created_at?: string | null
          device_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event: string
          file_size?: number | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          method?: string | null
          processing_time?: number | null
          upload_source?: string | null
          user_agent?: string | null
          user_id?: string | null
          worksheet_code?: string | null
        }
        Update: {
          created_at?: string | null
          device_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event?: string
          file_size?: number | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          method?: string | null
          processing_time?: number | null
          upload_source?: string | null
          user_agent?: string | null
          user_id?: string | null
          worksheet_code?: string | null
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
      curriculum_tracking: {
        Row: {
          created_at: string | null
          current_lesson: number
          curriculum_level: string
          curriculum_type: string
          id: string
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_lesson: number
          curriculum_level: string
          curriculum_type: string
          id?: string
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_lesson?: number
          curriculum_level?: string
          curriculum_type?: string
          id?: string
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
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      exit_ticket_results: {
        Row: {
          created_at: string | null
          exit_ticket_id: string
          graded_at: string
          graded_by: string
          id: string
          iep_goal_index: number
          iep_goal_text: string
          notes: string | null
          problem_index: number
          status: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          exit_ticket_id: string
          graded_at?: string
          graded_by: string
          id?: string
          iep_goal_index: number
          iep_goal_text: string
          notes?: string | null
          problem_index: number
          status: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          exit_ticket_id?: string
          graded_at?: string
          graded_by?: string
          id?: string
          iep_goal_index?: number
          iep_goal_text?: string
          notes?: string | null
          problem_index?: number
          status?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exit_ticket_results_exit_ticket_id_fkey"
            columns: ["exit_ticket_id"]
            isOneToOne: false
            referencedRelation: "exit_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_ticket_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_ticket_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      exit_tickets: {
        Row: {
          completed_at: string | null
          completion_data: Json | null
          content: Json
          created_at: string | null
          discarded_at: string | null
          district_id: string | null
          id: string
          iep_goal_index: number
          iep_goal_text: string
          provider_id: string | null
          school_id: string | null
          state_id: string | null
          student_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completion_data?: Json | null
          content?: Json
          created_at?: string | null
          discarded_at?: string | null
          district_id?: string | null
          id?: string
          iep_goal_index: number
          iep_goal_text: string
          provider_id?: string | null
          school_id?: string | null
          state_id?: string | null
          student_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completion_data?: Json | null
          content?: Json
          created_at?: string | null
          discarded_at?: string | null
          district_id?: string | null
          id?: string
          iep_goal_index?: number
          iep_goal_text?: string
          provider_id?: string | null
          school_id?: string | null
          state_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exit_tickets_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_tickets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_tickets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_tickets_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_tickets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_tickets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
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
      iep_goal_progress: {
        Row: {
          created_at: string | null
          current_performance: number | null
          id: string
          iep_goal: string
          last_assessed: string | null
          student_id: string | null
          target_metric: Json
          trend: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_performance?: number | null
          id?: string
          iep_goal: string
          last_assessed?: string | null
          student_id?: string | null
          target_metric: Json
          trend?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_performance?: number | null
          id?: string
          iep_goal?: string
          last_assessed?: string | null
          student_id?: string | null
          target_metric?: Json
          trend?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iep_goal_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iep_goal_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      lesson_adjustment_queue: {
        Row: {
          adjustment_details: Json
          adjustment_type: string
          created_at: string | null
          id: string
          priority: number | null
          processed: boolean | null
          processed_at: string | null
          student_id: string
          subject: string
          worksheet_submission_id: string | null
        }
        Insert: {
          adjustment_details: Json
          adjustment_type: string
          created_at?: string | null
          id?: string
          priority?: number | null
          processed?: boolean | null
          processed_at?: string | null
          student_id: string
          subject: string
          worksheet_submission_id?: string | null
        }
        Update: {
          adjustment_details?: Json
          adjustment_type?: string
          created_at?: string | null
          id?: string
          priority?: number | null
          processed?: boolean | null
          processed_at?: string | null
          student_id?: string
          subject?: string
          worksheet_submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_adjustment_queue_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_adjustment_queue_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lesson_adjustment_queue_worksheet_submission_id_fkey"
            columns: ["worksheet_submission_id"]
            isOneToOne: false
            referencedRelation: "worksheet_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_performance_history: {
        Row: {
          accuracy_percentage: number | null
          completion_time: number | null
          created_at: string | null
          differentiated_lesson_id: string | null
          engagement_level: string | null
          id: string
          student_id: string | null
          teacher_notes: string | null
        }
        Insert: {
          accuracy_percentage?: number | null
          completion_time?: number | null
          created_at?: string | null
          differentiated_lesson_id?: string | null
          engagement_level?: string | null
          id?: string
          student_id?: string | null
          teacher_notes?: string | null
        }
        Update: {
          accuracy_percentage?: number | null
          completion_time?: number | null
          created_at?: string | null
          differentiated_lesson_id?: string | null
          engagement_level?: string | null
          id?: string
          student_id?: string | null
          teacher_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_performance_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_performance_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
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
      profiles: {
        Row: {
          created_at: string | null
          district_domain: string
          district_id: string | null
          email: string
          full_name: string
          id: string
          is_speddy_admin: boolean | null
          role: string
          school_district: string
          school_district_original: string | null
          school_id: string | null
          school_site: string
          school_site_original: string | null
          selected_curriculums: string[] | null
          shared_at_school: boolean | null
          state: string | null
          state_id: string | null
          supervising_provider_id: string | null
          updated_at: string | null
          works_at_multiple_schools: boolean | null
        }
        Insert: {
          created_at?: string | null
          district_domain: string
          district_id?: string | null
          email: string
          full_name: string
          id: string
          is_speddy_admin?: boolean | null
          role: string
          school_district: string
          school_district_original?: string | null
          school_id?: string | null
          school_site: string
          school_site_original?: string | null
          selected_curriculums?: string[] | null
          shared_at_school?: boolean | null
          state?: string | null
          state_id?: string | null
          supervising_provider_id?: string | null
          updated_at?: string | null
          works_at_multiple_schools?: boolean | null
        }
        Update: {
          created_at?: string | null
          district_domain?: string
          district_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_speddy_admin?: boolean | null
          role?: string
          school_district?: string
          school_district_original?: string | null
          school_id?: string | null
          school_site?: string
          school_site_original?: string | null
          selected_curriculums?: string[] | null
          shared_at_school?: boolean | null
          state?: string | null
          state_id?: string | null
          supervising_provider_id?: string | null
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
          {
            foreignKeyName: "profiles_supervising_provider_id_fkey"
            columns: ["supervising_provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_check_results: {
        Row: {
          created_at: string | null
          graded_at: string | null
          graded_by: string
          id: string
          iep_goal_index: number
          notes: string | null
          progress_check_id: string
          question_index: number
          status: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          graded_at?: string | null
          graded_by: string
          id?: string
          iep_goal_index: number
          notes?: string | null
          progress_check_id: string
          question_index: number
          status: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          graded_at?: string | null
          graded_by?: string
          id?: string
          iep_goal_index?: number
          notes?: string | null
          progress_check_id?: string
          question_index?: number
          status?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_check_results_progress_check_id_fkey"
            columns: ["progress_check_id"]
            isOneToOne: false
            referencedRelation: "progress_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_check_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_check_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      progress_checks: {
        Row: {
          completed_at: string | null
          content: Json
          created_at: string | null
          discarded_at: string | null
          district_id: string | null
          id: string
          provider_id: string
          school_id: string | null
          state_id: string | null
          student_id: string
        }
        Insert: {
          completed_at?: string | null
          content: Json
          created_at?: string | null
          discarded_at?: string | null
          district_id?: string | null
          id?: string
          provider_id: string
          school_id?: string | null
          state_id?: string | null
          student_id: string
        }
        Update: {
          completed_at?: string | null
          content?: Json
          created_at?: string | null
          discarded_at?: string | null
          district_id?: string | null
          id?: string
          provider_id?: string
          school_id?: string | null
          state_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_checks_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_checks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_checks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_checks_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_checks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_checks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      progress_notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          message: string
          notification_type: string
          provider_id: string
          read: boolean | null
          student_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message: string
          notification_type: string
          provider_id: string
          read?: boolean | null
          student_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message?: string
          notification_type?: string
          provider_id?: string
          read?: boolean | null
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_notifications_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
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
      saved_worksheets: {
        Row: {
          created_at: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          provider_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          provider_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          provider_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_worksheets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          delivered_by: string | null
          end_time: string | null
          group_color: number | null
          group_id: string | null
          group_name: string | null
          has_conflict: boolean | null
          id: string
          is_completed: boolean
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
          delivered_by?: string | null
          end_time?: string | null
          group_color?: number | null
          group_id?: string | null
          group_name?: string | null
          has_conflict?: boolean | null
          id?: string
          is_completed?: boolean
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
          delivered_by?: string | null
          end_time?: string | null
          group_color?: number | null
          group_id?: string | null
          group_name?: string | null
          has_conflict?: boolean | null
          id?: string
          is_completed?: boolean
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
      schedule_share_requests: {
        Row: {
          created_at: string | null
          id: string
          school_id: string
          sharer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          school_id: string
          sharer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          school_id?: string
          sharer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_share_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_share_requests_sharer_id_fkey"
            columns: ["sharer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      student_details: {
        Row: {
          accommodations: string[] | null
          created_at: string | null
          date_of_birth: string | null
          district_id: string | null
          first_name: string | null
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
      student_performance_metrics: {
        Row: {
          accuracy_trend: Json | null
          confidence_score: number | null
          created_at: string | null
          current_level: number | null
          error_patterns: Json | null
          id: string
          last_assessment_date: string | null
          student_id: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          accuracy_trend?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          current_level?: number | null
          error_patterns?: Json | null
          id?: string
          last_assessment_date?: string | null
          student_id: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          accuracy_trend?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          current_level?: number | null
          error_patterns?: Json | null
          id?: string
          last_assessment_date?: string | null
          student_id?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_performance_metrics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_performance_metrics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string | null
          district_id: string | null
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
          created_at?: string | null
          district_id?: string | null
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
          created_at?: string | null
          district_id?: string | null
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
      teachers: {
        Row: {
          account_id: string | null
          classroom_number: string | null
          created_at: string | null
          created_by_admin: boolean | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone_number: string | null
          school_id: string | null
          school_site: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          classroom_number?: string | null
          created_at?: string | null
          created_by_admin?: boolean | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          school_id?: string | null
          school_site?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          classroom_number?: string | null
          created_at?: string | null
          created_by_admin?: boolean | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          school_id?: string | null
          school_site?: string | null
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
      upload_rate_limits: {
        Row: {
          id: string
          ip_address: string
          uploaded_at: string | null
          worksheet_code: string
        }
        Insert: {
          id?: string
          ip_address: string
          uploaded_at?: string | null
          worksheet_code: string
        }
        Update: {
          id?: string
          ip_address?: string
          uploaded_at?: string | null
          worksheet_code?: string
        }
        Relationships: []
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
      worksheet_submissions: {
        Row: {
          accuracy_percentage: number | null
          ai_analysis: string | null
          id: string
          image_url: string | null
          skills_assessed: Json | null
          student_responses: Json | null
          submitted_at: string | null
          submitted_by: string | null
          worksheet_id: string | null
        }
        Insert: {
          accuracy_percentage?: number | null
          ai_analysis?: string | null
          id?: string
          image_url?: string | null
          skills_assessed?: Json | null
          student_responses?: Json | null
          submitted_at?: string | null
          submitted_by?: string | null
          worksheet_id?: string | null
        }
        Update: {
          accuracy_percentage?: number | null
          ai_analysis?: string | null
          id?: string
          image_url?: string | null
          skills_assessed?: Json | null
          student_responses?: Json | null
          submitted_at?: string | null
          submitted_by?: string | null
          worksheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_submissions_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheets: {
        Row: {
          answer_key: Json | null
          content: Json
          created_at: string | null
          id: string
          lesson_id: string | null
          qr_code: string
          student_id: string | null
          uploaded_at: string | null
          uploaded_file_path: string | null
          worksheet_type: string
        }
        Insert: {
          answer_key?: Json | null
          content: Json
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          qr_code: string
          student_id?: string | null
          uploaded_at?: string | null
          uploaded_file_path?: string | null
          worksheet_type: string
        }
        Update: {
          answer_key?: Json | null
          content?: Json
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          qr_code?: string
          student_id?: string | null
          uploaded_at?: string | null
          uploaded_file_path?: string | null
          worksheet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "unmatched_student_teachers"
            referencedColumns: ["student_id"]
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
      upload_analytics_summary: {
        Row: {
          avg_file_size: number | null
          avg_processing_time: number | null
          count: number | null
          date: string | null
          event: string | null
          unique_users: number | null
          unique_worksheets: number | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      create_profile_for_new_user: {
        Args: { user_email: string; user_id: string; user_metadata: Json }
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
      get_available_seas: {
        Args: { current_user_id: string; target_school_id?: string }
        Returns: {
          full_name: string
          id: string
          supervising_provider_id: string
        }[]
      }
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
      get_pending_adjustments: {
        Args: { p_student_id: string }
        Returns: {
          adjustment_details: Json
          adjustment_type: string
          priority: number
          subject: string
        }[]
      }
      get_scheduling_data_batch: {
        Args: { p_provider_id: string; p_school_site: string }
        Returns: Json
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
          supervising_provider_id: string
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
          grade_level: string
          id: string
          iep_goals: string[]
          initials: string
          minutes_per_session: number
          provider_id: string
          school_id: string
          sessions_per_week: number
          teacher_id: string
          teacher_name: string
          updated_at: string
        }[]
      }
      get_special_activity_teacher_name: {
        Args: { activity_teacher_id: string; activity_teacher_name: string }
        Returns: string
      }
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
      import_student_atomic: {
        Args: {
          p_district_id?: string
          p_first_name?: string
          p_grade_level: string
          p_iep_goals?: string[]
          p_initials: string
          p_last_name?: string
          p_minutes_per_session?: number
          p_provider_id: string
          p_school_id?: string
          p_school_site?: string
          p_sessions_per_week?: number
          p_state_id?: string
          p_teacher_id?: string
        }
        Returns: {
          error_message: string
          student_id: string
          success: boolean
        }[]
      }
      increment_referral_uses: {
        Args: { referrer_user_id: string }
        Returns: undefined
      }
      is_teacher_for_student: {
        Args: { p_account_id: string; p_student_id: string }
        Returns: boolean
      }
      is_teacher_of_student: {
        Args: { student_uuid: string }
        Returns: boolean
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
      recalculate_session_end_time: {
        Args: { p_minutes_per_session: number; p_start_time: string }
        Returns: string
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

// Convenience type aliases
export type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
export type Student = Database['public']['Tables']['students']['Row'];
export type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
export type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
export type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
export type SchoolHour = Database['public']['Tables']['school_hours']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type School = Database['public']['Tables']['schools']['Row'];
export type District = Database['public']['Tables']['districts']['Row'];
export type Teacher = Database['public']['Tables']['teachers']['Row'];
