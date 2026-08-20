/**
 * SPE-506 — `saveSessionInstance`'s duplicate-check queried
 * `.eq('start_time', session.start_time)` unconditionally. For an unscheduled
 * instance (`start_time` null — a real state, e.g. an auto-schedule
 * placeholder that was persisted before being placed), Postgres's `= NULL`
 * never matches any row, including one with `start_time IS NULL` — so the
 * idempotency check silently failed and a retried save (or a race with
 * another request) could insert a duplicate row. Fixed to use
 * `.is('start_time', null)` when null, matching Postgres NULL semantics.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SessionGenerator } from '@/lib/services/session-generator';

jest.mock('@/lib/monitoring/logger', () => ({
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

/** Records every filter call so the test can assert eq vs. is was used. */
function makeSupabase(existing: { id: string } | null) {
  const calls: Array<{ method: string; column: string; value: unknown }> = [];
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      calls.push({ method: 'eq', column, value });
      return builder;
    },
    is: (column: string, value: unknown) => {
      calls.push({ method: 'is', column, value });
      return builder;
    },
    maybeSingle: async () => ({ data: existing, error: null }),
  };
  return { supabase: { from: jest.fn(() => builder) } as unknown as SupabaseClient<any>, calls };
}

const UNSCHEDULED_TEMP_SESSION = {
  id: 'temp-abc',
  student_id: 'student-1',
  provider_id: 'provider-1',
  session_date: '2026-08-20',
  start_time: null,
  end_time: null,
  day_of_week: null,
  service_type: 'resource',
  assigned_to_sea_id: null,
  assigned_to_specialist_id: null,
  delivered_by: 'provider',
  completed_at: null,
  completed_by: null,
  session_notes: null,
  group_id: null,
  group_name: null,
  group_color: null,
} as any;

describe('SessionGenerator.saveSessionInstance duplicate check (SPE-506)', () => {
  it('uses .is(start_time, null) rather than .eq(start_time, null) for an unscheduled instance', async () => {
    const { supabase, calls } = makeSupabase({ id: 'existing-row' });
    const generator = new SessionGenerator(supabase);

    const result = await generator.saveSessionInstance(UNSCHEDULED_TEMP_SESSION);

    expect(result).toEqual({ id: 'existing-row' });
    const startTimeCall = calls.find((c) => c.column === 'start_time');
    expect(startTimeCall?.method).toBe('is');
    expect(startTimeCall?.value).toBeNull();
    expect(calls.some((c) => c.method === 'eq' && c.column === 'start_time')).toBe(false);
  });

  it('rejects a session with no student_id rather than issuing a matchless query', async () => {
    const { supabase } = makeSupabase(null);
    const generator = new SessionGenerator(supabase);

    const result = await generator.saveSessionInstance({
      ...UNSCHEDULED_TEMP_SESSION,
      student_id: null,
    });

    expect(result).toBeNull();
  });
});
