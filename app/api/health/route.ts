import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Health check endpoint for connectivity testing
 * 
 * Provides a simple endpoint to test API connectivity and basic system health.
 * Used by the connectivity testing utilities to diagnose "can't connect to server" issues.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Test database connectivity
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('worksheets')
      .select('id')
      .limit(1);

    const responseTime = Date.now() - startTime;
    
    if (error) {
      console.error('Health check database error:', error);
      return NextResponse.json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        responseTime,
        services: {
          api: 'healthy',
          database: 'unhealthy',
          error: error.message
        }
      }, { status: 503 });
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      services: {
        api: 'healthy',
        database: 'healthy'
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Health check error:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      services: {
        api: 'healthy',
        database: 'unhealthy'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}

// Also support HEAD requests for basic connectivity tests
export async function HEAD(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('worksheets')
      .select('id')
      .limit(1);
    
    if (error) {
      return new NextResponse(null, { status: 503 });
    }
    
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}