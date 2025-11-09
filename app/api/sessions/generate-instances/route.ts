import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createInstancesFromTemplate } from '@/lib/services/session-instance-generator';
import { log } from '@/lib/monitoring/logger';
import type { Database } from '@/src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

/**
 * API endpoint to generate instances from a template session
 * POST /api/sessions/generate-instances
 * Body: { sessionId: string, weeksAhead?: number }
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
    const { sessionId, weeksAhead = 8 } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    log.info('[GenerateInstances] Generating instances for session', {
      userId: user.id,
      sessionId,
      weeksAhead
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
    const result = await createInstancesFromTemplate(templateSession as ScheduleSession, weeksAhead);

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
      instancesCreated: result.instancesCreated
    });

    return NextResponse.json({
      success: true,
      instancesCreated: result.instancesCreated,
      instances: result.instances
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
