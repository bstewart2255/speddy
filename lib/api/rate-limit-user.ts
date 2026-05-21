import { createServiceClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';

export interface RateLimitRule {
  /** Max requests allowed within the window. */
  requests: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (used for the Retry-After header). */
  resetSeconds: number;
}

/**
 * Per-user, DB-backed rate limiter for authenticated endpoints.
 *
 * Uses the service-role client so the counter table is invisible to the user's
 * own client and cannot be tampered with. Fails open: if the check errors, the
 * request is allowed rather than blocking legitimate traffic.
 */
export async function checkUserRateLimit(
  userId: string,
  endpoint: string,
  rule: RateLimitRule
): Promise<RateLimitOutcome> {
  const allow = (remaining = rule.requests): RateLimitOutcome => ({
    allowed: true,
    remaining,
    resetSeconds: rule.windowSeconds,
  });

  try {
    const supabase = createServiceClient();
    const windowStart = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();

    // Drop this key's expired rows so the table stays bounded.
    await supabase
      .from('api_rate_limits')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .lt('created_at', windowStart);

    const { count, error } = await supabase
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart);

    if (error) {
      log.error('Rate limit check failed; allowing request', error, { userId, endpoint });
      return allow();
    }

    const used = count ?? 0;
    if (used >= rule.requests) {
      return { allowed: false, remaining: 0, resetSeconds: rule.windowSeconds };
    }

    await supabase.from('api_rate_limits').insert({ user_id: userId, endpoint });
    return allow(rule.requests - used - 1);
  } catch (err) {
    log.error('Rate limit check threw; allowing request', err, { userId, endpoint });
    return allow();
  }
}
