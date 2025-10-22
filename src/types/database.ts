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
          role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' | 'sea' | 'admin'
          school_id: string
          district_id: string
          state_id: string
          school_district: string // Display only
          school_site: string // Display only
          works_at_multiple_schools: boolean
          district_domain: string
          supervising_provider_id: string | null
          shared_at_school: boolean
          created_at: string
          updated_at: string
          display_name?: string
          grade_level?: string
          subject?: string
          bio?: string
          avatar_url?: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' | 'sea' | 'admin'
          school_id: string
          district_id: string
          state_id: string
          school_district?: string
          school_site?: string
          works_at_multiple_schools?: boolean
          district_domain: string
          supervising_provider_id: string | null
          shared_at_school?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' | 'sea' | 'admin'
          school_id?: string
          district_id?: string
          state_id?: string
          school_district?: string
          school_site?: string
          works_at_multiple_schools?: boolean
          district_domain?: string
          supervising_provider_id?: string | null
          shared_at_school?: boolean
          created_at?: string
          updated_at?: string
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
          teacher_name: string | null
          teacher_id: string | null
          sessions_per_week: number | null
          minutes_per_session: number | null
          school_id: string | null
          district_id: string | null
          state_id: string | null
          school_site: string | null // Display only
          school_district: string | null // Display only
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          initials: string
          grade_level: string
          teacher_name?: string | null
          teacher_id?: string | null
          sessions_per_week?: number | null
          minutes_per_session?: number | null
          school_id?: string | null
          district_id?: string | null
          state_id?: string | null
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
          teacher_name?: string | null
          teacher_id?: string | null
          sessions_per_week?: number | null
          minutes_per_session?: number | null
          school_id?: string | null
          district_id?: string | null
          state_id?: string | null
          school_site?: string | null  
          school_district?: string | null  
          created_at?: string
          updated_at?: string
        }
      },
      teachers: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          email: string | null
          classroom_number: string | null
          phone_number: string | null
          provider_id: string
          school_id: string | null
          school_site: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          classroom_number?: string | null
          phone_number?: string | null
          provider_id: string
          school_id?: string | null
          school_site?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          classroom_number?: string | null
          phone_number?: string | null
          provider_id?: string
          school_id?: string | null
          school_site?: string | null
          created_at?: string | null
          updated_at?: string | null
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
          reading_level: string | null
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
          reading_level?: string | null
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
          reading_level?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      student_assessments: {
        Row: {
          id: string
          student_id: string
          dibels_wpm_accuracy: number | null
          dibels_nonsense_word_fluency: number | null
          reading_comprehension_accuracy: number | null
          lexile_level: string | null
          fp_dra_level: string | null
          phoneme_segmentation_fluency: number | null
          sight_words_known: number | null
          sight_words_list_level: string | null
          math_computation_addition_accuracy: number | null
          math_computation_subtraction_accuracy: number | null
          math_computation_multiplication_accuracy: number | null
          math_computation_division_accuracy: number | null
          math_fact_fluency_addition: number | null
          math_fact_fluency_subtraction: number | null
          math_fact_fluency_multiplication: number | null
          math_fact_fluency_division: number | null
          math_problem_solving_accuracy: number | null
          math_number_sense_score: number | null
          spelling_developmental_stage: string | null
          spelling_accuracy: number | null
          written_expression_score: number | null
          words_per_sentence_average: number | null
          handwriting_letters_per_minute: number | null
          wisc_processing_speed_index: number | null
          wisc_working_memory_index: number | null
          wisc_fluid_reasoning_index: number | null
          academic_fluency_score: number | null
          processing_speed_score: number | null
          cognitive_efficiency_score: number | null
          brief_working_memory_tscore: number | null
          brief_inhibition_tscore: number | null
          brief_shift_flexibility_tscore: number | null
          immediate_recall_score: number | null
          delayed_recall_score: number | null
          recognition_score: number | null
          assessment_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          dibels_wpm_accuracy?: number | null
          dibels_nonsense_word_fluency?: number | null
          reading_comprehension_accuracy?: number | null
          lexile_level?: string | null
          fp_dra_level?: string | null
          phoneme_segmentation_fluency?: number | null
          sight_words_known?: number | null
          sight_words_list_level?: string | null
          math_computation_addition_accuracy?: number | null
          math_computation_subtraction_accuracy?: number | null
          math_computation_multiplication_accuracy?: number | null
          math_computation_division_accuracy?: number | null
          math_fact_fluency_addition?: number | null
          math_fact_fluency_subtraction?: number | null
          math_fact_fluency_multiplication?: number | null
          math_fact_fluency_division?: number | null
          math_problem_solving_accuracy?: number | null
          math_number_sense_score?: number | null
          spelling_developmental_stage?: string | null
          spelling_accuracy?: number | null
          written_expression_score?: number | null
          words_per_sentence_average?: number | null
          handwriting_letters_per_minute?: number | null
          wisc_processing_speed_index?: number | null
          wisc_working_memory_index?: number | null
          wisc_fluid_reasoning_index?: number | null
          academic_fluency_score?: number | null
          processing_speed_score?: number | null
          cognitive_efficiency_score?: number | null
          brief_working_memory_tscore?: number | null
          brief_inhibition_tscore?: number | null
          brief_shift_flexibility_tscore?: number | null
          immediate_recall_score?: number | null
          delayed_recall_score?: number | null
          recognition_score?: number | null
          assessment_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          dibels_wpm_accuracy?: number | null
          dibels_nonsense_word_fluency?: number | null
          reading_comprehension_accuracy?: number | null
          lexile_level?: string | null
          fp_dra_level?: string | null
          phoneme_segmentation_fluency?: number | null
          sight_words_known?: number | null
          sight_words_list_level?: string | null
          math_computation_addition_accuracy?: number | null
          math_computation_subtraction_accuracy?: number | null
          math_computation_multiplication_accuracy?: number | null
          math_computation_division_accuracy?: number | null
          math_fact_fluency_addition?: number | null
          math_fact_fluency_subtraction?: number | null
          math_fact_fluency_multiplication?: number | null
          math_fact_fluency_division?: number | null
          math_problem_solving_accuracy?: number | null
          math_number_sense_score?: number | null
          spelling_developmental_stage?: string | null
          spelling_accuracy?: number | null
          written_expression_score?: number | null
          words_per_sentence_average?: number | null
          handwriting_letters_per_minute?: number | null
          wisc_processing_speed_index?: number | null
          wisc_working_memory_index?: number | null
          wisc_fluid_reasoning_index?: number | null
          academic_fluency_score?: number | null
          processing_speed_score?: number | null
          cognitive_efficiency_score?: number | null
          brief_working_memory_tscore?: number | null
          brief_inhibition_tscore?: number | null
          brief_shift_flexibility_tscore?: number | null
          immediate_recall_score?: number | null
          delayed_recall_score?: number | null
          recognition_score?: number | null
          assessment_date?: string | null
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
          school_id: string | null
          created_at: string
          updated_at: string
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
          school_id?: string | null
          created_at?: string
          updated_at?: string
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
          school_id?: string | null
          created_at?: string
        }
      },
      special_activities: {
        Row: {
          id: string
          provider_id: string
          teacher_name: string
          day_of_week: number
          start_time: string
          end_time: string
          activity_name: string
          school_site: string | null
          school_district: string | null
          school_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          teacher_name: string
          day_of_week: number
          start_time: string
          end_time: string
          activity_name: string
          school_site?: string | null
          school_district?: string | null
          school_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          teacher_name?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          activity_name?: string
          school_site?: string | null
          school_district?: string | null
          school_id?: string | null
          created_at?: string
        }
      },
      schedule_share_requests: {
        Row: {
          id: string
          sharer_id: string
          school_id: string
          created_at: string
        }
        Insert: {
          id?: string
          sharer_id: string
          school_id: string
          created_at?: string
        }
        Update: {
          id?: string
          sharer_id?: string
          school_id?: string
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
          assigned_to_specialist_id: string | null
          delivered_by: 'provider' | 'sea' | 'specialist'
          created_at: string
          completed_at: string | null
          completed_by: string | null
          session_date: string | null
          session_notes: string | null
          manually_placed: boolean
          is_completed: boolean
          student_absent: boolean
          outside_schedule_conflict: boolean
          group_id: string | null
          group_name: string | null
          status: 'active' | 'conflict' | 'needs_attention'
          conflict_reason: string | null
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
          assigned_to_specialist_id?: string | null
          delivered_by?: 'provider' | 'sea' | 'specialist'
          created_at?: string
          completed_at?: string | null
          completed_by?: string | null
          session_date?: string | null
          session_notes?: string | null
          manually_placed?: boolean
          is_completed?: boolean
          student_absent?: boolean
          outside_schedule_conflict?: boolean
          group_id?: string | null
          group_name?: string | null
          status?: 'active' | 'conflict' | 'needs_attention'
          conflict_reason?: string | null
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
          assigned_to_specialist_id?: string | null
          delivered_by?: 'provider' | 'sea' | 'specialist'
          created_at?: string
          completed_at?: string | null
          completed_by?: string | null
          session_date?: string | null
          session_notes?: string | null
          manually_placed?: boolean
          is_completed?: boolean
          student_absent?: boolean
          outside_schedule_conflict?: boolean
          group_id?: string | null
          group_name?: string | null
          status?: 'active' | 'conflict' | 'needs_attention'
          conflict_reason?: string | null
        }
      },
      lessons: {
        Row: {
          id: string
          provider_id: string
          lesson_source: 'ai_generated' | 'ai_enhanced' | 'manual' | 'imported'
          lesson_status: 'draft' | 'published' | 'archived'
          created_at: string
          updated_at: string
          lesson_date: string
          time_slot: string | null
          school_id: string | null
          district_id: string | null
          state_id: string | null
          title: string | null
          subject: string | null
          topic: string | null
          grade_levels: string[] | null
          duration_minutes: number | null
          content: Json
          student_ids: string[] | null
          student_details: Json | null
          metadata: Json | null
          notes: string | null
          ai_model: string | null
          ai_prompt: string | null
          ai_raw_response: Json | null
          prompt_tokens: number | null
          completion_tokens: number | null
          total_tokens: number | null
          group_id: string | null
          session_ids: string[] | null
          // Legacy fields (kept for backwards compatibility)
          school_site: string | null
        }
        Insert: {
          id?: string
          provider_id: string
          lesson_source?: 'ai_generated' | 'ai_enhanced' | 'manual' | 'imported'
          lesson_status?: 'draft' | 'published' | 'archived'
          created_at?: string
          updated_at?: string
          lesson_date: string
          time_slot?: string | null
          school_id?: string | null
          district_id?: string | null
          state_id?: string | null
          title?: string | null
          subject?: string | null
          topic?: string | null
          grade_levels?: string[] | null
          duration_minutes?: number | null
          content?: Json
          student_ids?: string[] | null
          student_details?: Json | null
          metadata?: Json | null
          notes?: string | null
          ai_model?: string | null
          ai_prompt?: string | null
          ai_raw_response?: Json | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          total_tokens?: number | null
          group_id?: string | null
          session_ids?: string[] | null
          school_site?: string | null
        }
        Update: {
          id?: string
          provider_id?: string
          lesson_source?: 'ai_generated' | 'ai_enhanced' | 'manual' | 'imported'
          lesson_status?: 'draft' | 'published' | 'archived'
          created_at?: string
          updated_at?: string
          lesson_date?: string
          time_slot?: string | null
          school_id?: string | null
          district_id?: string | null
          state_id?: string | null
          title?: string | null
          subject?: string | null
          topic?: string | null
          grade_levels?: string[] | null
          duration_minutes?: number | null
          content?: Json
          student_ids?: string[] | null
          student_details?: Json | null
          metadata?: Json | null
          notes?: string | null
          ai_model?: string | null
          ai_prompt?: string | null
          ai_raw_response?: Json | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          total_tokens?: number | null
          group_id?: string | null
          session_ids?: string[] | null
          school_site?: string | null
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
          uploaded_file_path: string | null
          uploaded_at: string | null
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
          uploaded_file_path?: string | null
          uploaded_at?: string | null
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
          uploaded_file_path?: string | null
          uploaded_at?: string | null
          created_at?: string
        }
      },
      upload_rate_limits: {
        Row: {
          id: string
          ip_address: string
          worksheet_code: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          ip_address: string
          worksheet_code: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          ip_address?: string
          worksheet_code?: string
          uploaded_at?: string
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
          group_id: string | null
          session_ids: string[] | null
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
          group_id?: string | null
          session_ids?: string[] | null
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
          group_id?: string | null
          session_ids?: string[] | null
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
      },
      states: {
        Row: {
          id: string
          name: string
          abbreviation: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          abbreviation: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          abbreviation?: string
          created_at?: string
          updated_at?: string
        }
      },
      districts: {
        Row: {
          id: string
          state_id: string
          name: string
          nces_id: string | null
          city: string | null
          zip_code: string | null
          county: string | null
          phone: string | null
          website: string | null
          superintendent_name: string | null
          enrollment_total: number | null
          schools_count: number | null
          grade_span_low: string | null
          grade_span_high: string | null
          urban_centric_locale: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          state_id: string
          name: string
          nces_id?: string | null
          city?: string | null
          zip_code?: string | null
          county?: string | null
          phone?: string | null
          website?: string | null
          superintendent_name?: string | null
          enrollment_total?: number | null
          schools_count?: number | null
          grade_span_low?: string | null
          grade_span_high?: string | null
          urban_centric_locale?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          state_id?: string
          name?: string
          nces_id?: string | null
          city?: string | null
          zip_code?: string | null
          county?: string | null
          phone?: string | null
          website?: string | null
          superintendent_name?: string | null
          enrollment_total?: number | null
          schools_count?: number | null
          grade_span_low?: string | null
          grade_span_high?: string | null
          urban_centric_locale?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      },
      schools: {
        Row: {
          id: string
          district_id: string
          state_id: string
          name: string
          nces_id: string | null
          school_type: string | null
          grade_span_low: string | null
          grade_span_high: string | null
          street_address: string | null
          city: string | null
          zip_code: string | null
          phone: string | null
          website: string | null
          principal_name: string | null
          enrollment_total: number | null
          teachers_fte: number | null
          student_teacher_ratio: number | null
          free_reduced_lunch_eligible: number | null
          charter_school: boolean
          magnet_school: boolean
          title_i_school: boolean
          urban_centric_locale: string | null
          latitude: number | null
          longitude: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          district_id: string
          state_id: string
          name: string
          nces_id?: string | null
          school_type?: string | null
          grade_span_low?: string | null
          grade_span_high?: string | null
          street_address?: string | null
          city?: string | null
          zip_code?: string | null
          phone?: string | null
          website?: string | null
          principal_name?: string | null
          enrollment_total?: number | null
          teachers_fte?: number | null
          student_teacher_ratio?: number | null
          free_reduced_lunch_eligible?: number | null
          charter_school?: boolean
          magnet_school?: boolean
          title_i_school?: boolean
          urban_centric_locale?: string | null
          latitude?: number | null
          longitude?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          district_id?: string
          state_id?: string
          name?: string
          nces_id?: string | null
          school_type?: string | null
          grade_span_low?: string | null
          grade_span_high?: string | null
          street_address?: string | null
          city?: string | null
          zip_code?: string | null
          phone?: string | null
          website?: string | null
          principal_name?: string | null
          enrollment_total?: number | null
          teachers_fte?: number | null
          student_teacher_ratio?: number | null
          free_reduced_lunch_eligible?: number | null
          charter_school?: boolean
          magnet_school?: boolean
          title_i_school?: boolean
          urban_centric_locale?: string | null
          latitude?: number | null
          longitude?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      },
      calendar_events: {
        Row: {
          id: string
          provider_id: string
          title: string
          description: string | null
          date: string
          start_time: string | null
          end_time: string | null
          all_day: boolean
          event_type: 'meeting' | 'assessment' | 'activity' | 'other' | null
          location: string | null
          attendees: string[] | null
          school_id: string | null
          district_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          title: string
          description?: string | null
          date: string
          start_time?: string | null
          end_time?: string | null
          all_day?: boolean
          event_type?: 'meeting' | 'assessment' | 'activity' | 'other' | null
          location?: string | null
          attendees?: string[] | null
          school_id?: string | null
          district_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          title?: string
          description?: string | null
          date?: string
          start_time?: string | null
          end_time?: string | null
          all_day?: boolean
          event_type?: 'meeting' | 'assessment' | 'activity' | 'other' | null
          location?: string | null
          attendees?: string[] | null
          school_id?: string | null
          district_id?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      holidays: {
        Row: {
          id: string
          date: string
          name: string | null
          school_site: string
          school_district: string
          school_id: string | null
          district_id: string | null
          created_by: string | null
          updated_by: string | null
          reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          name?: string | null
          school_site: string
          school_district: string
          school_id?: string | null
          district_id?: string | null
          created_by?: string | null
          updated_by?: string | null
          reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          name?: string | null
          school_site?: string
          school_district?: string
          school_id?: string | null
          district_id?: string | null
          created_by?: string | null
          updated_by?: string | null
          reason?: string | null
          created_at?: string
          updated_at?: string
        }
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
export type SchoolHour = Tables<'school_hours'>;
export type WorksheetSubmission = Tables<'worksheet_submissions'>;
export type State = Tables<'states'>;
export type District = Tables<'districts'>;
export type School = Tables<'schools'>;
export type IEPGoalProgress = Tables<'iep_goal_progress'>;
export type CalendarEvent = Tables<'calendar_events'>;
export type Holiday = Tables<'holidays'>;
export type Subscription = Tables<'subscriptions'>;
export type ReferralCode = Tables<'referral_codes'>;
export type ReferralRelationship = Tables<'referral_relationships'>;
export type ManualLessonPlan = Tables<'manual_lesson_plans'>;
export type SubscriptionPause = Tables<'subscription_pauses'>;
export type ReferralCredit = Tables<'referral_credits'>;