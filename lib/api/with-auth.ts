// lib/api/with-auth.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withErrorHandling } from './with-error-handling';

type AuthenticatedRouteHandler = (
  req: NextRequest, 
  userId: string
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedRouteHandler) {
  return withErrorHandling(async (req: NextRequest) => {
    const supabase = await createClient();

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return handler(req, user.id);
  });
}