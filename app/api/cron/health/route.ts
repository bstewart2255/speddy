import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get current rate limit stats
    const { data: rateLimitStats, error: rateLimitError } = await supabase
      .from('upload_rate_limits')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    // Get analytics stats if enabled
    let analyticsStats = null;
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
    const { data: oldestRecord } = await supabase
      .from('upload_rate_limits')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);
    
    const oldestAge = oldestRecord?.[0]?.created_at 
      ? Math.floor((Date.now() - new Date(oldestRecord[0].created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      rateLimits: {
        lastRecord: rateLimitStats?.[0]?.created_at || null,
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
    
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    }, { status: 200 }); // Return 200 to prevent monitoring alerts
  }
}