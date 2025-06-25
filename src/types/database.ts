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
      bell_schedules: {
        Row: {
          id: string
          provider_id: string
          grade_level: string
          day_of_week: number
          start_time: string
          end_time: string
          period_name: string
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
          session_notes?: string | null
        }
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Profile = Tables<'profiles'>
export type Student = Tables<'students'>
export type BellSchedule = Tables<'bell_schedules'>
export type SpecialActivity = Tables<'special_activities'>
export type ScheduleSession = Tables<'schedule_sessions'>