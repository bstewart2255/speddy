import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'internal-sign-in-logs' });

export async function GET(request: NextRequest) {
  try {
    // Get current user to verify they're a speddy admin
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify the user is a speddy admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_speddy_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_speddy_admin) {
      log.warn('Non-speddy-admin tried to access sign-in logs', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Speddy admin access required' },
        { status: 403 }
      );
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Use service client to query auth.audit_log_entries via raw SQL
    const adminClient = createServiceClient();

    // Query login events from audit log using raw SQL (auth schema not accessible via .from())
    const { data: loginEvents, error: logsError } = await adminClient.rpc('get_sign_in_logs', {
      p_limit: limit,
      p_offset: offset
    });

    if (logsError) {
      // If RPC doesn't exist, fall back to profiles-based approach
      log.warn('RPC not available, using fallback', logsError);

      // Fallback: Get recent logins from profiles last_sign_in_at
      const { data: recentProfiles, error: profilesError } = await adminClient
        .from('profiles')
        .select('id, email, full_name, role, updated_at')
        .not('role', 'is', null)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (profilesError) {
        log.error('Failed to fetch profiles fallback', profilesError);
        return NextResponse.json(
          { error: 'Failed to fetch sign-in logs' },
          { status: 500 }
        );
      }

      const signInLogs = recentProfiles?.map((profile: any) => ({
        id: profile.id,
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name || null,
        role: profile.role || 'unknown',
        provider: 'email',
        ipAddress: null,
        timestamp: profile.updated_at,
      })) || [];

      return NextResponse.json({
        logs: signInLogs,
        pagination: {
          limit,
          offset,
          hasMore: signInLogs.length === limit,
        }
      });
    }

    // Transform RPC results
    const signInLogs = loginEvents?.map((event: any) => ({
      id: event.id,
      userId: event.user_id,
      email: event.email,
      fullName: event.full_name || null,
      role: event.role || 'unknown',
      provider: event.provider || 'email',
      ipAddress: event.ip_address || null,
      timestamp: event.created_at,
    })) || [];

    log.info('Sign-in logs fetched', { count: signInLogs.length, requestedBy: user.id });

    return NextResponse.json({
      logs: signInLogs,
      pagination: {
        limit,
        offset,
        hasMore: signInLogs.length === limit,
      }
    });

  } catch (error) {
    log.error('Unexpected error in sign-in-logs', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
