import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/src/types/database';

export interface CalendarConnectionInfo {
  connected: boolean;
  status: 'active' | 'revoked' | 'error' | null;
  googleEmail: string | null;
  connectedAt: string | null;
}

const NO_CONNECTION: CalendarConnectionInfo = {
  connected: false,
  status: null,
  googleEmail: null,
  connectedAt: null,
};

/**
 * The signed-in user's Google Calendar connection state (owner-only RLS).
 * Token ciphertext columns are deliberately not selected — the browser never
 * needs them.
 */
export async function getMyCalendarConnection(): Promise<CalendarConnectionInfo> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NO_CONNECTION;

  const { data, error } = await supabase
    .from('calendar_connections')
    .select('status, google_email, created_at')
    .eq('profile_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw error;
  if (!data) return NO_CONNECTION;

  const status =
    data.status === 'active' || data.status === 'revoked' || data.status === 'error'
      ? data.status
      : null;
  return {
    connected: status === 'active',
    status,
    googleEmail: data.google_email,
    connectedAt: data.created_at,
  };
}
