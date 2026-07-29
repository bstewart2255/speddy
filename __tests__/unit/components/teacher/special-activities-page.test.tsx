/**
 * @jest-environment jsdom
 */

/**
 * SPE-343: the teacher "Add Activity" form must offer only the activity names
 * the special_activities_activity_name_check constraint admits. The old
 * free-text input let a teacher submit anything — including the form's own
 * placeholder suggestion ("Art" vs the allowlisted "ART") — and surface a raw
 * Postgres constraint error. This pins the field as a picker over
 * SPECIAL_ACTIVITY_TYPES, the same vocabulary the provider form uses, and
 * that no free-text path to the constraint remains.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import TeacherSpecialActivitiesPage from '@/app/(dashboard)/dashboard/teacher/special-activities/page';
import { SPECIAL_ACTIVITY_TYPES } from '@/lib/constants/activity-types';

jest.mock('@/lib/supabase/queries/teacher-portal', () => ({
  getCurrentTeacher: async () => ({
    id: 'teacher-1',
    first_name: 'Test',
    last_name: 'Teacher',
    school_id: 'SCH-1',
  }),
  getMySpecialActivities: async () => [],
  createSpecialActivity: jest.fn(),
  deleteSpecialActivity: jest.fn(),
}));

jest.mock('@/lib/supabase/client', () => {
  // The page's school-wide list query awaits the end of a
  // select().eq().order().order() chain; a self-returning object that also
  // carries { data, error } satisfies every link and the final await.
  const chain: Record<string, unknown> = { data: [], error: null };
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  // One stable client: the real createClient caches a singleton, and the page
  // keys its fetch effect on the client's identity — a fresh object per call
  // would re-trigger the fetch on every render and pin the loading state.
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => chain,
  };
  return { createClient: () => client };
});

describe('TeacherSpecialActivitiesPage — activity name picker (SPE-343)', () => {
  it('offers exactly the constraint-approved activity names, with no free-text path', async () => {
    render(<TeacherSpecialActivitiesPage />);

    fireEvent.click(await screen.findByRole('button', { name: '+ Add Activity' }));

    const picker = screen.getByLabelText('Activity Name') as HTMLSelectElement;
    expect(picker.tagName).toBe('SELECT');

    const offered = Array.from(picker.options)
      .map(option => option.value)
      .filter(value => value !== '');
    expect(offered).toEqual([...SPECIAL_ACTIVITY_TYPES]);

    expect(document.querySelector('input[name="activity_name"]')).toBeNull();
  });
});
