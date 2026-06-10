import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get current rate limit stats. The upload_rate_limits timestamp column is
    // `uploaded_at` (not `created_at`).
    const { data: rateLimitStats, error: rateLimitError } = await supabase
      .from('upload_rate_limits')
      .select('uploaded_at')
      .order('uploaded_at', { ascending: false })
      .limit(1);

    // A health check that swallows query errors and still reports "healthy"
    // hides the exact regression it exists to catch (e.g. a wrong column).
    if (rateLimitError) {
      throw rateLimitError;
    }
    
    // Get analytics stats if enabled
    let analyticsStats: { lastEvent: string | null } | null = null;
    if (process.env.CLEANUP_ANALYTICS === 'true') {
      const { data, error } = await supabase
        .from('analytics_events')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!error && data) {
        analyticsStats = {
          lastEvent: data[0]?.created_at || null
        };
      }
    }
    
    // Calculate age of oldest rate limit record
    const { data: oldestRecord, error: oldestRecordError } = await supabase
      .from('upload_rate_limits')
      .select('uploaded_at')
      .order('uploaded_at', { ascending: true })
      .limit(1);

    if (oldestRecordError) {
      throw oldestRecordError;
    }

    const oldestAge = oldestRecord?.[0]?.uploaded_at
      ? Math.floor((Date.now() - new Date(oldestRecord[0].uploaded_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      rateLimits: {
        lastRecord: rateLimitStats?.[0]?.uploaded_at || null,
        oldestRecordAgeDays: oldestAge,
        needsCleanup: oldestAge > 7
      },
      analytics: analyticsStats,
      cleanupEnabled: {
        rateLimits: true,
        analytics: process.env.CLEANUP_ANALYTICS === 'true'
      }
    });
    
  } catch (error: any) {
    console.error('Health check error:', error);
    
    // Return a non-200 so monitoring actually surfaces a broken health check
    // instead of treating an error body as success.
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    }, { status: 503 });
  }
}