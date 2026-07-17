/**
 * @jest-environment jsdom
 */

/**
 * Render test for the import-review goal list (SPE-267): a past-dated goal is
 * still shown, carries a "past date" hint, and renders unchecked, while a
 * current goal renders checked and unbadged. All data is fictional.
 */

import { render, screen } from '@testing-library/react';
import { ReviewGoalList } from '@/app/components/students/review/review-goal-list';
import type { ReviewRow } from '@/lib/import/review-model';

function rowWith(goalTexts: string[]): ReviewRow {
  return {
    id: 'r1',
    srcIndex: 0,
    action: 'insert',
    firstName: 'Test',
    lastName: 'Student',
    displayName: 'Test Student',
    initials: 'TS',
    gradeLevel: '3',
    goals: goalTexts.map((text) => ({ text, status: 'added' as const })),
    goalsRemoved: [],
  };
}

describe('ReviewGoalList — past-dated goal hint (SPE-267)', () => {
  it('shows a past-dated goal unchecked with a "past date" hint, current goal checked', () => {
    const row = rowWith([
      'By 5/1/2027, Ana will read 90 wpm.',        // current → selected
      'By April 2026, Ana will decode CVC words.', // past → unselected + badged
    ]);

    render(
      <table>
        <tbody>
          <tr>
            <td>
              <ReviewGoalList
                row={row}
                goalsSelected={new Set([0])}
                pastDatedGoals={new Set([1])}
                onToggleGoal={() => {}}
                onToggleAllGoals={() => {}}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );

    // Both goals are still shown.
    expect(screen.getByText(/Ana will read 90 wpm/)).toBeInTheDocument();
    expect(screen.getByText(/decode CVC words/)).toBeInTheDocument();

    // Exactly one "past date" hint, on the expired goal.
    expect(screen.getAllByText('past date')).toHaveLength(1);

    // Checkbox state mirrors selection: current checked, expired unchecked.
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('shows no hint when no goal is past-dated', () => {
    const row = rowWith(['By 5/1/2027, Ana will read 90 wpm.']);
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <ReviewGoalList
                row={row}
                goalsSelected={new Set([0])}
                pastDatedGoals={new Set()}
                onToggleGoal={() => {}}
                onToggleAllGoals={() => {}}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.queryByText('past date')).not.toBeInTheDocument();
  });
});
