/**
 * SPE-485: bell-schedule drag warnings are SCHOOL-WIDE, not creator-scoped.
 *
 * `checkBellScheduleConflicts` filtered `.eq('provider_id', providerId)` — the
 * same legacy quirk SPE-484 removed from the special-activity check. A bell
 * schedule loaded by a site admin (Rodeo Hills, SPE-462) rendered as a band but
 * warned nobody else on drag.
 *
 * What these pin, in the order they'd regress:
 *   - NO provider_id filter ever reaches the bell_schedules query (the bug);
 *   - another provider's / an admin's block still raises a conflict;
 *   - the query is year-scoped (a prior year's grid must not warn);
 *   - legacy rows (school_id IS NULL, keyed by school_site) are still found —
 *     60 of 783 production rows, the regression SPE-484 hit when it first
 *     dropped its own provider filter;
 *   - class periods stay non-conflicting (SPE-491) and grade matching is intact.
 */
import type { Database } from '@/src/types';

type BellRow = Database['public']['Tables']['bell_schedules']['Row'];

type StudentRow = {
  grade_level: string | null;
  school_id: string | null;
  school_site: string | null;
};

/** Filters captured per `from()` call, so a test can assert what was NOT sent. */
type Captured = { table: string; eq: Record<string, unknown>; is: Record<string, unknown> };

const state: { student: StudentRow | null; bells: BellRow[]; captured: Captured[] } = {
  student: null,
  bells: [],
  captured: [],
};

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const rec: Captured = { table, eq: {}, is: {} };
      state.captured.push(rec);
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => { rec.eq[col] = val; return builder; },
        is: (col: string, val: unknown) => { rec.is[col] = val; return builder; },
        single: () => Promise.resolve({ data: state.student, error: null }),
        then: (resolve: (r: unknown) => unknown) => {
          // Serve the branch this call actually asked for: the normalized pass
          // filters school_id; the legacy pass sets school_id IS NULL and keys
          // on school_site. Mirroring that here is what lets the legacy-row
          // test fail if the second pass is ever dropped.
          const rows = state.bells.filter(b => {
            if ('school_id' in rec.is) return b.school_id === null && b.school_site === rec.eq.school_site;
            return b.school_id === rec.eq.school_id;
          }).filter(b =>
            b.day_of_week === rec.eq.day_of_week && b.school_year === rec.eq.school_year
          );
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  }),
}));

jest.mock('@/lib/school-year', () => ({
  ...jest.requireActual('@/lib/school-year'),
  getCurrentSchoolYear: () => '2026-2027',
}));

import { SessionUpdateService } from '@/lib/services/session-update-service';

const bell = (over: Partial<BellRow> = {}): BellRow => ({
  id: `bell-${Math.random()}`,
  provider_id: 'someone-else',
  grade_level: '3',
  day_of_week: 1,
  start_time: '10:00:00',
  end_time: '10:20:00',
  period_name: 'Recess',
  school_id: 'school-A',
  school_site: null,
  school_year: '2026-2027',
  created_at: null,
  updated_at: null,
  state_id: null,
  district_id: null,
  content_hash: null,
  created_by_id: null,
  created_by_role: null,
  ...over,
} as unknown as BellRow);

/** Drive the private method under test directly. */
function check(svc: SessionUpdateService, day = 1, start = '10:05', end = '10:15') {
  return (svc as unknown as {
    checkBellScheduleConflicts: (
      studentId: string, day: number, startTime: string, endTime: string
    ) => Promise<{ type: string; description: string } | null>;
  }).checkBellScheduleConflicts('stu-1', day, start, end);
}

describe('checkBellScheduleConflicts scope (SPE-485)', () => {
  beforeEach(() => {
    state.student = { grade_level: '3', school_id: 'school-A', school_site: 'Rodeo Hills' };
    state.bells = [];
    state.captured = [];
  });

  it('never filters bell_schedules by provider_id', async () => {
    state.bells = [bell()];
    await check(new SessionUpdateService());

    const bellQueries = state.captured.filter(c => c.table === 'bell_schedules');
    expect(bellQueries.length).toBeGreaterThan(0);
    for (const q of bellQueries) {
      expect(q.eq).not.toHaveProperty('provider_id');
      expect(q.is).not.toHaveProperty('provider_id');
    }
  });

  it('warns about a block created by a DIFFERENT provider (the admin-loaded case)', async () => {
    state.bells = [bell({ provider_id: 'site-admin-999', period_name: 'Recess' })];

    const result = await check(new SessionUpdateService());

    expect(result).not.toBeNull();
    expect(result!.type).toBe('bell_schedule');
    expect(result!.description).toContain('Recess');
  });

  it('scopes the query to the current school year', async () => {
    state.bells = [bell({ school_year: '2025-2026' })]; // last year's grid

    const result = await check(new SessionUpdateService());

    expect(result).toBeNull();
    const bellQueries = state.captured.filter(c => c.table === 'bell_schedules');
    for (const q of bellQueries) {
      expect(q.eq.school_year).toBe('2026-2027');
    }
  });

  it('still finds legacy rows carrying only school_site (school_id IS NULL)', async () => {
    state.bells = [bell({ school_id: null, school_site: 'Rodeo Hills', period_name: 'Lunch' })];

    const result = await check(new SessionUpdateService());

    expect(result).not.toBeNull();
    expect(result!.description).toContain('Lunch');
  });

  it('does not treat a secondary class period as a conflict (SPE-491)', async () => {
    state.bells = [bell({ period_name: 'Period 3' })];
    expect(await check(new SessionUpdateService())).toBeNull();
  });

  it('only warns when the student grade is in the block grade list', async () => {
    state.bells = [bell({ grade_level: '1,2,4' })]; // student is grade 3
    expect(await check(new SessionUpdateService())).toBeNull();

    state.captured = [];
    state.bells = [bell({ grade_level: '1,3,4' })];
    expect(await check(new SessionUpdateService())).not.toBeNull();
  });

  it('returns null when the student has no school linkage at all', async () => {
    state.student = { grade_level: '3', school_id: null, school_site: null };
    state.bells = [bell()];

    expect(await check(new SessionUpdateService())).toBeNull();
    expect(state.captured.filter(c => c.table === 'bell_schedules')).toHaveLength(0);
  });
});
