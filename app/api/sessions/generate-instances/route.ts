import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createInstancesFromTemplate, getSchoolYearEndDate, InstanceGenerationOptions } from '@/lib/services/session-instance-generator';
import { log } from '@/lib/monitoring/logger';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import type { Database } from '@/src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

/**
 * API endpoint to generate instances from a template session
 * POST /api/sessions/generate-instances
 * Body: {
 *   sessionId: string,
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

    const body = await request.json();
    const { sessionId, weeksAhead, useSchoolYearEnd = true, untilDate } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Build options from request body
    const options: InstanceGenerationOptions = {};
    if (untilDate) {
      options.untilDate = new Date(untilDate);
    } else if (weeksAhead !== undefined) {
      options.weeksAhead = weeksAhead;
    } else {
      options.useSchoolYearEnd = useSchoolYearEnd;
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

    log.info('[GenerateInstances] Generating instances for session', {
      userId: user.id,
      sessionId,
      endDate: endDateStr,
      options
    });

    // Fetch the template session
    const { data: templateSession, error: fetchError } = await supabase
      .from('schedule_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchError || !templateSession) {
      log.error('[GenerateInstances] Error fetching template session', fetchError);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Generate instances
    const result = await createInstancesFromTemplate(templateSession as ScheduleSession, options);

    if (!result.success) {
      log.error('[GenerateInstances] Failed to generate instances', {
        sessionId,
        error: result.error
      });
      return NextResponse.json({ error: result.error || 'Failed to generate instances' }, { status: 500 });
    }

    log.info('[GenerateInstances] Instances generated successfully', {
      userId: user.id,
      sessionId,
      instancesCreated: result.instancesCreated,
      endDate: endDateStr
    });

    return NextResponse.json({
      success: true,
      instancesCreated: result.instancesCreated,
      instances: result.instances,
      endDate: endDateStr
    });
  } catch (error) {
    log.error('[GenerateInstances] Error in generate-instances route', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
