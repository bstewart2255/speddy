import React from 'react';
import { render, screen, waitFor, fireEvent } from '../../../test-utils';
import { StudentImportReview } from '@/app/components/students/review/student-import-review';
import type { ReviewModel, ReviewRow } from '@/lib/import/review-model';

// SPE-227: the rebuilt review screen. Preserves SPE-221 (Select-All excludes
// "no changes" skip rows) and SPE-222 (partial failure keeps the modal open).

const row = (over: Partial<ReviewRow> & Pick<ReviewRow, 'id' | 'action'>): ReviewRow => ({
  srcIndex: 0,
  firstName: 'F',
  lastName: 'L',
  displayName: 'F L',
  initials: 'FL',
  gradeLevel: '1',
  goals: [],
  goalsRemoved: [],
  ...over,
});

const model = (over?: Partial<ReviewModel>): ReviewModel => ({
  mode: 'bulk',
  writeMode: 'replace',
  summary: { totalStudents: 3, inserts: 1, updates: 1, skips: 1, totalGoals: 2 },
  files: [],
  exceptions: [],
  rows: [
    row({ id: 'new:0', action: 'insert', displayName: 'Ann New', initials: 'AN', goals: [{ text: 'g1', status: 'added' }] }),
    row({ id: 's2', action: 'update', displayName: 'Bea Up', initials: 'BU', targetStudentId: 's2', goals: [{ text: 'g2', status: 'unchanged' }] }),
    row({ id: 's3', action: 'skip', displayName: 'Cal Same', initials: 'CS', targetStudentId: 's3' }),
  ],
  ...over,
});

const noopConfirm = async () => ({ outcomes: [], succeeded: 0, failed: 0 });

describe('StudentImportReview (SPE-227)', () => {
  it('renders the summary and leaves skip rows unselectable; unchanged rows collapse (SPE-221)', () => {
    render(<StudentImportReview isOpen model={model()} onClose={() => {}} onConfirm={noopConfirm} />);

    expect(screen.getByText('Nothing is saved until you import.')).toBeInTheDocument();
    // Two selectable (insert + update) rows are selected by default → footer action
    // excludes the skip row.
    expect(screen.getByRole('button', { name: /Import 2 students/ })).toBeEnabled();

    // The one "no changes" row is collapsed; expanding it shows its checkbox disabled.
    const showUnchanged = screen.getByRole('button', { name: /unchanged/ });
    fireEvent.click(showUnchanged);
    expect(screen.getByLabelText('Select Cal Same')).toBeDisabled();
  });

  it('sends only selected rows and keeps the modal open on partial failure (SPE-222)', async () => {
    const onConfirm = jest.fn().mockResolvedValue({
      outcomes: [
        { rowId: 'new:0', success: true },
        { rowId: 's2', success: false, error: 'duplicate initials' },
      ],
      succeeded: 1,
      failed: 1,
    });
    const onComplete = jest.fn();

    render(<StudentImportReview isOpen model={model()} onClose={() => {}} onConfirm={onConfirm} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /Import 2 students/ }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    // Only the two selectable rows are submitted (skip excluded).
    expect(onConfirm.mock.calls[0][0].rows).toHaveLength(2);

    // Partial failure: error shown, caseload refreshed, modal stays open on a Done button.
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t be imported/i);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import 2 students/ })).not.toBeInTheDocument();
  });

  it('lists unmatched students in the needs-review queue', () => {
    const m = model({ exceptions: [{ kind: 'unmatched-student', name: 'Ghost Kid', source: 'deliveries' }] });
    render(<StudentImportReview isOpen model={m} onClose={() => {}} onConfirm={noopConfirm} />);

    expect(screen.getByText(/Needs your review/)).toBeInTheDocument();
    expect(screen.getByText('Ghost Kid')).toBeInTheDocument();
  });

  it('target-student (merge) mode: merge copy, footer counts goals, goals expanded by default (SPE-232)', () => {
    const m = model({
      mode: 'target-student',
      writeMode: 'merge',
      summary: { totalStudents: 1, inserts: 0, updates: 1, skips: 0, totalGoals: 2 },
      rows: [
        row({
          id: 'stu-7:0',
          action: 'update',
          displayName: 'KL',
          initials: 'KL',
          targetStudentId: 'stu-7',
          goals: [
            { text: 'Read 90 wpm', status: 'added' },
            { text: 'Solve 2-digit addition', status: 'added' },
          ],
        }),
      ],
    });
    render(<StudentImportReview isOpen model={m} onClose={() => {}} onConfirm={noopConfirm} />);

    // Merge semantics stated in copy; title is IEP-goals-specific.
    expect(screen.getByText('Review IEP goals')).toBeInTheDocument();
    expect(screen.getByText(/nothing is removed/i)).toBeInTheDocument();
    // Primary action counts goals, not students.
    expect(screen.getByRole('button', { name: /Add 2 goals/ })).toBeEnabled();
    // The single row's goals are expanded by default (no click needed).
    expect(screen.getByText('Read 90 wpm')).toBeInTheDocument();
  });

  it('target-student mode surfaces a stale/future IEP-date warning before import (SPE-232)', () => {
    const m = model({
      mode: 'target-student',
      writeMode: 'merge',
      summary: { totalStudents: 1, inserts: 0, updates: 1, skips: 0, totalGoals: 1 },
      rows: [
        row({
          id: 'stu-8:0',
          action: 'update',
          displayName: 'PQ',
          initials: 'PQ',
          targetStudentId: 'stu-8',
          iepDate: '2099-01-01', // far future → getIepDateWarning flags it pre-import
          goals: [{ text: 'g1', status: 'added' }],
        }),
      ],
    });
    render(<StudentImportReview isOpen model={m} onClose={() => {}} onConfirm={noopConfirm} />);

    expect(screen.getByText(/IEP date is in the future/i)).toBeInTheDocument();
  });
});
