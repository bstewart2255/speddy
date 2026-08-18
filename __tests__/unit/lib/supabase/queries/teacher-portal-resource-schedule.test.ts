/**
 * SPE-43: getStudentResourceSchedule used to fetch every active session for a
 * student and let the page filter out past dates client-side after the fact.
 * The query now applies the "today or later" cutoff itself via `.gte()`, so
 * past sessions never cross the wire.
 *
 * This pins two things a page-level check can't:
 *   - the query is given the cutoff as a local calendar date (not a UTC one,
 *     which would drift the cutoff by a day for users behind UTC in the
 *     evening — the exact bug a naive `toISOString()` cutoff would introduce);
 *   - a session dated yesterday is excluded and today/tomorrow are kept, i.e.
 *     the filter actually narrows the result set rather than being a no-op.
 */
import { getStudentResourceSchedule } from '@/lib/supabase/queries/teacher-portal';

const STUDENT_ID = 'student-1';

function localISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(now.getDate() - 1);
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);

interface Row {
  id: string;
  session_date: string;
}

const rows: Row[] = [
  { id: 'past', session_date: localISO(yesterday) },
  { id: 'today', session_date: localISO(now) },
  { id: 'future', session_date: localISO(tomorrow) },
];

const gteSpy = jest.fn();

function makeSessionsQueryable() {
  let filtered = [...rows];
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    not: () => api,
    gte: (col: string, val: string) => {
      gteSpy(col, val);
      filtered = filtered.filter((r) => r.session_date >= val);
      return api;
    },
    order: () => api,
    then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: filtered, error: null }),
  };
  return api;
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: async (fn: string) =>
      fn === 'get_teacher_student_ids'
        ? { data: [STUDENT_ID], error: null }
        : { data: null, error: null },
    from: (table: string) => {
      if (table === 'schedule_sessions') {
        return makeSessionsQueryable();
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  }),
}));

jest.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: () => ({ end: () => {} }),
}));

describe('getStudentResourceSchedule (SPE-43)', () => {
  beforeEach(() => gteSpy.mockClear());

  it('filters to today-or-later at the database level using a local calendar date', async () => {
    await getStudentResourceSchedule(STUDENT_ID);

    expect(gteSpy).toHaveBeenCalledWith('session_date', localISO(now));
  });

  it('excludes past sessions and keeps today/future ones', async () => {
    const result = await getStudentResourceSchedule(STUDENT_ID);

    expect(result.map((r: { id: string }) => r.id)).toEqual(['today', 'future']);
  });
});
