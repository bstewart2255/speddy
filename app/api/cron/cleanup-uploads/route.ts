import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check for authentication token
    const token = request.nextUrl.searchParams.get('token') ||
                  request.headers.get('x-cron-secret');

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

    // Calculate cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    // Delete old rate limit records. The column is `uploaded_at` (not
    // `created_at`); request a count rather than the deleted rows so we don't
    // pull a large id list back over the wire.
    const { error: deleteError, count } = await supabase
      .from('upload_rate_limits')
      .delete({ count: 'exact' })
      .lt('uploaded_at', cutoffDate.toISOString());

    if (deleteError) {
      console.error('Error deleting old rate limit records:', deleteError);
      // Fail loud (5xx) so a broken cleanup is visible instead of letting the
      // table grow unbounded behind a 200.
      return NextResponse.json({
        success: false,
        error: 'Database error during cleanup',
        details: deleteError.message,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    const deletedCount = count ?? 0;
    const processingTime = Date.now() - startTime;
    
    // Log the cleanup action
    console.log(`Rate limit cleanup completed: ${deletedCount} records deleted in ${processingTime}ms`);
    
    // Optionally, also clean up old analytics events (older than 90 days)
    const analyticsEnabled = process.env.CLEANUP_ANALYTICS === 'true';
    let analyticsDeleted = 0;
    
    if (analyticsEnabled) {
      const analyticsCutoffDate = new Date();
      analyticsCutoffDate.setDate(analyticsCutoffDate.getDate() - 90);
      
      const { error: analyticsError, count: analyticsCount } = await supabase
        .from('analytics_events')
        .delete({ count: 'exact' })
        .lt('created_at', analyticsCutoffDate.toISOString());

      if (analyticsError) {
        console.error('Error deleting old analytics records:', analyticsError);
      } else {
        analyticsDeleted = analyticsCount ?? 0;
        console.log(`Analytics cleanup: ${analyticsDeleted} records deleted`);
      }
    }
    
    // Return success response
    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      analyticsDeleted: analyticsEnabled ? analyticsDeleted : undefined,
      cutoffDate: cutoffDate.toISOString(),
      processingTimeMs: processingTime,
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