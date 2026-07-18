import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { checkUserRateLimit, type RateLimitRule } from './rate-limit-user';

// Server-side AI kill-switch. AI features are disabled by default; any route
// that reaches an external LLM / document-processing provider opts in via
// `aiGated` (see below) and 404s unless AI_FEATURES_ENABLED === 'true'. The flag
// is read per request (not cached at module load) so a change takes effect on
// the next request rather than requiring a fresh process.

interface WithRouteConfig<TBody, TQuery> {
  /** Require an authenticated user (default true). When false, `userId` is ''. */
  auth?: boolean;
  /** Zod schema for the JSON request body. */
  body?: ZodType<TBody, any, any>;
  /** Zod schema for the URL search params (validated as a flat string record). */
  query?: ZodType<TQuery, any, any>;
  /** Per-user rate limit. Applied only on authenticated routes. */
  rateLimit?: RateLimitRule & { name?: string };
  /**
   * Gate this route behind the AI feature kill-switch. When AI is disabled
   * (AI_FEATURES_ENABLED !== 'true'), the route 404s before any handler logic
   * runs — so no external LLM/provider call is made. Apply to routes that reach
   * OpenAI / Anthropic / document-processing providers.
   */
  aiGated?: boolean;
}

interface RouteHandlerArgs<TBody, TQuery, TParams> {
  req: NextRequest;
  /** Authenticated user id, or '' on `auth: false` routes. */
  userId: string;
  body: TBody;
  query: TQuery;
  params: TParams;
}

type Handler<TBody, TQuery, TParams> = (
  args: RouteHandlerArgs<TBody, TQuery, TParams>
) => Promise<NextResponse>;

// Next.js 15 passes dynamic segment params as a Promise in the second argument.
type NextContext<TParams> = { params: Promise<TParams> };

const validationError = (details: unknown) =>
  NextResponse.json({ error: 'Validation failed', details }, { status: 400 });

/**
 * Composable route wrapper: auth, Zod body/query validation, per-user rate
 * limiting, dynamic params, and a consistent `{ error }` response on failure.
 * All concerns are opt-in via the config; the handler receives validated,
 * typed inputs.
 */
export function withRoute<
  TParams extends Record<string, string> = Record<string, string>,
  TBody = undefined,
  TQuery = undefined,
>(
  config: WithRouteConfig<TBody, TQuery>,
  handler: Handler<TBody, TQuery, TParams>
) {
  return async (req: NextRequest, context?: NextContext<TParams>): Promise<NextResponse> => {
    // Emit one consistent telemetry line whenever the wrapper rejects a request
    // before the handler runs (auth / validation / rate-limit). Handlers own
    // their own success/error telemetry, so these early returns previously went
    // unrecorded (SPE-81). Responses are unchanged — this only adds a log line.
    const logRejection = (status: number, reason: string) =>
      log.warn('API route rejected', {
        endpoint: req.nextUrl.pathname,
        method: req.method,
        status,
        reason,
      });

    try {
      // AI kill-switch: gated routes do not exist while AI features are off.
      // Checked before auth so the feature is fully hidden and makes no
      // provider calls regardless of who calls it.
      if (config.aiGated && process.env.AI_FEATURES_ENABLED !== 'true') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      let userId = '';
      if (config.auth !== false) {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          logRejection(401, 'unauthorized');
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        userId = user.id;
      }

      const params = (context ? await context.params : {}) as TParams;

      let body = undefined as TBody;
      if (config.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          logRejection(400, 'invalid_json');
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const parsed = config.body.safeParse(raw);
        if (!parsed.success) {
          logRejection(400, 'body_validation');
          return validationError(parsed.error.flatten());
        }
        body = parsed.data;
      }

      let query = undefined as TQuery;
      if (config.query) {
        const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        const parsed = config.query.safeParse(raw);
        if (!parsed.success) {
          logRejection(400, 'query_validation');
          return validationError(parsed.error.flatten());
        }
        query = parsed.data;
      }

      if (config.rateLimit && userId) {
        const endpoint = config.rateLimit.name ?? req.nextUrl.pathname;
        const outcome = await checkUserRateLimit(userId, endpoint, config.rateLimit);
        if (!outcome.allowed) {
          logRejection(429, 'rate_limited');
          return NextResponse.json(
            { error: 'Too many requests. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(outcome.resetSeconds) } }
          );
        }
      }

      return await handler({ req, userId, body, query, params });
    } catch (error) {
      log.error('API route error', error, { url: req.url, method: req.method });
      const message =
        process.env.NODE_ENV === 'development' ? (error as Error).message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
