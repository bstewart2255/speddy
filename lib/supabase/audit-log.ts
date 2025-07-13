import { createClient } from '@/lib/supabase/client';

export async function logAccess(params: {
  user_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: any;
}) {
  const supabase = createClient();

  // Fire and forget - don't await to avoid performance impact
  (async () => {
    try {
      await supabase
        .from('audit_logs')
        .insert({
          ...params,
          timestamp: new Date().toISOString()
        });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  })();
}