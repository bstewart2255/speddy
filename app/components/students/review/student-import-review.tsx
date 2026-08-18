'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../ui/modal';
import { Button } from '../../ui/button';
import type { ReviewModel, ReviewRow } from '@/lib/import/review-model';
// Type-only: erased at compile time, no server-only code reaches the bundle
// (same rule as every sync panel).
import type { LinkPreviewEntry } from '@/lib/sis/import-link-preview';
import { useReviewSelection } from './use-review-selection';
import { ReviewSummaryBar } from './review-summary-bar';
import { ReviewFileReceipts } from './review-file-receipts';
import { ReviewExceptionsQueue } from './review-exceptions-queue';
import type { ChildLinkChoice, TeacherResolution } from './review-exception-row';
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
  /**
   * The child the importer explicitly confirmed this new student IS (SPE-348).
   * Set only on an answered "Yes — same child"; absent for an unanswered or
   * declined offer, which imports a separate child exactly as today.
   */
  confirmedChildId?: string;
}
export interface ReviewConfirmSelection {
  rows: ReviewConfirmRow[];
}
export interface ReviewWriteResult {
  outcomes: Array<{ rowId: string; success: boolean; error?: string }>;
  succeeded: number;
  failed: number;
}

/**
 * The single client-side gate that decides whether a new student is linked to an
 * existing child or created as a fresh one (SPE-348). Pure and exported so the
 * decision is testable on its own: ONLY an explicit "Yes — same child" on a row
 * that actually carries an offer produces a claim. Declined and unanswered both
 * yield undefined, which is today's behaviour — a separate child.
 */
export function confirmedChildIdFor(
  row: Pick<ReviewRow, 'childMatch'>,
  choice: ChildLinkChoice | undefined,
): string | undefined {
  return row.childMatch && choice === 'link' ? row.childMatch.childId : undefined;
}

/** The async SIS-teachers column's lifecycle (SPE-546). */
export type SisPreviewState =
  | { state: 'hidden' }
  | { state: 'loading' }
  /** The lookup failed or the district has no SIS — links come later. */
  | { state: 'unavailable' }
  | { state: 'ready'; entries: Record<string, LinkPreviewEntry> };

