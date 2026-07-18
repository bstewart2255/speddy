import { createServiceClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';

export interface RateLimitRule {
  /** Max requests allowed within the window. */
  requests: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /**
   * When the limiter itself errors (DB unavailable, etc.), deny the request
   * instead of allowing it. Use for expensive endpoints (paid AI/third-party
   * calls) where fail-open turns a DB hiccup into uncapped spend. Defaults to
   * false (fail open) to preserve availability on cheap endpoints.
   */
  failClosed?: boolean;
}

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (used for the Retry-After header). */
  resetSeconds: number;
  /**
   * When `allowed` is false, why it was denied: `rate_limited` for a genuinely
   * exhausted quota, or `rate_limiter_error` when the limiter itself failed
   * closed (a DB/storage error on a `failClosed` endpoint). Lets callers keep
   * the two apart in telemetry. Undefined when the request is allowed.
   */
  reason?: 'rate_limited' | 'rate_limiter_error';
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

  // On a limiter error, fail closed for endpoints that opt in (deny), otherwise
  // fail open (allow) so a transient DB issue doesn't block cheap traffic.
  const onError = (): RateLimitOutcome =>
    rule.failClosed
      ? { allowed: false, remaining: 0, resetSeconds: rule.windowSeconds, reason: 'rate_limiter_error' }
      : allow();

  try {
    const supabase = createServiceClient();
    const windowStart = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();

    // Prune this key's expired rows (keeps active keys bounded; abandoned keys
    // are purged by a separate scheduled job).
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
      log.error('Rate limit check failed', error, { userId, endpoint, failClosed: !!rule.failClosed });
      return onError();
    }

    const used = count ?? 0;
    if (used >= rule.requests) {
      return { allowed: false, remaining: 0, resetSeconds: rule.windowSeconds, reason: 'rate_limited' };
    }

    const { error: insertError } = await supabase
      .from('api_rate_limits')
      .insert({ user_id: userId, endpoint });
    if (insertError) {
      log.error('Rate limit insert failed', insertError, { userId, endpoint, failClosed: !!rule.failClosed });
      return onError();
    }
    return allow(rule.requests - used - 1);
  } catch (err) {
    log.error('Rate limit check threw', err, { userId, endpoint, failClosed: !!rule.failClosed });
    return onError();
  }
}
