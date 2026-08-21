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

// Mirrors what page.tsx hands over: getSchoolKey(currentSchool) plus the range.
const renderFor = (grades: string[], schoolKey: string) =>
  renderHook(
    ({ g, k }: { g: string[]; k: string }) => useScheduleState(g, k),
    { initialProps: { g: grades, k: schoolKey } }
  );

describe('useScheduleState grade seeding', () => {
  it('starts with every one of the school\'s grades selected', () => {
    const { result } = renderFor(HIGH, 'id:redwood');

    // Nothing is dimmed on first load: the legend is a key before it is a filter.
    expect(selected(result)).toEqual([...HIGH].sort());
  });

  it('seeds no elementary grade at a high school — the reported bug', () => {
    const { result } = renderFor(HIGH, 'id:redwood');

    for (const grade of ELEMENTARY) {
      expect(result.current.selectedGrades.has(grade)).toBe(false);
    }
  });

  it('toggles a single grade off and back on', () => {
    const { result } = renderFor(HIGH, 'id:redwood');

    act(() => result.current.toggleGrade('10'));
    expect(selected(result)).toEqual(['11', '12', '9']);

    act(() => result.current.toggleGrade('10'));
    expect(selected(result)).toEqual([...HIGH].sort());
  });

  it('re-seeds when the school switch changes the grade range', () => {
    const { result, rerender } = renderFor(HIGH, 'id:redwood');

    act(() => result.current.toggleGrade('9'));
    expect(result.current.selectedGrades.has('9')).toBe(false);

    // Switching to the middle school swaps the range in place. The stale high
    // school grades must not survive, or the new site's sessions all render
    // dimmed — the exact failure this fixes.
    rerender({ g: MIDDLE, k: 'id:cedar' });
    expect(selected(result)).toEqual([...MIDDLE].sort());

    rerender({ g: ELEMENTARY, k: 'id:willow' });
    expect(selected(result)).toEqual([...ELEMENTARY].sort());
  });

  it('re-seeds between two schools that share a grade range', () => {
    // An itinerant provider covering two elementary sites, or two 9-12 high
    // schools: the range is identical, so the range alone cannot tell the
    // switch apart and grades dimmed at the first school would carry to the
    // second (Codex, PR #925).
    const { result, rerender } = renderFor(ELEMENTARY, 'id:willow');

    act(() => result.current.toggleGrade('3'));
    expect(result.current.selectedGrades.has('3')).toBe(false);

    rerender({ g: [...ELEMENTARY], k: 'id:juniper' });
    expect(selected(result)).toEqual([...ELEMENTARY].sort());
  });

  it('keeps the provider\'s toggles when the same school is re-supplied', () => {
    const { result, rerender } = renderFor([...ELEMENTARY], 'id:willow');

    act(() => result.current.toggleGrade('3'));
    expect(result.current.selectedGrades.has('3')).toBe(false);

    // A re-render handing over an equal-but-new array for the SAME school (a
    // context refetch re-creating the school object) is not a school change.
    rerender({ g: [...ELEMENTARY], k: 'id:willow' });
    expect(result.current.selectedGrades.has('3')).toBe(false);
    expect(selected(result)).toEqual(
      ELEMENTARY.filter(g => g !== '3').sort()
    );
  });

  it('re-seeds once the school arrives, without wiping toggles after', () => {
    // currentSchool is null on the first paint, so the page seeds the TK-5
    // fallback under a placeholder key before the real school resolves.
    const { result, rerender } = renderFor(ELEMENTARY, 'none');

    rerender({ g: HIGH, k: 'id:redwood' });
    expect(selected(result)).toEqual([...HIGH].sort());

    act(() => result.current.toggleGrade('11'));
    rerender({ g: [...HIGH], k: 'id:redwood' });
    expect(result.current.selectedGrades.has('11')).toBe(false);
  });

  it('survives an empty range without seeding stale grades', () => {
    const { result, rerender } = renderFor([], 'none');

    expect(selected(result)).toEqual([]);

    rerender({ g: MIDDLE, k: 'id:cedar' });
    expect(selected(result)).toEqual([...MIDDLE].sort());
  });
});
