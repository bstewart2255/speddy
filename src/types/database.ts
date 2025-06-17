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
          role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist'
          school_district: string
          school_site: string
          district_domain: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist'
          school_district: string
          school_site: string
          district_domain: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist'
          school_district?: string
          school_site?: string
          district_domain?: string
          created_at?: string
          updated_at?: string
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
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          student_id: string
          day_of_week: number
          start_time: string
          end_time: string
          service_type: string
          created_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          student_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          service_type?: string
          created_at?: string
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