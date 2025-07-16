export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' | 'sea'
          school_district: string
          school_site: string
          works_at_multiple_schools: boolean
          district_domain: string
          supervising_provider_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' | 'sea'
          school_district: string
          school_site: string
          works_at_multiple_schools?: boolean
          district_domain: string
          supervising_provider_id: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist'| 'sea'
          school_district?: string
          school_site?: string
          works_at_multiple_schools?: boolean
          district_domain?: string
          supervising_provider_id?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      provider_schools: {
        Row: {
          id: string
          provider_id: string
          school_district: string
          school_site: string
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          school_district: string
          school_site: string
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          school_district?: string
          school_site?: string
          is_primary?: boolean
          created_at?: string
        }
      },
      user_site_schedules: {
        Row: {
          id: string
          user_id: string
          site_id: string
          day_of_week: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          site_id: string
          day_of_week: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          site_id?: string
          day_of_week?: number
          created_at?: string
          updated_at?: string
        }
      },
      teams: {
        Row: {
          id: string
          name: string
          school_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          school_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          school_name?: string
          created_at?: string
          updated_at?: string
        }
      },
      team_members: {
        Row: {
          id: string
          team_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id: string
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
      },
      students: {
        Row: {
          id: string
          provider_id: string
          initials: string
          grade_level: string
          teacher_name: string
          sessions_per_week: number
          minutes_per_session: number
          school_site: string | null
          school_district: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          initials: string
          grade_level: string
          teacher_name: string
          sessions_per_week: number
          minutes_per_session: number
          school_site?: string | null
          school_district?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          initials?: string
          grade_level?: string
          teacher_name?: string
          sessions_per_week?: number
          minutes_per_session?: number
          school_site?: string | null  
          school_district?: string | null  
          created_at?: string
          updated_at?: string
        }
      },
      student_details: {
        Row: {
          id: string
          student_id: string
          first_name: string | null
          last_name: string | null
          date_of_birth: string | null
          district_id: string | null
          upcoming_iep_date: string | null
          upcoming_triennial_date: string | null
          iep_goals: string[] | null
          working_skills: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          first_name?: string | null
          last_name?: string | null
          date_of_birth?: string | null
          district_id?: string | null
          upcoming_iep_date?: string | null
          upcoming_triennial_date?: string | null
          iep_goals?: string[] | null
          working_skills?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          first_name?: string | null
          last_name?: string | null
          date_of_birth?: string | null
          district_id?: string | null
          upcoming_iep_date?: string | null
          upcoming_triennial_date?: string | null
          iep_goals?: string[] | null
          working_skills?: string[] | null
          created_at?: string
          updated_at?: string
        }
      },
      bell_schedules: {
        Row: {
          id: string
          provider_id: string
          grade_level: string
          day_of_week: number
          start_time: string
          end_time: string
          period_name: string
          school_site: string | null
          school_district: string | null
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          grade_level: string
          day_of_week: number
          start_time: string
          end_time: string
          period_name: string
          school_site?: string | null
          school_district?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          grade_level?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          period_name?: string
          school_site?: string | null
          school_district?: string | null
          created_at?: string
        }
      },
      special_activities: { // TODO: investigate why this doesn't have school_site and school_district
        Row: {
          id: string
          provider_id: string
          teacher_name: string
          day_of_week: number
          start_time: string
          end_time: string
          activity_name: string
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          teacher_name: string
          day_of_week: number
          start_time: string
          end_time: string
          activity_name: string
          created_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          teacher_name?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          activity_name?: string
          created_at?: string
        }
      },
      schedule_sessions: {
        Row: {
          id: string
          provider_id: string
          student_id: string
          day_of_week: number
          start_time: string
          end_time: string
          service_type: string
          assigned_to_sea_id: string | null
          delivered_by: 'provider' | 'sea'
          created_at: string
          completed_at: string | null
          completed_by: string | null
          session_date: string | null
          session_notes: string | null
        }
        Insert: {
          id?: string
          provider_id: string
          student_id: string
          day_of_week: number
          start_time: string
          end_time: string
          service_type: string
          assigned_to_sea_id?: string | null
          delivered_by?: 'provider' | 'sea'
          created_at?: string
          completed_at?: string | null
          completed_by?: string | null
          session_date?: string | null
          session_notes?: string | null
        }
        Update: {
          id?: string
          provider_id?: string
          student_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          service_type?: string
          assigned_to_sea_id?: string | null
          delivered_by?: 'provider' | 'sea'
          created_at?: string
          completed_at?: string | null
          completed_by?: string | null
          session_date?: string | null
          session_notes?: string | null
        }
      },
      lessons: {
        Row: {
          id: string
          provider_id: string
          created_at: string
          time_slot: string
          student_ids: string[]
          student_details: Json
          content: string
          lesson_date: string
          school_site: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          provider_id: string
          created_at?: string
          time_slot: string
          student_ids: string[]
          student_details: Json
          content: string
          lesson_date: string
          school_site?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          provider_id?: string
          created_at?: string
          time_slot?: string
          student_ids?: string[]
          student_details?: Json
          content?: string
          lesson_date?: string
          school_site?: string | null
          notes?: string | null
        }
      },
      todos: {
        Row: {
          id: string
          user_id: string
          task: string
          completed: boolean
          created_at: string
          due_date: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          task: string
          completed?: boolean
          created_at?: string
          due_date?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          task?: string
          completed?: boolean
          created_at?: string
          due_date?: string | null
          updated_at?: string
        }
      },
      worksheets: {
        Row: {
          id: string
          lesson_id: string
          student_id: string
          worksheet_type: string
          content: Json
          answer_key: Json | null
          qr_code: string
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          student_id: string
          worksheet_type: string
          content: Json
          answer_key?: Json | null
          qr_code: string
          created_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          student_id?: string
          worksheet_type?: string
          content?: Json
          answer_key?: Json | null
          qr_code?: string
          created_at?: string
        }
      },
      worksheet_submissions: {
        Row: {
          id: string
          worksheet_id: string
          submitted_at: string
          submitted_by: string
          image_url: string | null
          student_responses: Json | null
          accuracy_percentage: number | null
          skills_assessed: Json | null
          ai_analysis: string | null
        }
        Insert: {
          id?: string
          worksheet_id: string
          submitted_at?: string
          submitted_by: string
          image_url?: string | null
          student_responses?: Json | null
          accuracy_percentage?: number | null
          skills_assessed?: Json | null
          ai_analysis?: string | null
        }
        Update: {
          id?: string
          worksheet_id?: string
          submitted_at?: string
          submitted_by?: string
          image_url?: string | null
          student_responses?: Json | null
          accuracy_percentage?: number | null
          skills_assessed?: Json | null
          ai_analysis?: string | null
        }
      },
      school_hours: {
        Row: {
          id: string
          provider_id: string
          school_site: string | null
          day_of_week: number
          grade_level: string
          start_time: string
          end_time: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          school_site?: string | null
          day_of_week: number
          grade_level: string
          start_time: string
          end_time: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          school_site?: string | null
          day_of_week?: number
          grade_level?: string
          start_time?: string
          end_time?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_hours_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      },
      iep_goal_progress: {
        Row: {
          id: string
          student_id: string
          iep_goal: string
          target_metric: Json
          current_performance: number | null
          trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' | null
          last_assessed: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          iep_goal: string
          target_metric: Json
          current_performance?: number | null
          trend?: 'improving' | 'stable' | 'declining' | 'insufficient_data' | null
          last_assessed?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          iep_goal?: string
          target_metric?: Json
          current_performance?: number | null
          trend?: 'improving' | 'stable' | 'declining' | 'insufficient_data' | null
          last_assessed?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string
          stripe_subscription_id: string
          status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing'
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          trial_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id: string
          stripe_subscription_id: string
          status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing'
          current_period_start: string
          current_period_end: string
          cancel_at_period_end?: boolean
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          status?: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing'
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      referral_codes: {
        Row: {
          id: string
          user_id: string
          code: string
          uses_count: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          code: string
          uses_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          code?: string
          uses_count?: number
          created_at?: string
        }
      },
      referral_relationships: {
        Row: {
          id: string
          referrer_id: string
          referred_id: string
          subscription_id: string | null
          status: 'trial' | 'active' | 'canceled' | 'paused'
          credit_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          referrer_id: string
          referred_id: string
          subscription_id?: string | null
          status: 'trial' | 'active' | 'canceled' | 'paused'
          credit_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          referrer_id?: string
          referred_id?: string
          subscription_id?: string | null
          status?: 'trial' | 'active' | 'canceled' | 'paused'
          credit_amount?: number
          created_at?: string
          updated_at?: string
        }
      },
      subscription_pauses: {
        Row: {
          id: string
          subscription_id: string
          pause_start: string
          pause_end: string
          created_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          pause_start: string
          pause_end: string
          created_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string
          pause_start?: string
          pause_end?: string
          created_at?: string
        }
      },
      referral_credits: {
        Row: {
          id: string
          user_id: string
          month: string
          total_credits: number
          credits_applied: number
          payout_amount: number
          status: 'pending' | 'applied' | 'paid_out'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month: string
          total_credits?: number
          credits_applied?: number
          payout_amount?: number
          status: 'pending' | 'applied' | 'paid_out'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          month?: string
          total_credits?: number
          credits_applied?: number
          payout_amount?: number
          status?: 'pending' | 'applied' | 'paid_out'
          created_at?: string
          updated_at?: string
        }
      },
      manual_lesson_plans: {
        Row: {
          id: string
          provider_id: string
          lesson_date: string
          title: string
          subject: string | null
          grade_levels: string[] | null
          duration_minutes: number | null
          objectives: string | null
          materials: string | null
          activities: Json | null
          assessment: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          lesson_date: string
          title: string
          subject?: string | null
          grade_levels?: string[] | null
          duration_minutes?: number | null
          objectives?: string | null
          materials?: string | null
          activities?: Json | null
          assessment?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          lesson_date?: string
          title?: string
          subject?: string | null
          grade_levels?: string[] | null
          duration_minutes?: number | null
          objectives?: string | null
          materials?: string | null
          activities?: Json | null
          assessment?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_lesson_plans_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Profile = Tables<'profiles'>;
export type Student = Tables<'students'>;
export type BellSchedule = Tables<'bell_schedules'>;
export type SpecialActivity = Tables<'special_activities'>;
export type ScheduleSession = Tables<'schedule_sessions'>;
export type Worksheet = Tables<'worksheets'>;
export type WorksheetSubmission = Tables<'worksheet_submissions'>;
export type IEPGoalProgress = Tables<'iep_goal_progress'>;
export type Subscription = Tables<'subscriptions'>;
export type ReferralCode = Tables<'referral_codes'>;
export type ReferralRelationship = Tables<'referral_relationships'>;
export type ManualLessonPlan = Tables<'manual_lesson_plans'>;
export type SubscriptionPause = Tables<'subscription_pauses'>;
export type ReferralCredit = Tables<'referral_credits'>;