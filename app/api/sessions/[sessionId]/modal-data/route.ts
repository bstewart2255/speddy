import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withRoute } from '@/lib/api/with-route';

const querySchema = z.object({
  session_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  group_id: z.string().optional(),
});

export const GET = withRoute<{ sessionId: string }, undefined, z.infer<typeof querySchema>>(
  { query: querySchema },
  async ({ userId, query, params }) => {
    const perf = measurePerformanceWithAlerts('get_session_modal_data', 'api');
    const { sessionId } = params;
    const { session_date: sessionDate, start_time: startTime, end_time: endTime, group_id: groupId } = query;

    try {
      const supabase = await createClient();

      log.info('Fetching consolidated session modal data', {
        userId,
        sessionId,
        sessionDate,
        groupId
      });

      const timeSlot = startTime && endTime ? `${startTime}-${endTime}` : null;

      const results = await Promise.all([
        sessionDate && timeSlot
          ? supabase
              .from('lessons')
              .select('*')
              .eq('provider_id', userId)
              .eq('lesson_date', sessionDate)
              .eq('time_slot', timeSlot)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        sessionDate
          ? supabase
              .from('documents')
              .select('*')
              .eq('documentable_type', 'session')
              .eq('documentable_id', sessionId)
              .eq('session_date', sessionDate)
              .order('created_at', { ascending: false })
          : supabase
              .from('documents')
              .select('*')
              .eq('documentable_type', 'session')
              .eq('documentable_id', sessionId)
              .order('created_at', { ascending: false }),

        supabase
          .from('curriculum_tracking')
          .select('*')
          .eq('session_id', sessionId)
          .maybeSingle()
      ]);

      const [lessonResult, documentsResult, curriculumResult] = results;

      if (lessonResult.error) {
        log.warn('Error fetching lesson in modal data', { error: lessonResult.error, userId, sessionId });
      }
      if (documentsResult.error) {
        log.warn('Error fetching documents in modal data', { error: documentsResult.error, userId, sessionId });
      }
      if (curriculumResult.error) {
        log.warn('Error fetching curriculum in modal data', { error: curriculumResult.error, userId, sessionId });
      }

      perf.end({ success: true });
      return NextResponse.json({
        lesson: lessonResult.data || null,
        documents: documentsResult.data || [],
        curriculum: curriculumResult.data || null
      });
    } catch (error) {
      log.error('Error in get-session-modal-data route', error, { userId, sessionId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
