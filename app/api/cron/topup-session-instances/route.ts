import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  runSessionInstanceTopup,
  SESSION_TOPUP_WEEKS_AHEAD
} from '@/lib/services/session-instance-topup';

// SPE-291: dedicated trigger for the session-instance top-up.
//
// NOT scheduled in vercel.json: the Vercel Hobby plan allows at most two cron
// jobs and both slots are used by the cleanup crons, so the daily trigger for
// this top-up lives inside /api/cron/cleanup-uploads. This route exists for
// manual/ops invocation (same CRON_SECRET auth) and as the ready-made cron
// target if the project moves to a plan with more cron slots.

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Read the cron secret from a header only — never the query string, which
    // leaks into access logs, monitoring dashboards, and copied links. Accept
    // the `x-cron-secret` header or the standard `Authorization: Bearer
    // <secret>` form (e.g. Vercel Cron).
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const token = request.headers.get('x-cron-secret') || bearerToken;

    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
      console.error('CRON_SECRET environment variable not set');
      // Surface misconfiguration as a 5xx so the cron service/monitoring
      // notices instead of silently succeeding.
      return NextResponse.json({
        success: false,
        error: 'Server configuration error',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    if (!token || token !== expectedToken) {
      console.warn('Unauthorized session top-up attempt');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }

    // Service-role client: unauthenticated cron request, and the top-up spans
    // every provider's templates (RLS would scope a user client to one).
    const supabase = createServiceClient();

    const result = await runSessionInstanceTopup(supabase);

    if (!result.success) {
      console.error('Error running session instance top-up:', result.error);
      // Fail loud (5xx) so a broken top-up is visible instead of the future-
      // instance supply quietly running dry behind a 200.
      return NextResponse.json({
        success: false,
        error: 'Database error during session top-up',
        details: result.error,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    const processingTime = Date.now() - startTime;

    console.log(
      `Session top-up completed: ${result.instancesCreated} instances created from ${result.templatesProcessed} templates (${SESSION_TOPUP_WEEKS_AHEAD}w horizon) in ${processingTime}ms`
    );

    return NextResponse.json({
      success: true,
      templatesProcessed: result.templatesProcessed,
      instancesCreated: result.instancesCreated,
      weeksAhead: SESSION_TOPUP_WEEKS_AHEAD,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error in session top-up cron job:', error);

    return NextResponse.json({
      success: false,
      error: 'Unexpected error during session top-up',
      details: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Also support POST for flexibility with different cron services
export async function POST(request: NextRequest) {
  return GET(request);
}
