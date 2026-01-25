import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInstancesForAllTemplates, getSchoolYearEndDate, InstanceGenerationOptions } from '@/lib/services/session-instance-generator';
import { log } from '@/lib/monitoring/logger';
import { formatDateLocal } from '@/lib/utils/date-helpers';

/**
 * Migration endpoint to generate instances from existing template sessions
 * This should be called to backfill instances for all templates through school year end
 *
 * Usage: POST /api/migrations/generate-instances
 * Optional body: {
 *   weeksAhead?: number,           // Deprecated: use useSchoolYearEnd instead
 *   useSchoolYearEnd?: boolean,    // Default: true - generate through June 30
 *   untilDate?: string             // Optional: specific end date (YYYY-MM-DD)
 * }
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

    // Get options from request body
    const body = await request.json().catch(() => ({}));

    // Build options from request body
    const options: InstanceGenerationOptions = {};
    if (body.untilDate) {
      options.untilDate = new Date(body.untilDate);
    } else if (body.weeksAhead !== undefined) {
      options.weeksAhead = body.weeksAhead;
    } else {
      // Default: use school year end (June 30)
      options.useSchoolYearEnd = body.useSchoolYearEnd !== false;
    }

    // Calculate end date for logging
    let endDate: Date;
    if (options.untilDate) {
      endDate = options.untilDate;
    } else if (options.weeksAhead !== undefined) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + (options.weeksAhead * 7));
    } else {
      endDate = getSchoolYearEndDate();
    }
    const endDateStr = formatDateLocal(endDate);

    log.info('[Migration] Starting instance generation for all templates', {
      userId: user.id,
      endDate: endDateStr,
      options
    });

    // Generate instances for all templates
    const result = await generateInstancesForAllTemplates(options);

    log.info('[Migration] Instance generation completed', {
      userId: user.id,
      total: result.total,
      created: result.created,
      endDate: result.endDate,
      errorCount: result.errors.length
    });

    return NextResponse.json({
      success: true,
      message: `Generated instances for ${result.total} templates through ${result.endDate}`,
      total: result.total,
      created: result.created,
      endDate: result.endDate,
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
 * Returns count of templates and instances, plus school year end info
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

    // Count future instances (from today onwards)
    const today = formatDateLocal(new Date());
    const { count: futureInstanceCount, error: futureError } = await supabase
      .from('schedule_sessions')
      .select('*', { count: 'exact', head: true })
      .not('session_date', 'is', null)
      .gte('session_date', today);

    if (futureError) {
      log.error('[Migration] Error counting future instances', futureError);
    }

    // Calculate school year end info
    const schoolYearEndDate = getSchoolYearEndDate();
    const schoolYearEndStr = formatDateLocal(schoolYearEndDate);

    // Calculate weeks until school year end
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const diffMs = schoolYearEndDate.getTime() - todayDate.getTime();
    const weeksUntilEnd = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7));

    return NextResponse.json({
      templates: templateCount || 0,
      instances: instanceCount || 0,
      futureInstances: futureInstanceCount || 0,
      migrationNeeded: (templateCount || 0) > 0 && (instanceCount || 0) === 0,
      schoolYearEnd: schoolYearEndStr,
      weeksUntilSchoolYearEnd: weeksUntilEnd
    });
  } catch (error) {
    log.error('[Migration] Error checking migration status', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
