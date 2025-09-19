import { NextRequest, NextResponse } from 'next/server';

// Silently handle HEAD requests without logging
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, { 
    status: 200, 
    headers: { 'Cache-Control': 'no-store' } 
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'API is running',
    timestamp: new Date().toISOString(),
    health: '/api/health'
  }, { 
    headers: { 'Cache-Control': 'no-store' } 
  });
}