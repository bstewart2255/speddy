import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/src/types'

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

// NOTE (SPE-495): do NOT re-add an eagerly-constructed `export const supabase`
// here. createBrowserClient() throws when NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are
// absent, and a module-scope call runs on mere *import* of this file — so any
// server module that transitively imports it (e.g. the daily-schedule-emails
// cron, via SessionGenerator) breaks `next build` in an env-less environment.
// Call getSupabaseClient() from inside a function instead.