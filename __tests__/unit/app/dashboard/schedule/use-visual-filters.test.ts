/**
 * @jest-environment jsdom
 */

/**
 * SPE-588: the Visual Availability Filters panel is elementary-only — neither
 * the grade nor the teacher shading it drives can be accurate at a secondary
 * site. Hiding the card alone would not have been enough: the selections are
 * persisted per school in localStorage, so a filter set at that school before
 * the card was hidden (or carried over by switching schools, which does not
 * remount the hook) would keep shading the grid with no control left to clear
 * it. These tests pin the disabled hook to defaults in, nothing out.
 *
 * All data is fictional.
 */

import { act, renderHook } from '@testing-library/react';
import {
  useVisualFilters,
  type VisualFilters,
} from '@/app/(dashboard)/dashboard/schedule/hooks/useVisualFilters';
import type { Student } from '@/src/types';
import type { Teacher } from '@/app/(dashboard)/dashboard/schedule/types/teacher';

const KEY = 'speddy-visual-filters-v2';
const ELEMENTARY = 'school-elementary';
const SECONDARY = 'school-secondary';

const NO_TEACHERS: Teacher[] = [];
const NO_STUDENTS: Student[] = [];

// Only the id is read by the hook's existence check; the rest is shape.
const teacherRoster = (...ids: string[]) =>
  ids.map(id => ({ id, first_name: null, last_name: id })) as unknown as Teacher[];

const DEFAULTS: VisualFilters = { grade: null, teacherId: null, studentId: null };
const SAVED: VisualFilters = { grade: '3', teacherId: 'teacher-1', studentId: null };

const storeFilters = (schoolId: string, filters: VisualFilters) =>
  localStorage.setItem(`${KEY}-${schoolId}`, JSON.stringify(filters));

const readFilters = (schoolId: string) =>
  localStorage.getItem(`${KEY}-${schoolId}`);

// Persistence is debounced by 300ms, so a synchronous assertion on localStorage
// would report "nothing written" whether the write was skipped or merely not
// due yet. Push past the debounce first.
const flushPersist = async () => {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
};

describe('useVisualFilters — disabled at secondary sites (SPE-588)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('restores the stored filters when enabled', async () => {
    // Control: the same fixture and the same key DO come back at an elementary
    // site, so "defaults" in the next test means the guard fired rather than
    // that the fixture never loaded.
    storeFilters(ELEMENTARY, SAVED);

    const { result } = renderHook(() =>
      useVisualFilters(ELEMENTARY, NO_TEACHERS, NO_STUDENTS, true)
    );

    expect(result.current.visualFilters).toEqual(SAVED);
  });

  it('ignores filters already stored for a secondary school', async () => {
    // The ghost: this school's own saved selection, set while the card was
    // still shown there. With the card gone there is no Clear All to reach it.
    storeFilters(SECONDARY, SAVED);

    const { result } = renderHook(() =>
      useVisualFilters(SECONDARY, NO_TEACHERS, NO_STUDENTS, false)
    );

    expect(result.current.visualFilters).toEqual(DEFAULTS);
  });

  it('writes nothing while disabled, leaving a stored selection intact', async () => {
    storeFilters(SECONDARY, SAVED);

    renderHook(() => useVisualFilters(SECONDARY, NO_TEACHERS, NO_STUDENTS, false));
    await flushPersist();

    // Untouched, not overwritten with defaults: hiding the card is a display
    // decision, and SPE-588 may hand the student picker back later.
    expect(readFilters(SECONDARY)).toEqual(JSON.stringify(SAVED));
  });

  it('drops to defaults when switching from an elementary to a secondary school', async () => {
    // Switching schools re-renders this hook rather than remounting it, so the
    // state still holds the elementary selection. Returning it would shade the
    // secondary grid from a panel that is no longer on screen.
    storeFilters(ELEMENTARY, SAVED);

    const { result, rerender } = renderHook(
      ({ schoolId, enabled }) =>
        useVisualFilters(schoolId, NO_TEACHERS, NO_STUDENTS, enabled),
      { initialProps: { schoolId: ELEMENTARY, enabled: true } }
    );
    expect(result.current.visualFilters).toEqual(SAVED);

    rerender({ schoolId: SECONDARY, enabled: false });
    await flushPersist();

    expect(result.current.visualFilters).toEqual(DEFAULTS);
    // ...and the carried-over selection is not copied onto the secondary key.
    expect(readFilters(SECONDARY)).toBeNull();
  });

  it('leaves the elementary selection intact across a round trip via a secondary school', async () => {
    // The disabled hook still holds the elementary selection in state, and the
    // teacher/student existence checks would judge it against the SECONDARY
    // school's roster — where that teacher does not appear — and null it out as
    // missing. Re-enabling on the way back then persists the emptied state over
    // the provider's saved filters. Nothing on screen would explain it.
    storeFilters(ELEMENTARY, SAVED);
    const props = {
      elementary: { schoolId: ELEMENTARY, enabled: true, teachers: teacherRoster('teacher-1') },
      secondary: { schoolId: SECONDARY, enabled: false, teachers: teacherRoster('teacher-9') },
    };

    const { result, rerender } = renderHook(
      ({ schoolId, enabled, teachers }) =>
        useVisualFilters(schoolId, teachers, NO_STUDENTS, enabled),
      { initialProps: props.elementary }
    );
    expect(result.current.visualFilters).toEqual(SAVED);

    rerender(props.secondary);
    await flushPersist();
    rerender(props.elementary);
    await flushPersist();

    expect(result.current.visualFilters).toEqual(SAVED);
    expect(readFilters(ELEMENTARY)).toEqual(JSON.stringify(SAVED));
  });

  it('still drops a teacher who really has left the school', async () => {
    // Control for the round-trip test above: gating the check on `enabled` must
    // not disarm it while the panel is on screen.
    storeFilters(ELEMENTARY, SAVED);

    const { result } = renderHook(() =>
      useVisualFilters(ELEMENTARY, teacherRoster('teacher-9'), NO_STUDENTS, true)
    );
    await flushPersist();

    expect(result.current.visualFilters).toEqual({ ...SAVED, teacherId: null });
  });

  it('still persists a selection at an elementary school', async () => {
    // The feature itself, unchanged for the elementary majority path.
    const { result } = renderHook(() =>
      useVisualFilters(ELEMENTARY, NO_TEACHERS, NO_STUDENTS, true)
    );

    act(() => {
      result.current.setVisualFilters({ ...DEFAULTS, grade: '5' });
    });
    await flushPersist();

    expect(result.current.visualFilters).toEqual({ ...DEFAULTS, grade: '5' });
    expect(readFilters(ELEMENTARY)).toEqual(
      JSON.stringify({ ...DEFAULTS, grade: '5' })
    );
  });
});
