/**
 * @jest-environment jsdom
 */

/**
 * A student with NO service minutes must READ as having none.
 *
 * Their stored pair is 0/0 (goals imported with no Deliveries file). Neither
 * dropdown carried an option for 0, and a `<select>` whose value matches no
 * option falls back to showing its first one — so "not configured" rendered as
 * a confident "1 session, 15 minutes" that nobody had chosen.
 *
 * Two halves, both pinned here because the fixture cannot reach this state (it
 * seeds no unconfigured student, and only the goals import creates one), so
 * the sim walk covers the configured case and these cover the unset one:
 *
 *   1. Display — the selected option says "Not configured", and it cannot be
 *      chosen deliberately.
 *   2. Save — the 0/0 pair is left OUT of the update. Sending it back is
 *      refused by the students table's `> 0` check constraints, which would
 *      fail the whole tab: grade, IEP dates and all. (Verified against the
 *      real constraints by the signed-in probe on this branch; here we pin the
 *      payload the modal builds.)
 *
 * All data fictional.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentDetailsModal } from '@/app/components/students/student-details-modal';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'provider-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

jest.mock('../../../../lib/supabase/queries/student-details', () => ({
  getStudentDetails: jest.fn(async () => ({
    first_name: 'Robin',
    last_name: 'Vega',
    date_of_birth: '',
    district_student_id: '',
    upcoming_iep_date: '',
    upcoming_triennial_date: '',
    iep_goals: [],
    accommodations: [],
  })),
  upsertStudentDetails: jest.fn(async () => undefined),
  getMatchingProviderRoles: jest.fn(async () => []),
}));

jest.mock('@/lib/supabase/queries/student-teachers', () => ({
  getTeacherLinksForStudent: jest.fn(async () => []),
  saveTeacherLinksForStudent: jest.fn(async () => undefined),
  sortTeachersByPeriod: (links: unknown[]) => links,
}));

jest.mock('@/app/components/providers/school-context', () => ({
  useSchool: () => ({ currentSchool: null, isSecondary: false, loading: false }),
}));

// Tabs that fetch on mount and are irrelevant to the service-minutes fields.
jest.mock('@/app/components/students/student-progress-tab', () => ({
  StudentProgressTab: () => null,
}));
jest.mock('@/app/components/students/student-attendance-tab', () => ({
  StudentAttendanceTab: () => null,
}));
jest.mock('@/app/components/students/assessment-list', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/components/students/accommodations-pdf-import', () => ({
  AccommodationsPdfImport: () => null,
}));
jest.mock('@/app/components/chat/team-chat-button', () => ({
  TeamChatButton: () => null,
}));

const UNCONFIGURED = {
  id: '33333333-3333-4333-8333-333333333333',
  initials: 'RV',
  grade_level: '3',
  teacher_name: '',
  // What the students page passes for a student with nothing set.
  sessions_per_week: 0,
  minutes_per_session: 0,
};

const renderModal = (
  student: typeof UNCONFIGURED,
  onUpdateStudent = jest.fn(),
) => {
  render(
    <StudentDetailsModal
      isOpen
      onClose={jest.fn()}
      student={student}
      providerRole="resource"
      onUpdateStudent={onUpdateStudent}
    />
  );
  return onUpdateStudent;
};

describe('service minutes for a student with none configured', () => {
  it('reads "Not configured" rather than the smallest option', async () => {
    renderModal(UNCONFIGURED);

    const sessions = await screen.findByLabelText<HTMLSelectElement>('Sessions per Week');
    const minutes = screen.getByLabelText<HTMLSelectElement>('Minutes per Session');

    // The bug: these showed "1" and "15", indistinguishable from a real choice.
    expect(sessions.selectedOptions[0]?.text).toBe('Not configured');
    expect(minutes.selectedOptions[0]?.text).toBe('Not configured');
    expect(sessions.value).toBe('0');
    expect(minutes.value).toBe('0');
  });

  it('does not offer "Not configured" as something to pick', async () => {
    renderModal(UNCONFIGURED);

    const sessions = await screen.findByLabelText<HTMLSelectElement>('Sessions per Week');
    // A state a student arrives in, never one a provider sets — and 0 fails the
    // students table's check constraints.
    expect(sessions.selectedOptions[0]?.disabled).toBe(true);
  });

  it('leaves the unset pair out of the save, so the rest of the tab still lands', async () => {
    const onUpdateStudent = renderModal(UNCONFIGURED);
    await screen.findByLabelText('Sessions per Week');

    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    await waitFor(() => expect(onUpdateStudent).toHaveBeenCalled());
    const [, updates] = onUpdateStudent.mock.calls[0];
    expect(updates.sessions_per_week).toBeUndefined();
    expect(updates.minutes_per_session).toBeUndefined();
    // Everything else on the tab is still written.
    expect(updates.grade_level).toBe('3');
  });

  it('refuses a half-set pair instead of silently dropping the one that was picked', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const onUpdateStudent = renderModal(UNCONFIGURED);

    // Pick Sessions per Week but leave Minutes on "Not configured". Saving
    // would otherwise omit BOTH (they go together) and still report success.
    await userEvent.selectOptions(
      await screen.findByLabelText('Sessions per Week'),
      '3'
    );
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toMatch(/set both/i);
    expect(onUpdateStudent).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('still sends a configured pair through unchanged', async () => {
    const onUpdateStudent = renderModal(
      { ...UNCONFIGURED, sessions_per_week: 3, minutes_per_session: 45 },
    );
    await screen.findByLabelText('Sessions per Week');

    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    await waitFor(() => expect(onUpdateStudent).toHaveBeenCalled());
    const [, updates] = onUpdateStudent.mock.calls[0];
    expect(updates.sessions_per_week).toBe(3);
    expect(updates.minutes_per_session).toBe(45);
  });
});
