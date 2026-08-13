/**
 * @jest-environment jsdom
 */

/**
 * SPE-482: the coverage note is only useful if the caseload actually reaches
 * the picker, and it travels through three components to get there
 * (page -> ScheduleHeader -> ScheduleSessions -> AutoScheduleOptionsModal).
 *
 * That wire has already broken silently once: ScheduleHeader accepted no
 * `students` prop at all, so the page's caseload was dropped on the floor with
 * no type error and no test failure — the feature rendered nothing in
 * production while its unit tests passed, because those tests handed props
 * straight to the modal.
 *
 * This drives the chain from the top component down, so a dropped prop fails
 * here rather than in front of a provider.
 */

import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'provider-1' } } }) },
    from: () => {
      const chain: any = {};
      for (const op of ['select', 'eq', 'in', 'is', 'not', 'order']) chain[op] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null }));
      return chain;
    },
  }),
}));

jest.mock('@/lib/supabase/hooks/use-auto-schedule', () => ({
  useAutoSchedule: () => ({
    scheduleBatchStudents: jest.fn(),
    placeSessionsManually: jest.fn(),
  }),
}));

jest.mock('@/app/components/schedule/undo-schedule', () => ({
  saveScheduleSnapshot: jest.fn(),
  saveScheduledSessionIds: jest.fn(),
  UndoSchedule: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScheduleHeader } = require('@/app/(dashboard)/dashboard/schedule/components/schedule-header');

/** The caseload shape that exposed this: grades recorded, teachers blank. */
const CASELOAD = [
  { grade_level: '5', teacher_id: null, teacher_name: null },
  { grade_level: '5', teacher_id: null, teacher_name: null },
  { grade_level: '3', teacher_id: null, teacher_name: null },
];

function openPicker(students?: Array<Record<string, unknown>>) {
  render(
    <ScheduleHeader
      unscheduledCount={5}
      unscheduledPanelCount={5}
      currentSchool={{ school_site: 'Bancroft', school_district: 'MDUSD' }}
      onScheduleComplete={() => {}}
      students={students}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Auto-Schedule Sessions/i }));
}

describe('the caseload reaches the picker through the component chain (SPE-482)', () => {
  it('shows the teacher warning when the header is given the caseload', () => {
    openPicker(CASELOAD);
    expect(screen.getByTestId('strategy-coverage-teacher-grouped').textContent).toMatch(
      /None of your 3 students/i
    );
  });

  it('shows grade coverage from that same caseload', () => {
    openPicker(CASELOAD);
    expect(screen.getByTestId('strategy-coverage-grade-grouped').textContent).toMatch(
      /2 of 3 students share a grade/i
    );
  });

  it('renders no coverage note when the header is given no caseload', () => {
    // The pre-fix production behaviour. Pinned so a future prop drop is a
    // failure here and not a silently blank picker.
    openPicker(undefined);
    expect(screen.queryByTestId('strategy-coverage-teacher-grouped')).toBeNull();
  });
});
