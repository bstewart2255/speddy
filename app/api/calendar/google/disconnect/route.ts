/**
 * Disconnect Google Calendar (SPE-205): deletes the stored (encrypted)
 * tokens and best-effort revokes the grant at Google.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteGoogleConnection } from '@/lib/calendar/connections';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { existed, revoked } = await deleteGoogleConnection(supabase, user.id);
    if (existed) {
      await logServerAuditEvent({
        user_id: user.id,
        action: 'calendar.disconnected',
        resource_type: 'calendar_connection',
        metadata: { provider: 'google', revoked_at_google: revoked },
      });
    }
    return NextResponse.json({ ok: true, existed, revoked });
  } catch (err) {
    console.error(
      'Google Calendar disconnect failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
