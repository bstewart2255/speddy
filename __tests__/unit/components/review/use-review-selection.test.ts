/**
 * @jest-environment jsdom
 */

/**
 * Hook test for the import-review selection defaults (SPE-267): goals whose
 * target date is already past must be shown but NOT selected by default, while
 * future/undated goals stay selected. All data is fictional.
 */

import { renderHook } from '@testing-library/react';
import { useReviewSelection } from '@/app/components/students/review/use-review-selection';
import type { ReviewRow, ReviewGoal } from '@/lib/import/review-model';

function makeRow(id: string, goals: string[], action: ReviewRow['action'] = 'insert'): ReviewRow {
  return {
    id,
    srcIndex: 0,
    action,
    firstName: 'Test',
    lastName: 'Student',
    displayName: 'Test Student',
    initials: 'TS',
    gradeLevel: '3',
    goals: goals.map<ReviewGoal>((text) => ({ text, status: 'added' })),
    goalsRemoved: [],
  };
}

describe('useReviewSelection — past-dated goal defaults (SPE-267)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 17)); // 2026-07-17
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('default-selects future/undated goals but leaves past-dated ones unchecked', () => {
    const row = makeRow('r1', [
      'By 5/1/2027, Ana will read 90 wpm.',         // future → selected
      'By April 2026, Ana will decode CVC words.',  // past → unselected
      'Ana will participate in group discussion.',  // no date → selected
    ]);
    const { result } = renderHook(() => useReviewSelection([row]));

    const selected = result.current.goalsSelectedFor('r1');
    expect(selected.has(0)).toBe(true);
    expect(selected.has(1)).toBe(false);
    expect(selected.has(2)).toBe(true);

    const past = result.current.pastDatedGoalsFor('r1');
    expect([...past]).toEqual([1]);
  });

  it('keeps the past-date set and the default selection in agreement', () => {
    const row = makeRow('r1', ['By June 2026, ...', 'By 5/1/2027, ...']);
    const { result } = renderHook(() => useReviewSelection([row]));

    const selected = result.current.goalsSelectedFor('r1');
    const past = result.current.pastDatedGoalsFor('r1');
    for (const i of past) expect(selected.has(i)).toBe(false);
    expect([...past]).toEqual([0]);
  });

  it('counts only default-selected (non-expired) goals in totalSelectedGoals', () => {
    const row = makeRow('r1', [
      'By April 2026, ...',  // past
      'By 5/1/2027, ...',    // future
      'Undated goal.',       // no date
    ]);
    const { result } = renderHook(() => useReviewSelection([row]));
    expect(result.current.totalSelectedGoals).toBe(2);
  });
});
