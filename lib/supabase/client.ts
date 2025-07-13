import { createBrowserClient } from '@supabase/ssr'

export const createClient = <T = any>() => {
  return createBrowserClient<T>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Export the supabase instance for backward compatibility
// (creates a new client instance for each usage)
export const supabase = createClient()