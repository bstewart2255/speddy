// lib/api/with-error-handling.ts
import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/monitoring/logger';

type RouteHandler = (req: NextRequest) => Promise<NextResponse>;

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      log.error('API route error', error, {
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries())
      });

      // Don't expose internal error details in production
      const message = process.env.NODE_ENV === 'development' 
        ? (error as Error).message 
        : 'Internal server error';

      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  };
}
