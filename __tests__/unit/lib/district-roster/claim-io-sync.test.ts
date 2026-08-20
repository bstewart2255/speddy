/**
 * SPE-575 (Codex review, PR #917): every minutes write in the claim flow must
 * run the same schedule synchronization as the students-page edit and the
 * import confirm — otherwise a claimed student never gets their initial
 * unscheduled sessions, and an accepted minutes change leaves the calendar
 * contradicting the stored requirement.
 */

const mockSync = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/lib/scheduling/session-requirement-sync', () => ({
  updateExistingSessionsForStudent: (...a: unknown[]) => mockSync(...a),
}));

jest.mock('@/lib/logger', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop, debug: noop, child: () => fake };
  return { logger: fake };
});

/**
 * A minimal chainable session client: enough of the supabase surface for the
 * two write paths under test. Reads resolve with `readRow`; writes succeed.
 */
const readRow = { sessions_per_week: 1, minutes_per_session: 30 };
const writes: Array<{ table: string; values: unknown }> = [];
const fakeSession = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: readRow, error: null }),
      }),
    }),
    update: (values: unknown) => ({
      eq: async () => {
        writes.push({ table, values });
        return { error: null };
      },
    }),
    upsert: async (values: unknown) => {
      writes.push({ table, values });
      return { error: null };
    },
  }),
};
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeSession,
  createServiceClient: () => fakeSession,
}));

import { applyRosterAcceptances, enrichClaimedStudents } from '@/lib/district-roster/claim-io';
import type { ClaimPlan } from '@/lib/district-roster/claim-plan';

const STUDENT = '33333333-3333-4333-8333-333333333333';
const CHILD = '11111111-1111-4111-8111-111111111111';

const basePlan: ClaimPlan = {
  claimable: [
    {
      childId: CHILD,
      initials: 'AA',
      firstName: 'Ana',
      lastName: 'Alvarez',
      gradeLevel: '1',
      schoolId: 'sch-1',
      districtStudentId: null,
      dateOfBirth: null,
      upcomingIepDate: null,
      upcomingTriennialDate: null,
      caseManager: null,
      minutesProposal: {
        weeklyMinutes: 60,
        sessionsPerWeek: 2,
        minutesPerSession: 30,
        serviceNames: ['Language and Speech'],
      },
      accommodations: [],
      testingAccommodations: [],
      goals: [],
      goalsIepDate: null,
      suggested: false,
    },
  ],
  updates: [
    {
      studentId: STUDENT,
      childId: CHILD,
      initials: 'AA',
      gradeLevel: '1',
      changes: [
        {
          field: 'serviceMinutes',
          label: 'Service minutes',
          current: '1×30 min/week (30 min/week)',
          roster: '60 min/week of Language and Speech — would be set as 2×30 min/week',
          kind: 'conflict',
          split: { sessionsPerWeek: 2, minutesPerSession: 30 },
        },
      ],
    },
  ],
  counts: { claimable: 1, suggested: 0, updates: 1, fills: 0, conflicts: 1 },
};

beforeEach(() => {
  mockSync.mockClear();
  writes.length = 0;
});

it('synchronizes the schedule after an accepted minutes change, with the stored before-values', async () => {
  const result = await applyRosterAcceptances({
    plan: basePlan,
    requests: [{ studentId: STUDENT, fields: ['serviceMinutes'] }],
  });

  expect(result).toEqual({ applied: 1, skipped: 0 });
  expect(mockSync).toHaveBeenCalledTimes(1);
  const [studentId, before, after] = mockSync.mock.calls[0];
  expect(studentId).toBe(STUDENT);
  expect(before).toEqual({ sessions_per_week: 1, minutes_per_session: 30 });
  expect(after).toEqual({ sessions_per_week: 2, minutes_per_session: 30 });
});

it('creates the initial unscheduled sessions for a freshly claimed student', async () => {
  const result = await enrichClaimedStudents({
    plan: basePlan,
    claims: [{ childId: CHILD, studentId: STUDENT, outcome: 'claimed' }],
  });

  expect(result).toEqual({ enriched: 1, enrichFailures: 0 });
  expect(mockSync).toHaveBeenCalledTimes(1);
  const [studentId, before, after] = mockSync.mock.calls[0];
  expect(studentId).toBe(STUDENT);
  // Null "before" is what makes the sync take its create-initial-sessions branch.
  expect(before).toEqual({ sessions_per_week: null, minutes_per_session: null });
  expect(after).toEqual({ sessions_per_week: 2, minutes_per_session: 30 });
});

it('counts a failed enrichment sync instead of failing the claim', async () => {
  mockSync.mockResolvedValueOnce({ success: false, error: 'boom' });
  const result = await enrichClaimedStudents({
    plan: basePlan,
    claims: [{ childId: CHILD, studentId: STUDENT, outcome: 'claimed' }],
  });
  expect(result).toEqual({ enriched: 0, enrichFailures: 1 });
});
