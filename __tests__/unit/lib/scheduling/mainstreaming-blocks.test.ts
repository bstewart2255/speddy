// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';
import {
  findOverlappingMainstreamingBlock,
  type MainstreamingBlockLite,
} from '@/lib/services/session-update-service';

// The scheduler constructs a Supabase client and the singleton data manager on
// construction; mock the client module so both resolve to a harmless stub. These
// tests exercise the pure protected-time decision, not any I/O.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';

// A mainstreaming block: Monday 10:00–10:45 in a gen-ed class.
const block = (over: Partial<MainstreamingBlockLite> = {}): MainstreamingBlockLite => ({
  day_of_week: 1,
  start_time: '10:00:00',
  end_time: '10:45:00',
  label: 'Math',
  ...over,
});

describe('findOverlappingMainstreamingBlock (SPE-478)', () => {
  it('finds a block overlapping the candidate time', () => {
    expect(findOverlappingMainstreamingBlock([block()], 1, '10:15', '10:30')).not.toBeNull();
  });

  it('treats touching as not overlapping (half-open intervals)', () => {
    // Session starts exactly when the block ends.
    expect(findOverlappingMainstreamingBlock([block()], 1, '10:45', '11:15')).toBeNull();
    // Session ends exactly when the block starts.
    expect(findOverlappingMainstreamingBlock([block()], 1, '09:30', '10:00')).toBeNull();
  });

  it('ignores blocks on a different day', () => {
    expect(findOverlappingMainstreamingBlock([block()], 2, '10:15', '10:30')).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(findOverlappingMainstreamingBlock([], 1, '10:15', '10:30')).toBeNull();
  });

  it('returns the specific overlapping block when several exist', () => {
    const pe = block({ day_of_week: 3, start_time: '13:00:00', end_time: '13:30:00', label: 'PE' });
    const found = findOverlappingMainstreamingBlock([block(), pe], 3, '13:15', '13:45');
    expect(found?.label).toBe('PE');
  });
});

/**
 * SPE-478: the auto-scheduler must hard-avoid a slot overlapping the student's
 * mainstreaming time — the interactive drag warns and lets a human override,
 * but the auto-scheduler has no human in the loop. hasMainstreamingConflict is
 * the private decision the slot search consults; inject a minimal context and
 * assert it directly (same approach as the SPE-287 cross-provider test).
 */
function withContext(
  blocksByKey: Map<string, Map<number, MainstreamingBlockLite[]>>,
): {
  conflicts: (
    student: { id: string; child_id?: string | null },
    day: number,
    start: string,
    end: string,
  ) => boolean;
} {
  const scheduler = new OptimizedScheduler('provider-1', 'resource') as any;
  scheduler.context = { mainstreamingByStudent: blocksByKey };
  return {
    conflicts: (student, day, start, end) =>
      scheduler.hasMainstreamingConflict(student, day, start, end),
  };
}

describe('OptimizedScheduler.hasMainstreamingConflict (SPE-478)', () => {
  const STUDENT = { id: 'sdc-student', child_id: null };
  const base = () =>
    new Map<string, Map<number, MainstreamingBlockLite[]>>([
      [STUDENT.id, new Map([[1, [block()]]])],
    ]);

  it('hard-avoids a slot overlapping the student\'s mainstreaming block', () => {
    // Scheduler passes startTime as "HH:MM" and endTime as "HH:MM:00" (addMinutesToTime).
    expect(withContext(base()).conflicts(STUDENT, 1, '10:15', '10:45:00')).toBe(true);
  });

  it('allows an adjacent slot (half-open intervals)', () => {
    expect(withContext(base()).conflicts(STUDENT, 1, '10:45', '11:15:00')).toBe(false);
    expect(withContext(base()).conflicts(STUDENT, 1, '09:30', '10:00:00')).toBe(false);
  });

  it('does not block a different day or another student', () => {
    expect(withContext(base()).conflicts(STUDENT, 2, '10:15', '10:45:00')).toBe(false);
    expect(withContext(base()).conflicts({ id: 'someone-else', child_id: null }, 1, '10:15', '10:45:00')).toBe(false);
  });

  it('hard-avoids via the shared CHILD when the block was created on another provider\'s caseload row', () => {
    // SPE-347: the SDC teacher's block is indexed under the child id; this
    // provider's caseload row for the same child has a different id. The
    // child key is what connects them (Codex P1 on PR #856).
    const CHILD = 'shared-child';
    const byChild = new Map<string, Map<number, MainstreamingBlockLite[]>>([
      [CHILD, new Map([[1, [block()]]])],
    ]);
    const myRow = { id: 'my-caseload-row', child_id: CHILD };
    expect(withContext(byChild).conflicts(myRow, 1, '10:15', '10:45:00')).toBe(true);
    // Unlinked student with the same row id finds nothing — fallback only under-warns.
    expect(withContext(byChild).conflicts({ id: 'my-caseload-row', child_id: null }, 1, '10:15', '10:45:00')).toBe(false);
  });
});
