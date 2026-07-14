import React from 'react';
import { render, screen, userEvent, waitFor, fireEvent, act, mockFetch } from '../../../test-utils';
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

// SPE-222: a partial-failure import used to auto-close the modal after 3s,
// dismissing the failure list the user most needs to read. The modal must now
// stay open on partial failure (Done button), and refresh the caseload behind
// it without unmounting. Full success still closes immediately.
describe('StudentImportPreviewModal — partial-failure keeps the modal open (SPE-222)', () => {
  const importData = (): ModalData => ({
    students: [
      { firstName: 'Aaron', lastName: 'Alpha', initials: 'AA', gradeLevel: '3', action: 'insert' },
      { firstName: 'Bella', lastName: 'Bravo', initials: 'BB', gradeLevel: '4', action: 'update' },
    ],
    summary: { total: 2, new: 1, duplicates: 1, inserts: 1, updates: 1 },
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('on partial failure: refreshes the caseload, keeps the modal open with the error list + a Done button, and does not auto-close', async () => {
    const user = userEvent.setup();
    mockFetch({
      data: {
        results: [
          { initials: 'AA', success: true },
          { initials: 'BB', success: false, error: 'duplicate key' },
        ],
        summary: { succeeded: 1, failed: 1 },
      },
    });
    const onClose = jest.fn();
    const onImportComplete = jest.fn();
    render(
      <StudentImportPreviewModal
        isOpen
        data={importData()}
        onClose={onClose}
        onImportComplete={onImportComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: /Confirm 2 Students/i }));

    // The failure list is shown and the footer collapses to a single Done button.
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByText(/Some students failed to import: BB: duplicate key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    // The failure is announced to assistive tech, and focus moves to Done so a
    // keyboard user isn't dropped onto <body> when Confirm unmounts.
    expect(screen.getByRole('alert')).toHaveTextContent('Some students failed to import: BB: duplicate key');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();

    // Caseload refreshed behind the modal (onImportComplete), but the modal
    // stayed open (onClose not called) — i.e. no timer-based auto-close.
    expect(onImportComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    // The user dismisses the modal explicitly.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('on full success: refreshes the caseload and closes the modal immediately', async () => {
    const user = userEvent.setup();
    mockFetch({
      data: {
        results: [
          { initials: 'AA', success: true },
          { initials: 'BB', success: true },
        ],
        summary: { succeeded: 2, failed: 0 },
      },
    });
    const onClose = jest.fn();
    const onImportComplete = jest.fn();
    render(
      <StudentImportPreviewModal
        isOpen
        data={importData()}
        onClose={onClose}
        onImportComplete={onImportComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: /Confirm 2 Students/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onImportComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Some students failed/)).not.toBeInTheDocument();
  });

  it('on total failure (nothing succeeded): no refresh, no Done — keeps Cancel + Confirm for retry', async () => {
    const user = userEvent.setup();
    mockFetch({
      data: {
        results: [
          { initials: 'AA', success: false, error: 'server error' },
          { initials: 'BB', success: false, error: 'server error' },
        ],
        summary: { succeeded: 0, failed: 2 },
      },
    });
    const onClose = jest.fn();
    const onImportComplete = jest.fn();
    render(
      <StudentImportPreviewModal
        isOpen
        data={importData()}
        onClose={onClose}
        onImportComplete={onImportComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: /Confirm 2 Students/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Some students failed to import/);
    // Nothing imported → no caseload refresh, and the modal keeps the retry
    // affordance (Cancel + Confirm) rather than collapsing to Done.
    expect(onImportComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm 2 Students/i })).toBeInTheDocument();
  });

  it('schedules no deferred (3s) auto-close timer on partial failure', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockFetch({
      data: {
        results: [
          { initials: 'AA', success: true },
          { initials: 'BB', success: false, error: 'x' },
        ],
        summary: { succeeded: 1, failed: 1 },
      },
    });
    const onClose = jest.fn();
    render(
      <StudentImportPreviewModal
        isOpen
        data={importData()}
        onClose={onClose}
        onImportComplete={jest.fn()}
      />
    );

    // fireEvent + act (no RTL async helpers) so the setTimeout spy doesn't trip
    // RTL's fake-timer detection; flush the mocked fetch's microtask chain.
    fireEvent.click(screen.getByRole('button', { name: /Confirm 2 Students/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Reached the finished state, and the removed 3-second auto-close is not back.
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 3000);
  });
});
