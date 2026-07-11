import { createServiceClient } from '@/lib/supabase/server';

/**
 * Server-side audit event writer. Uses the service client because audit_logs
 * has RLS enabled with NO insert policy (20260629_chat_audit_logging.sql) —
 * an insert through the user's session client would silently fail.
 *
 * Best-effort by design: an audit failure is logged but never breaks the
 * action being audited. (SPE-169 owns the full audit-logging story.)
 */
export async function logServerAuditEvent(params: {
  user_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('audit_logs').insert({
      ...params,
      timestamp: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}
