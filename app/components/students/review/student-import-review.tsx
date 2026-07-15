'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../ui/modal';
import { Button } from '../../ui/button';
import type { ReviewModel, ReviewRow } from '@/lib/import/review-model';
import { useReviewSelection } from './use-review-selection';
import { ReviewSummaryBar } from './review-summary-bar';
import { ReviewFileReceipts } from './review-file-receipts';
import { ReviewExceptionsQueue } from './review-exceptions-queue';
import type { TeacherResolution } from './review-exception-row';
import { ReviewTable } from './review-table';

/**
 * Confirm contract (SPE-227). The presentational review screen never writes —
 * it hands the caller the selected, edited rows and lets the caller run the
 * write (bulk = replace via /confirm; per-student IEP = merge, SPE-232/234).
 */
export interface ReviewConfirmRow {
  row: ReviewRow;
  initials: string;
  selectedGoalTexts: string[];
}
export interface ReviewConfirmSelection {
  rows: ReviewConfirmRow[];
}
export interface ReviewWriteResult {
  outcomes: Array<{ rowId: string; success: boolean; error?: string }>;
  succeeded: number;
  failed: number;
}

interface StudentImportReviewProps {
  isOpen: boolean;
  onClose: () => void;
  model: ReviewModel;
  onConfirm: (selection: ReviewConfirmSelection) => Promise<ReviewWriteResult>;
  /** Refresh the caseload behind the modal after a (partial or full) success. */
  onComplete?: () => void;
}

/**
 * The rebuilt import review screen (SPE-227): a verification instrument in four
 * zones — summary → per-file receipt → exceptions queue → column-scannable
 * table — rendered inside the shared accessible Modal.
 */
export function StudentImportReview({
  isOpen,
  onClose,
  model,
  onConfirm,
  onComplete,
}: StudentImportReviewProps) {
  const selection = useReviewSelection(model.rows);
  const [teacherOverrides, setTeacherOverrides] = useState<Record<string, TeacherResolution>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a partial failure the modal stays open on the error and collapses to
  // a single Done button (no timer-based auto-close).
  const [importFinished, setImportFinished] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (importFinished) doneRef.current?.focus();
  }, [importFinished]);

  const resolveTeacher = (rowId: string, teacherId: string | null, teacherName: string | null) => {
    setTeacherOverrides((prev) => ({ ...prev, [rowId]: { teacherId, teacherName } }));
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const rows: ReviewConfirmRow[] = selection.selectedRows.map((row) => {
        const override = teacherOverrides[row.id];
        const resolvedRow: ReviewRow = override
          ? {
              ...row,
              teacher: {
                teacherId: override.teacherId,
                teacherName: override.teacherName,
                signal: 'confident',
                reason: 'chosen in review',
              },
            }
          : row;
        const goalsSelected = selection.goalsSelectedFor(row.id);
        const selectedGoalTexts = row.goals
          .filter((_, i) => goalsSelected.has(i))
          .map((g) => g.text);
        return { row: resolvedRow, initials: selection.initialsFor(row), selectedGoalTexts };
      });

      const result = await onConfirm({ rows });

      if (result.failed > 0) {
        const messages = result.outcomes
          .filter((o) => !o.success)
          .map((o) => o.error)
          .filter(Boolean);
        setError(`Some students couldn't be imported: ${messages.join(', ')}`);
        if (result.succeeded > 0) {
          onComplete?.();
          setImportFinished(true);
        }
      } else {
        onComplete?.();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const footer = importFinished ? (
    <Button ref={doneRef} variant="primary" onClick={onClose}>
      Done
    </Button>
  ) : (
    <>
      <div className="mr-auto self-center text-sm tabular-nums text-gray-600">
        {selection.selectedCount} selected · {selection.totalSelectedGoals} goals
      </div>
      <Button variant="secondary" onClick={onClose} disabled={importing}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleImport}
        disabled={importing || selection.selectedCount === 0}
      >
        {importing
          ? 'Importing…'
          : `Import ${selection.selectedCount} student${selection.selectedCount !== 1 ? 's' : ''}`}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={model.mode === 'target-student' ? 'Review IEP goals' : 'Review import'}
      size="5xl"
      dismissable={!importing}
      footer={footer}
    >
      <div className="space-y-5">
        <ReviewSummaryBar summary={model.summary} />
        {error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        <ReviewFileReceipts files={model.files} />
        <ReviewExceptionsQueue
          exceptions={model.exceptions}
          teacherOverrides={teacherOverrides}
          onResolveTeacher={resolveTeacher}
        />
        {model.rows.length > 0 && <ReviewTable rows={model.rows} selection={selection} />}
      </div>
    </Modal>
  );
}
