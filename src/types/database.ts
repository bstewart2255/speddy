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
          school_site?: string
          district_domain?: string
          created_at?: string
          updated_at?: string
        }
      }
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
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Profile = Tables<'profiles'>
export type Student = Tables<'students'>
