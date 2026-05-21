import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { checkUserRateLimit, type RateLimitRule } from './rate-limit-user';

interface WithRouteConfig<TBody, TQuery> {
  /** Require an authenticated user (default true). When false, `userId` is ''. */
  auth?: boolean;
  /** Zod schema for the JSON request body. */
  body?: ZodType<TBody, any, any>;
  /** Zod schema for the URL search params (validated as a flat string record). */
  query?: ZodType<TQuery, any, any>;
  /** Per-user rate limit. Applied only on authenticated routes. */
  rateLimit?: RateLimitRule & { name?: string };
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
    try {
      let userId = '';
      if (config.auth !== false) {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
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
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const parsed = config.body.safeParse(raw);
        if (!parsed.success) return validationError(parsed.error.flatten());
        body = parsed.data;
      }

      let query = undefined as TQuery;
      if (config.query) {
        const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        const parsed = config.query.safeParse(raw);
        if (!parsed.success) return validationError(parsed.error.flatten());
        query = parsed.data;
      }

      if (config.rateLimit && userId) {
        const endpoint = config.rateLimit.name ?? req.nextUrl.pathname;
        const outcome = await checkUserRateLimit(userId, endpoint, config.rateLimit);
        if (!outcome.allowed) {
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
