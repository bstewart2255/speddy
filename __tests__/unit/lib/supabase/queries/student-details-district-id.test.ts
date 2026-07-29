/**
 * SPE-339: the district student id lives on `students`, but is loaded and saved
 * through the student-details pair the modal uses.
 *
 * The case that matters is a student with NO `student_details` row (pre-existing
 * rows, roster-template and manual-add students — SPE-284). If the load returned
 * null there, the modal would render a blank form and write that blank straight
 * back over a stored id on the next save.
 */
import { getStudentDetails } from '@/lib/supabase/queries/student-details';

let detailsRow: Record<string, unknown> | null = null;
let studentRow: Record<string, unknown> | null = null;

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'student_details') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: detailsRow, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: studentRow, error: null }),
          }),
        }),
      };
    },
  }),
}));

jest.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: () => ({ end: () => {} }),
}));

describe('getStudentDetails — district student id', () => {
  beforeEach(() => {
    detailsRow = null;
    studentRow = null;
  });

  it('returns the stored id alongside the details when both exist', async () => {
    detailsRow = { first_name: 'Ana', last_name: 'Alvarez', iep_goals: ['g'] };
    studentRow = { district_student_id: '100001' };

    const details = await getStudentDetails('s1');

    expect(details?.district_student_id).toBe('100001');
    expect(details?.first_name).toBe('Ana');
  });

  it('still returns the id for a student that has no details row yet', async () => {
    detailsRow = null;
    studentRow = { district_student_id: '100001' };

    const details = await getStudentDetails('s1');

    // Not null — otherwise the modal blanks the field and the next save wipes it.
    expect(details).not.toBeNull();
    expect(details?.district_student_id).toBe('100001');
    expect(details?.first_name).toBe('');
  });

  it('returns an empty id, not null, when the student simply has no id yet', async () => {
    detailsRow = null;
    studentRow = { district_student_id: null };

    const details = await getStudentDetails('s1');

    expect(details).not.toBeNull();
    expect(details?.district_student_id).toBe('');
  });

  it('returns null when the student does not exist at all', async () => {
    detailsRow = null;
    studentRow = null;

    expect(await getStudentDetails('missing')).toBeNull();
  });
});
