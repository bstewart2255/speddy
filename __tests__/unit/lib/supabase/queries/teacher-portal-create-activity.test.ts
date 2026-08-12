/**
 * SPE-335: the teacher create path must stamp the CURRENT school year.
 *
 * `special_activities.school_year` is NOT NULL. The provider Special Activities
 * page filters on getCurrentSchoolYear(), so a row written for the wrong year
 * disappears from the provider's view — the teacher sees their activity, the
 * resource specialist scheduling around it does not.
 *
 * The column used to default to a hardcoded '2025-2026', which made "fell back
 * to the default" and "invisible" the same thing once the year rolled over on
 * August 1 (SPE-459 had to recover 819 such rows). SPE-460 replaced that
 * default with public.current_school_year(), so the fallback is now correct —
 * but stamping the year explicitly is still the contract this test pins, since
 * the app should not depend on the database to know what year it is.
 *
 * This is a mock-level test on purpose: it pins the shape of the insert
 * payload, which is the part RLS cannot tell us anything about. Whether the
 * database accepts the write at all is covered by the sim-district walk.
 */
import { createSpecialActivity } from '@/lib/supabase/queries/teacher-portal';
import { getCurrentSchoolYear } from '@/lib/school-year';

const insert = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'teachers') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'teacher-1', school_id: 'SCH-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert: (rows: unknown) => {
          insert(rows);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'activity-1' }, error: null }),
            }),
          };
        },
      };
    },
  }),
}));

jest.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: () => ({ end: () => {} }),
}));

const activityInput = {
  teacher_name: 'Nora Ellison',
  day_of_week: 1,
  start_time: '09:15',
  end_time: '09:45',
  activity_name: 'Library',
  school_id: 'SCH-1',
};

describe('createSpecialActivity', () => {
  beforeEach(() => insert.mockClear());

  it('stamps the current school year rather than falling back to the column default', async () => {
    await createSpecialActivity(activityInput);

    const [[rows]] = insert.mock.calls;
    expect(rows[0].school_year).toBe(getCurrentSchoolYear());
  });

  it('writes the teacher ownership columns the RLS policy requires', async () => {
    await createSpecialActivity(activityInput);

    const [[rows]] = insert.mock.calls;
    expect(rows[0]).toMatchObject({
      teacher_id: 'teacher-1',
      created_by_role: 'teacher',
      created_by_id: 'user-1',
      provider_id: null,
    });
  });
});
