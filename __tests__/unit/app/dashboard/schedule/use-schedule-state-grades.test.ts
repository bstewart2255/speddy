/**
 * @jest-environment jsdom
 */

/**
 * SPE-587: the Grade Levels filter used to seed itself with a hardcoded TK–5.
 * At a middle or high school none of those grades matched a student, so every
 * session on the grid was dimmed as "filtered out" with no toggle to restore
 * it. The selection now follows the active school's own grades — including
 * across a school switch, which does not remount this hook.
 *
 * All data is fictional.
 */

import { act, renderHook } from '@testing-library/react';
import { useScheduleState } from '@/app/(dashboard)/dashboard/schedule/hooks/use-schedule-state';

const HIGH = ['9', '10', '11', '12'];
const MIDDLE = ['6', '7', '8'];
const ELEMENTARY = ['TK', 'K', '1', '2', '3', '4', '5'];

const selected = (result: { current: { selectedGrades: Set<string> } }) =>
  [...result.current.selectedGrades].sort();

describe('useScheduleState grade seeding', () => {
  it('starts with every one of the school\'s grades selected', () => {
    const { result } = renderHook(() => useScheduleState(HIGH));

    // Nothing is dimmed on first load: the legend is a key before it is a filter.
    expect(selected(result)).toEqual([...HIGH].sort());
  });

  it('seeds no elementary grade at a high school — the reported bug', () => {
    const { result } = renderHook(() => useScheduleState(HIGH));

    for (const grade of ELEMENTARY) {
      expect(result.current.selectedGrades.has(grade)).toBe(false);
    }
  });

  it('toggles a single grade off and back on', () => {
    const { result } = renderHook(() => useScheduleState(HIGH));

    act(() => result.current.toggleGrade('10'));
    expect(selected(result)).toEqual(['11', '12', '9']);

    act(() => result.current.toggleGrade('10'));
    expect(selected(result)).toEqual([...HIGH].sort());
  });

  it('re-seeds when the school switch changes the grade range', () => {
    const { result, rerender } = renderHook(
      ({ grades }) => useScheduleState(grades),
      { initialProps: { grades: HIGH } }
    );

    act(() => result.current.toggleGrade('9'));
    expect(result.current.selectedGrades.has('9')).toBe(false);

    // Switching to the middle school swaps the range in place. The stale high
    // school grades must not survive, or the new site's sessions all render
    // dimmed — the exact failure this fixes.
    rerender({ grades: MIDDLE });
    expect(selected(result)).toEqual([...MIDDLE].sort());

    rerender({ grades: ELEMENTARY });
    expect(selected(result)).toEqual([...ELEMENTARY].sort());
  });

  it('keeps the provider\'s toggles when the range is re-supplied unchanged', () => {
    const { result, rerender } = renderHook(
      ({ grades }) => useScheduleState(grades),
      { initialProps: { grades: [...ELEMENTARY] } }
    );

    act(() => result.current.toggleGrade('3'));
    expect(result.current.selectedGrades.has('3')).toBe(false);

    // A re-render handing over an equal-but-new array (a school object
    // re-created by a context refresh) is not a school change.
    rerender({ grades: [...ELEMENTARY] });
    expect(result.current.selectedGrades.has('3')).toBe(false);
    expect(selected(result)).toEqual(
      ELEMENTARY.filter(g => g !== '3').sort()
    );
  });

  it('survives an empty range without seeding stale grades', () => {
    const { result, rerender } = renderHook(
      ({ grades }) => useScheduleState(grades),
      { initialProps: { grades: [] as string[] } }
    );

    expect(selected(result)).toEqual([]);

    rerender({ grades: MIDDLE });
    expect(selected(result)).toEqual([...MIDDLE].sort());
  });
});
