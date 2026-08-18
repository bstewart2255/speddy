import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  runSessionInstanceTopup,
  SESSION_TOPUP_WEEKS_AHEAD
} from '@/lib/services/session-instance-topup';
import { listAutoSyncDistrictIds, runAutoLinkSync } from '@/lib/sis/auto-link-sync';
import { cronTokenMatches } from '@/lib/api/cron-auth';

// SPE-545: the nightly link sync below walks each connected district's SIS
// to completion — well past the platform's default function window.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Read the cron secret from a header only — never the query string, which
    // leaks into access logs, monitoring dashboards, and copied links. This
    // endpoint gates service-role deletes, so accept the `x-cron-secret` header
    // or the standard `Authorization: Bearer <secret>` form (e.g. Vercel Cron).
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

    if (!cronTokenMatches(token, expectedToken)) {
      console.warn('Unauthorized cleanup attempt');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }

    // Use the service-role client: this is an unauthenticated cron request, so
    // there is no user session for the cookie-based client to read.
    const supabase = createServiceClient();

    // The upload_rate_limits purge this route was named for went away with the
    // QR worksheet-upload feature, and the analytics_events sweep with the
    // stage-2 table drops (SPE-497); the daily session top-up below is the job
    // that keeps this cron scheduled.

    // SPE-291: daily session-instance top-up rides along with this cron.
    // Vercel Hobby allows only two cron jobs (both slots used), so this daily
    // job is the trigger; /api/cron/topup-session-instances remains available
    // for manual runs. Idempotent and set-based, so daily execution is cheap.
    const topupResult = await runSessionInstanceTopup(supabase);

    if (!topupResult.success) {
      console.error('Error running session instance top-up:', topupResult.error);
      // Fail loud (5xx) so a broken top-up is visible instead of the future-
      // instance supply quietly running dry behind a 200.
      return NextResponse.json({
        success: false,
        error: 'Database error during session top-up',
        details: topupResult.error,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    console.log(
      `Session top-up completed: ${topupResult.instancesCreated} instances created from ${topupResult.templatesProcessed} templates (${SESSION_TOPUP_WEEKS_AHEAD}w horizon)`
    );

    // SPE-545: nightly class-roster link sync rides along (both Vercel cron
    // slots are used — same precedent as the SPE-291 top-up above). Isolated:
    // runAutoLinkSync never throws, and a worklist failure is reported in the
    // response without failing the jobs that already ran. Outcomes are
    // counts-by-word only.
    const linkSync: Record<string, number> & { error?: string } = {};
    try {
      const districtIds = await listAutoSyncDistrictIds();
      for (const districtId of districtIds) {
        const outcome = await runAutoLinkSync({ districtId, trigger: 'cron', actorId: null });
        linkSync[outcome] = (linkSync[outcome] ?? 0) + 1;
      }
    } catch (linkErr: any) {
      console.error('Nightly link sync worklist failed:', linkErr);
      linkSync.error = 'Could not list SIS connections';
    }

    // Return success response
    return NextResponse.json({
      success: true,
      sessionTopup: {
        templatesProcessed: topupResult.templatesProcessed,
        instancesCreated: topupResult.instancesCreated,
        weeksAhead: SESSION_TOPUP_WEEKS_AHEAD
      },
      linkSync,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('Unexpected error in cleanup cron job:', error);

    // Fail loud (5xx) so the cron service retries and monitoring is alerted,
    // rather than masking failures behind a 200.
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during cleanup',
      details: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Also support POST for flexibility with different cron services
export async function POST(request: NextRequest) {
  return GET(request);
}