import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type { Database } from '../../../src/types/database';

type MainstreamingBlock = Database['public']['Tables']['mainstreaming_blocks']['Row'];

export interface MainstreamingBlockInput {
  student_id: string;
  teacher_id: string;
  school_id: string;
  start_time: string;
  end_time: string;
  label?: string | null;
}

/**
 * Insert mainstreaming blocks for the authenticated provider — one row per
 * selected weekday (SPE-478). RLS enforces ownership and the caseload check;
 * this asserts rows actually persisted rather than trusting a 2xx, because
 * PostgREST reports an RLS-filtered write as success with an empty body.
 */
export async function addMainstreamingBlocks(
  input: MainstreamingBlockInput,
  daysOfWeek: number[]
): Promise<MainstreamingBlock[]> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_add_mainstreaming_blocks' }
  );
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }
  const user = authResult.data.data.user;

  const rows = daysOfWeek.map(day => ({
    provider_id: user.id,
    student_id: input.student_id,
    teacher_id: input.teacher_id,
    school_id: input.school_id,
    day_of_week: day,
    start_time: input.start_time,
    end_time: input.end_time,
    label: input.label || null,
    school_year: getCurrentSchoolYear(),
  }));

  const insertPerf = measurePerformanceWithAlerts('add_mainstreaming_blocks', 'database');
  const insertResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('mainstreaming_blocks')
        .insert(rows)
        .select();
      if (error) throw error;
      if (!data || data.length !== rows.length) {
        throw new Error(
          `Mainstreaming blocks not saved (${data?.length ?? 0} of ${rows.length} persisted) — likely blocked by row-level security`
        );
      }
      return data;
    },
    {
      operation: 'add_mainstreaming_blocks',
      userId: user.id,
      studentId: input.student_id,
      teacherId: input.teacher_id,
      days: daysOfWeek.join(','),
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) throw insertResult.error;
  return insertResult.data!;
}

/**
 * Fetch all mainstreaming blocks at a school for the current school year.
 * School-wide on purpose: every provider schedules around them (the SELECT
 * policy scopes access to the caller's schools).
 */
export async function getMainstreamingBlocks(
  schoolId: string,
  schoolYear?: string
): Promise<MainstreamingBlock[]> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_mainstreaming_blocks', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('mainstreaming_blocks')
        .select('*')
        .eq('school_id', schoolId)
        .eq('school_year', schoolYear || getCurrentSchoolYear())
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_mainstreaming_blocks', schoolId }
  );
  fetchPerf.end({
    success: !fetchResult.error,
    metadata: { recordCount: fetchResult.data?.length || 0 },
  });

  if (fetchResult.error) throw fetchResult.error;
  return fetchResult.data || [];
}

/**
 * Delete one mainstreaming block owned by the current user. The explicit
 * owner filter plus the returned-row check make an RLS-filtered no-op fail
 * loudly instead of reporting success.
 */
export async function deleteMainstreamingBlock(id: string): Promise<void> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_mainstreaming_block' }
  );
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }
  const user = authResult.data.data.user;

  const deletePerf = measurePerformanceWithAlerts('delete_mainstreaming_block', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('mainstreaming_blocks')
        .delete()
        .eq('id', id)
        .eq('provider_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Mainstreaming block not found or not yours to delete');
      }
      return null;
    },
    { operation: 'delete_mainstreaming_block', userId: user.id, blockId: id }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}
