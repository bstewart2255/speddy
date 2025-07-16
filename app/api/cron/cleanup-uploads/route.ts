import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check for authentication token
    const token = request.nextUrl.searchParams.get('token') || 
                  request.headers.get('x-cron-secret');
    
    const expectedToken = process.env.CRON_SECRET;
    
    if (!expectedToken) {
      console.error('CRON_SECRET environment variable not set');
      return NextResponse.json({
        success: false,
        error: 'Server configuration error',
        timestamp: new Date().toISOString()
      }, { status: 200 }); // Return 200 to prevent retries
    }
    
    if (!token || token !== expectedToken) {
      console.warn('Unauthorized cleanup attempt');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }
    
    // Initialize Supabase client
    const supabase = await createClient();
    
    // Calculate cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    // Delete old rate limit records
    const { data: deletedRecords, error: deleteError, count } = await supabase
      .from('upload_rate_limits')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id');
    
    if (deleteError) {
      console.error('Error deleting old rate limit records:', deleteError);
      return NextResponse.json({
        success: false,
        error: 'Database error during cleanup',
        details: deleteError.message,
        timestamp: new Date().toISOString()
      }, { status: 200 }); // Return 200 to prevent retries
    }
    
    const deletedCount = deletedRecords?.length || 0;
    const processingTime = Date.now() - startTime;
    
    // Log the cleanup action
    console.log(`Rate limit cleanup completed: ${deletedCount} records deleted in ${processingTime}ms`);
    
    // Optionally, also clean up old analytics events (older than 90 days)
    const analyticsEnabled = process.env.CLEANUP_ANALYTICS === 'true';
    let analyticsDeleted = 0;
    
    if (analyticsEnabled) {
      const analyticsCutoffDate = new Date();
      analyticsCutoffDate.setDate(analyticsCutoffDate.getDate() - 90);
      
      const { data: deletedAnalytics, error: analyticsError } = await supabase
        .from('analytics_events')
        .delete()
        .lt('created_at', analyticsCutoffDate.toISOString())
        .select('id');
      
      if (analyticsError) {
        console.error('Error deleting old analytics records:', analyticsError);
      } else {
        analyticsDeleted = deletedAnalytics?.length || 0;
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
    
    // Always return 200 to prevent cron service from retrying
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during cleanup',
      details: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 200 });
  }
}

// Also support POST for flexibility with different cron services
export async function POST(request: NextRequest) {
  return GET(request);
}