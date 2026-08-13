/**
 * @jest-environment jsdom
 */

/**
 * SPE-482: a grouping option is a silent no-op for students it cannot key.
 *
 * Observed on a real caseload: the provider picked "Group by teacher", none of
 * their ten students had a teacher recorded, and the run produced an ordinary
 * balanced schedule with no explanation — the option looked broken rather than
 * inapplicable. The picker now says so before the run, and points at the data.
 *
 * These tests use that exact caseload shape: every student has a grade, none
 * has a teacher.
 */

import { render, screen } from '@testing-library/react';
import { AutoScheduleOptionsModal } from '@/app/components/schedule/auto-schedule-options-modal';

/** The Bancroft shape: grades recorded, teachers blank. */
const BANCROFT = [
  { grade_level: '5', teacher_id: null, teacher_name: null },
  { grade_level: '5', teacher_id: null, teacher_name: null },
  { grade_level: '4', teacher_id: null, teacher_name: null },
  { grade_level: '3', teacher_id: null, teacher_name: null },
];

function renderPicker(students: Array<Record<string, unknown>> = []) {
  render(
    <AutoScheduleOptionsModal
      isOpen
      onClose={() => {}}
      sessionCount={12}
      strategy="balanced"
      onStrategyChange={() => {}}
      onConfirm={() => {}}
      students={students as never}
    />
  );
}

const coverage = (strategy: string) =>
  screen.queryByTestId(`strategy-coverage-${strategy}`)?.textContent ?? '';

describe('Auto-Schedule picker reports grouping coverage (SPE-482)', () => {
  it('warns that Group by teacher will do nothing when no teachers are recorded', () => {
    renderPicker(BANCROFT);
    const note = coverage('teacher-grouped');
    expect(note).toMatch(/None of your 4 students/i);
    // Says what will actually happen, and where to fix it. Deliberately does
    // NOT claim the run is identical to Balanced — it isn't (see the note in
    // groupabilityNote), and overclaiming would be a lie the provider can't check.
    expect(note).toMatch(/can't group anyone/i);
    expect(note).toMatch(/Students page/i);
    expect(note).not.toMatch(/same way as Balanced/i);
  });

  it('does not warn about grades on the same caseload, because grades are recorded', () => {
    renderPicker(BANCROFT);
    const note = coverage('grade-grouped');
    expect(note).not.toMatch(/None of your/i);
    // 4 of 4 share a grade with someone (two 5s, and 4/3 are alone) -> 2 of 4.
    expect(note).toMatch(/2 of 4 students share a grade/i);
  });

  it('warns when the field is recorded but nobody shares one', () => {
    renderPicker([
      { grade_level: '1', teacher_id: 't-1', teacher_name: null },
      { grade_level: '2', teacher_id: 't-2', teacher_name: null },
    ]);
    expect(coverage('teacher-grouped')).toMatch(/No two students here share a teacher/i);
    expect(coverage('grade-grouped')).toMatch(/No two students here share a grade/i);
    // Same reason: these students are not scheduled the Balanced way.
    expect(coverage('teacher-grouped')).not.toMatch(/Balanced/i);
  });

  it('confirms full coverage without alarming language', () => {
    renderPicker([
      { grade_level: '3', teacher_id: 't-1', teacher_name: null },
      { grade_level: '3', teacher_id: 't-1', teacher_name: null },
    ]);
    const note = coverage('grade-grouped');
    expect(note).toMatch(/All 2 students share a grade/i);
    expect(note).not.toMatch(/Balanced/i);
    expect(note).not.toMatch(/no one to group/i);
  });

  it('says nothing at all for the non-grouping options', () => {
    renderPicker(BANCROFT);
    expect(screen.queryByTestId('strategy-coverage-balanced')).toBeNull();
    expect(screen.queryByTestId('strategy-coverage-morning-first')).toBeNull();
  });

  it('stays silent when no caseload is available rather than guessing', () => {
    renderPicker([]);
    expect(screen.queryByTestId('strategy-coverage-teacher-grouped')).toBeNull();
    expect(screen.queryByTestId('strategy-coverage-grade-grouped')).toBeNull();
  });

  it('still renders every strategy option alongside the notes', () => {
    renderPicker(BANCROFT);
    for (const label of ['Balanced', 'Group by grade', 'Group by teacher', 'Prefer mornings']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
