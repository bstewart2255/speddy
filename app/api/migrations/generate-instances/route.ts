import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInstancesForAllTemplates } from '@/lib/services/session-instance-generator';
import { log } from '@/lib/monitoring/logger';

/**
 * Migration endpoint to generate instances from existing template sessions
 * This should be called once to migrate from template-only to instance-based architecture
 *
 * Usage: POST /api/migrations/generate-instances
 * Optional body: { weeksAhead: number } (defaults to 8)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an admin (optional security check)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      log.warn('[Migration] Non-admin user attempted to run migration', { userId: user.id });
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get weeks ahead from request body (optional)
    const body = await request.json().catch(() => ({}));
    const weeksAhead = body.weeksAhead || 8;

    log.info('[Migration] Starting instance generation for all templates', {
      userId: user.id,
      weeksAhead
    });

    // Generate instances for all templates
    const result = await generateInstancesForAllTemplates(weeksAhead);

    log.info('[Migration] Instance generation completed', {
      userId: user.id,
      total: result.total,
      created: result.created,
      errorCount: result.errors.length
    });

    return NextResponse.json({
      success: true,
      message: `Generated instances for ${result.total} templates`,
      total: result.total,
      created: result.created,
      errors: result.errors
    });
  } catch (error) {
    log.error('[Migration] Error generating instances', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check migration status
 * Returns count of templates and instances
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Count templates (session_date = NULL)
    const { count: templateCount, error: templateError } = await supabase
      .from('schedule_sessions')
      .select('*', { count: 'exact', head: true })
      .is('session_date', null)
      .not('day_of_week', 'is', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null);

    if (templateError) {
      log.error('[Migration] Error counting templates', templateError);
      return NextResponse.json({ error: 'Failed to count templates' }, { status: 500 });
    }

    // Count instances (session_date with dates)
    const { count: instanceCount, error: instanceError } = await supabase
      .from('schedule_sessions')
      .select('*', { count: 'exact', head: true })
      .not('session_date', 'is', null);

    if (instanceError) {
      log.error('[Migration] Error counting instances', instanceError);
      return NextResponse.json({ error: 'Failed to count instances' }, { status: 500 });
    }

    return NextResponse.json({
      templates: templateCount || 0,
      instances: instanceCount || 0,
      migrationNeeded: (templateCount || 0) > 0 && (instanceCount || 0) === 0
    });
  } catch (error) {
    log.error('[Migration] Error checking migration status', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