interface StudentImportReviewProps {
  isOpen: boolean;
  onClose: () => void;
  model: ReviewModel;
  onConfirm: (selection: ReviewConfirmSelection) => Promise<ReviewWriteResult>;
  /** Refresh the caseload behind the modal after a (partial or full) success. */
  onComplete?: () => void;
  /**
   * The school being imported into — enables the "classroom teachers from
   * your district's SIS" column (SPE-546). Absent = column never appears.
   */
  schoolId?: string | null;
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
  schoolId,
}: StudentImportReviewProps) {
  const selection = useReviewSelection(model.rows);
  // Per-student IEP import merges goals (adds, never removes); bulk replaces.
  const isMerge = model.writeMode === 'merge';
  const [teacherOverrides, setTeacherOverrides] = useState<Record<string, TeacherResolution>>({});
  // SPE-348: answers to the "same child?" offers. Absent = unanswered = a
  // separate child, so this never needs seeding and an ignored offer is safe.
  const [childLinkChoices, setChildLinkChoices] = useState<Record<string, ChildLinkChoice>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a partial failure the modal stays open on the error and collapses to
  // a single Done button (no timer-based auto-close).
  const [importFinished, setImportFinished] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (importFinished) doneRef.current?.focus();
  }, [importFinished]);

  // SPE-546: the SIS-teachers column fills in AFTER the review renders — the
  // screen must never wait on a district's SIS. Fires once per open, only in
  // bulk mode, only when rows actually carry district IDs; anything that
  // goes wrong degrades to 'unavailable' ("links will be added after
  // import"), never an error the importer has to deal with.
  const [sisPreview, setSisPreview] = useState<SisPreviewState>({ state: 'hidden' });
  const districtIdsKey = model.rows
    .map((r) => r.districtStudentId)
    .filter(Boolean)
    .join('\u0001');
  useEffect(() => {
    if (!isOpen || !schoolId || model.mode === 'target-student' || !districtIdsKey) {
      setSisPreview({ state: 'hidden' });
      return;
    }
    const districtStudentIds = [...new Set(districtIdsKey.split('\u0001'))];
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 120_000);
    setSisPreview({ state: 'loading' });
    (async () => {
      try {
        const res = await fetch('/api/students/import-link-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: abort.signal,
          body: JSON.stringify({ schoolId, districtStudentIds }),
        });
        const json: unknown = await res.json().catch(() => null);
        const body = json as { available?: unknown; reason?: unknown; entries?: unknown } | null;
        if (res.ok && body?.available === true && typeof body.entries === 'object' && body.entries) {
          setSisPreview({ state: 'ready', entries: body.entries as Record<string, LinkPreviewEntry> });
        } else if (res.ok && body?.available === false && body.reason === 'no-sis') {
          // No sync exists for this district — a column promising links
          // "after import" would be false, so it never appears.
          setSisPreview({ state: 'hidden' });
        } else {
          // A configured SIS that couldn't be checked right now (or a
          // transient error): the sync still runs after import, so the
          // column stays and says so.
          setSisPreview({ state: 'unavailable' });
        }
      } catch {
        setSisPreview({ state: 'unavailable' });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [isOpen, schoolId, model.mode, districtIdsKey]);

  const resolveTeacher = (rowId: string, teacherId: string | null, teacherName: string | null) => {
    setTeacherOverrides((prev) => ({ ...prev, [rowId]: { teacherId, teacherName } }));
  };

  const resolveChildLink = (rowId: string, choice: ChildLinkChoice) => {
    setChildLinkChoices((prev) => ({ ...prev, [rowId]: choice }));
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
        // Only an explicit "Yes — same child" carries a child through (SPE-348).
        const confirmedChildId = confirmedChildIdFor(row, childLinkChoices[row.id]);
        return {
          row: resolvedRow,
          initials: selection.initialsFor(row),
          selectedGoalTexts,
          confirmedChildId,
        };
      });

      const result = await onConfirm({ rows });

      if (result.failed > 0) {
        const messages = result.outcomes
          .filter((o) => !o.success)
          .map((o) => o.error)
          .filter(Boolean);
        const prefix = isMerge
          ? "Couldn't save the goals"
          : result.succeeded > 0
            ? "Some students couldn't be imported"
            : "No students could be imported";
        const detail = messages.length > 0 ? `: ${messages.join(', ')}` : '.';
        setError(`${prefix}${detail}`);
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

  // SPE-348: "same child?" offers on rows that are actually being imported and
  // still have no answer. Import is deliberately NOT blocked on them (owner's
  // call, 2026-07-29) — the footer just says what silence will do.
  const unansweredChildOffers = selection.selectedRows.filter(
    (row) => row.childMatch && childLinkChoices[row.id] === undefined,
  ).length;

  // The merge flow's primary action counts goals, not students.
  const goalCount = selection.totalSelectedGoals;
  const primaryDisabled = importing || (isMerge ? goalCount === 0 : selection.selectedCount === 0);
  const primaryLabel = importing
    ? isMerge
      ? 'Adding…'
      : 'Importing…'
    : isMerge
      ? `Add ${goalCount} goal${goalCount !== 1 ? 's' : ''}`
      : `Import ${selection.selectedCount} student${selection.selectedCount !== 1 ? 's' : ''}`;

  const footer = importFinished ? (
    <Button ref={doneRef} variant="primary" onClick={onClose}>
      Done
    </Button>
  ) : (
    <>
      <div className="mr-auto self-center text-sm text-gray-600">
        <span className="tabular-nums">
          {isMerge
            ? `${goalCount} goal${goalCount !== 1 ? 's' : ''} selected`
            : `${selection.selectedCount} selected · ${selection.totalSelectedGoals} goals`}
        </span>
        {unansweredChildOffers > 0 && (
          <span className="block text-xs text-gray-500">
            {unansweredChildOffers} possible match
            {unansweredChildOffers !== 1 ? 'es' : ''} unanswered — will import as separate students.
          </span>
        )}
      </div>
      <Button variant="secondary" onClick={onClose} disabled={importing}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleImport} disabled={primaryDisabled}>
        {primaryLabel}
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
        {isMerge && (
          <p className="text-sm text-gray-600">
            Adds new goals alongside existing ones — nothing is removed.
          </p>
        )}
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
          childLinkChoices={childLinkChoices}
          onResolveChildLink={resolveChildLink}
        />
        {model.rows.length > 0 && (
          <ReviewTable
            rows={model.rows}
            selection={selection}
            defaultExpandedId={model.mode === 'target-student' ? model.rows[0]?.id : undefined}
            sisPreview={sisPreview}
          />
        )}
      </div>
    </Modal>
  );
}
