import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Export the instance for backward compatibility
export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)

// Export a function that creates a new client
export const createClient = () => {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}