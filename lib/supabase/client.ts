import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/src/types/database'

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Get the singleton Supabase browser client.
 * Creates the client on first call, reuses it on subsequent calls.
 */
export function getSupabaseClient() {
  if (!clientInstance) {
    clientInstance = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return clientInstance
}

/**
 * @deprecated Use getSupabaseClient() instead for better performance.
 * This function now returns the singleton instance for backward compatibility.
 */
export const createClient = <T = any>() => {
  // Return singleton - the generic T is preserved for API compatibility
  // but all callers now share the same typed instance
  return getSupabaseClient() as unknown as ReturnType<typeof createBrowserClient<T>>
}

// Export singleton for backward compatibility
export const supabase = getSupabaseClient()