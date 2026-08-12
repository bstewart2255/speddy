/**
 * @jest-environment jsdom
 */

/**
 * SPE-474: Auto-Schedule decided who still needs scheduling by counting a
 * student's scheduled sessions against `sessions_per_week` — but the query had
 * no `is_template` filter. `schedule_sessions` holds the recurring templates
 * AND the dated instances materialized to a rolling 12-week horizon (SPE-291),
 * and instances carry day_of_week/start_time/end_time too. So up to twelve
 * weeks of instances were counted against a PER-WEEK number.
 *
 * The effect was that any student with an existing schedule read as
 * over-scheduled and was silently skipped: observed in the sim district as
 * "All students are fully scheduled!" while ten students each sat one session
 * short with an unscheduled row waiting. Prod had 12,268 dated instances
 * against 559 scheduled templates — a 23x overcount.
 *
 * These tests pin the filters on that query, because the bug WAS the missing
 * filter, and pin the behaviour they produce: a student whose instances
 * outnumber their weekly requirement must still be scheduled.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/** Records every filter applied to a `schedule_sessions` read. */
type Recorded = { table: string; filters: Array<[string, unknown, unknown?]> };
const reads: Recorded[] = [];

/** Rows a permissive (unfiltered) query would return, keyed by what it asks for. */
let sessionRows: Array<Record<string, unknown>> = [];

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const makeChain = (table: string) => {
      const record: Recorded = { table, filters: [] };
      const chain: any = {};
      // Every filter link records itself and returns the chain; awaiting the
      // chain resolves to the rows the test staged, filtered as the real
      // PostgREST call would filter them.
      for (const op of ['select', 'in', 'eq', 'is', 'not', 'order']) {
        chain[op] = (...args: unknown[]) => {
          if (op !== 'select' && op !== 'order') {
            record.filters.push(args as [string, unknown, unknown?]);
          }
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown) => {
        reads.push(record);
        let rows = table === 'schedule_sessions' ? sessionRows : [];
        // Apply the equality/null filters the component asked for, so the test
        // measures the query's real selectivity rather than trusting it.
        for (const [column, value] of record.filters) {
          if (column === 'is_template' && value === true) {
            rows = rows.filter(r => r.is_template === true);
          }
          if (column === 'deleted_at' && value === null) {
            rows = rows.filter(r => r.deleted_at == null);
          }
        }
        return Promise.resolve(resolve({ data: rows, error: null }));
      };
      return chain;
    };

    return {
      auth: { getUser: async () => ({ data: { user: { id: 'provider-1' } } }) },
      from: (table: string) => {
        if (table === 'students') {
          const chain: any = {};
          for (const op of ['select', 'eq', 'in', 'is', 'not']) chain[op] = () => chain;
          chain.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: STUDENTS, error: null }));
          return chain;
        }
        return makeChain(table);
      },
    };
  },
}));

const scheduleBatchStudents = jest.fn(async () => ({
  totalScheduled: 0,
  totalFailed: 0,
  errors: [],
  unplacedStudents: [],
  canManuallyPlace: false,
}));

jest.mock('@/lib/supabase/hooks/use-auto-schedule', () => ({
  useAutoSchedule: () => ({ scheduleBatchStudents, placeSessionsManually: jest.fn() }),
}));

jest.mock('@/app/components/schedule/undo-schedule', () => ({
  saveScheduleSnapshot: jest.fn(),
  saveScheduledSessionIds: jest.fn(),
  UndoSchedule: () => null,
}));

const STUDENTS = [
  {
    id: 'student-1',
    initials: 'AB',
    grade_level: '3',
    school_site: 'Willow',
    school_district: 'JSUSD',
    sessions_per_week: 2,
    minutes_per_session: 30,
  },
];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScheduleSessions } = require('@/app/components/schedule/schedule-sessions');

/** One scheduled template plus a pile of dated instances from that template. */
function stageRows({ templates, instances }: { templates: number; instances: number }) {
  sessionRows = [
    ...Array.from({ length: templates }, (_, i) => ({
      id: `t${i}`,
      student_id: 'student-1',
      is_template: true,
      deleted_at: null,
    })),
    ...Array.from({ length: instances }, (_, i) => ({
      id: `i${i}`,
      student_id: 'student-1',
      is_template: false,
      deleted_at: null,
    })),
  ];
}

async function runAutoSchedule() {
  render(
    <ScheduleSessions
      currentSchool={{ school_site: 'Willow', school_district: 'JSUSD' }}
      unscheduledCount={1}
      unscheduledPanelCount={1}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Auto-Schedule Sessions/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^Schedule Sessions$/i }));
  await waitFor(() => expect(reads.length).toBeGreaterThan(0));
}

beforeEach(() => {
  reads.length = 0;
  scheduleBatchStudents.mockClear();
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Auto-Schedule session counting (SPE-474)', () => {
  it('counts only live recurring templates, never dated instances', async () => {
    stageRows({ templates: 1, instances: 24 });
    await runAutoSchedule();

    const read = reads.find(r => r.table === 'schedule_sessions');
    expect(read).toBeDefined();
    const columns = read!.filters.map(([column]) => column);
    // The two filters whose absence caused the bug.
    expect(columns).toContain('is_template');
    expect(columns).toContain('deleted_at');
  });

  it('still schedules a student whose dated instances outnumber their weekly requirement', async () => {
    // 1 scheduled template + 24 instances against sessions_per_week = 2.
    // Counting instances made this read as 25 >= 2, so the student was skipped.
    stageRows({ templates: 1, instances: 24 });
    await runAutoSchedule();

    await waitFor(() => expect(scheduleBatchStudents).toHaveBeenCalled());
    const [batch] = scheduleBatchStudents.mock.calls[0] as unknown as [Array<{ id: string }>];
    expect(batch.map(s => s.id)).toEqual(['student-1']);
  });

  it('leaves a genuinely fully-scheduled student alone', async () => {
    // Two scheduled templates against sessions_per_week = 2: nothing to do.
    // Guards the opposite failure — a filter so loose everyone looks unscheduled.
    stageRows({ templates: 2, instances: 24 });
    await runAutoSchedule();

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(scheduleBatchStudents).not.toHaveBeenCalled();
    expect((window.alert as jest.Mock).mock.calls[0][0]).toMatch(/fully scheduled/i);
  });

  it('does not count a soft-deleted template as scheduled time', async () => {
    sessionRows = [
      { id: 't0', student_id: 'student-1', is_template: true, deleted_at: null },
      { id: 't1', student_id: 'student-1', is_template: true, deleted_at: '2026-01-01' },
    ];
    await runAutoSchedule();

    await waitFor(() => expect(scheduleBatchStudents).toHaveBeenCalled());
    const [batch] = scheduleBatchStudents.mock.calls[0] as unknown as [Array<{ id: string }>];
    expect(batch.map(s => s.id)).toEqual(['student-1']);
  });
});
