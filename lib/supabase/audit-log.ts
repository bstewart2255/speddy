import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export async function logAccess(params: {
  user_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: any;
}) {
  const supabase = createClientComponentClient();

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