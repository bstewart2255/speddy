import React from 'react';
import { render, screen, userEvent } from '../../../test-utils';
import { StudentImportPreviewModal } from '@/app/components/students/student-import-preview-modal';

// SPE-221: "No changes" (action: 'skip') rows render with disabled checkboxes,
// so "Select All" must never pull them into the selection. The confirm count
// and the Select/Deselect-All label must reflect the *selectable* rows only
// (insert + update), not the total row count.

type ModalData = React.ComponentProps<typeof StudentImportPreviewModal>['data'];

// Preview with one of each action: 2 selectable (insert + update) + 1 skip.
const makeData = (): ModalData => ({
  students: [
    { firstName: 'Aaron', lastName: 'Alpha', initials: 'AA', gradeLevel: '3', action: 'insert' },
    { firstName: 'Bella', lastName: 'Bravo', initials: 'BB', gradeLevel: '4', action: 'update' },
    { firstName: 'Cora', lastName: 'Charlie', initials: 'CC', gradeLevel: '5', action: 'skip' },
  ],
  summary: { total: 3, new: 1, duplicates: 2, inserts: 1, updates: 1, skips: 1 },
});

const renderModal = () =>
  render(<StudentImportPreviewModal isOpen data={makeData()} onClose={() => {}} />);

describe('StudentImportPreviewModal — Select All excludes disabled skip rows (SPE-221)', () => {
  it('defaults to selecting only the insert/update rows; the skip checkbox is disabled and unchecked', () => {
    renderModal();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3); // goals sections are collapsed by default

    expect(checkboxes[0]).toBeChecked(); // insert
    expect(checkboxes[1]).toBeChecked(); // update
    expect(checkboxes[2]).toBeDisabled(); // skip — user cannot toggle it
    expect(checkboxes[2]).not.toBeChecked(); // skip — never in the selection

    // Confirm count reflects the 2 selectable rows, not all 3.
    expect(screen.getByRole('button', { name: /Confirm 2 Students/i })).toBeInTheDocument();
    // Every selectable row is selected, so the toggle offers "Deselect All".
    expect(screen.getByRole('button', { name: 'Deselect All' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select All' })).not.toBeInTheDocument();
  });

  it('Deselect All clears the selection to zero and disables Confirm; the label flips to Select All', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Deselect All' }));

    expect(screen.getByRole('button', { name: /Confirm 0 Students/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });

  it('Select All re-selects only the 2 selectable rows, never the disabled skip row', async () => {
    const user = userEvent.setup();
    renderModal();

    // Empty the selection, then Select All.
    await user.click(screen.getByRole('button', { name: 'Deselect All' }));
    await user.click(screen.getByRole('button', { name: 'Select All' }));

    // Back to exactly the 2 selectable rows — the confirm count does not inflate to 3.
    expect(screen.getByRole('button', { name: /Confirm 2 Students/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deselect All' })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked(); // skip stays out of the selection
  });

  // Legacy shape: a row with no `action`, only `matchStatus: 'duplicate'`. The
  // effective-action fallback maps it to "skip", so the checkbox must be
  // disabled AND the row must be excluded from Select All — the two now share
  // one eligibility rule (getEffectiveAction) so they can't drift apart.
  it('treats a legacy no-action "duplicate" row as a disabled skip, excluded from Select All', async () => {
    const user = userEvent.setup();
    const legacyData: ModalData = {
      students: [
        { firstName: 'Dave', lastName: 'Delta', initials: 'DD', gradeLevel: '2', action: 'insert' },
        { firstName: 'Erin', lastName: 'Echo', initials: 'EE', gradeLevel: '3', matchStatus: 'duplicate' },
      ],
      summary: { total: 2, new: 1, duplicates: 1 },
    };
    render(<StudentImportPreviewModal isOpen data={legacyData} onClose={() => {}} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked(); // insert — selectable
    expect(checkboxes[1]).toBeDisabled(); // duplicate — checkbox disabled, not just unchecked
    expect(checkboxes[1]).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Confirm 1 Student\b/i })).toBeInTheDocument();

    // Select All must not pull the disabled duplicate into the selection.
    await user.click(screen.getByRole('button', { name: 'Deselect All' }));
    await user.click(screen.getByRole('button', { name: 'Select All' }));
    expect(screen.getByRole('button', { name: /Confirm 1 Student\b/i })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
  });
});
