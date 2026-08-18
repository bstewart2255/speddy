'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReviewRow as ReviewRowData } from '@/lib/import/review-model';
import type { BulkIepDateChange } from '@/lib/types/student-import';
import type { SisPreviewState } from './student-import-review';
import { ReviewGoalList } from './review-goal-list';
import { ReviewSignalIcon } from './review-signal';
import type { ReviewSelection } from './use-review-selection';
import { getIepDateWarning } from '@/lib/utils/iep-date-utils';

const ACTION_BADGE: Record<ReviewRowData['action'], { label: string; className: string }> = {
  insert: { label: 'New', className: 'bg-green-100 text-green-800' },
  update: { label: 'Update', className: 'bg-blue-100 text-blue-800' },
  skip: { label: 'No changes', className: 'bg-gray-100 text-gray-600' },
};

/** ISO YYYY-MM-DD → MM/DD/YYYY for display (the format SEIS exports use). */
function formatIepDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/** One IEP date line (SPE-303): shows old → new when the file changes it. */
function IepDateLine({ label, change }: { label: string; change?: BulkIepDateChange }) {
  if (!change) return null;
  return (
    <div className="whitespace-nowrap">
      <span className="text-gray-400">{label}</span>{' '}
      {change.changed && change.old && (
        <>
          <span className="text-gray-400 line-through">{formatIepDate(change.old)}</span>
          <span className="text-gray-400"> → </span>
        </>
      )}
      <span className={change.changed ? 'font-medium text-gray-900' : 'text-gray-900'}>
        {formatIepDate(change.value)}
      </span>
    </div>
  );
}

/**
 * The SPE-546 cell: which classroom teachers this student will be connected
 * to once the import commits (the SPE-545 sync writes the links). Each state
 * says only what is true — a pending lookup, a listed teacher set, a number
 * with no match (fixable right here, before importing), or an honest "links
 * will be added after import" when the SIS could not be checked.
 */
function SisTeachersCell({
  districtStudentId,
  sisPreview,
}: {
  districtStudentId?: string;
  sisPreview: SisPreviewState;
}) {
  if (!districtStudentId) return <span className="text-gray-400">—</span>;
  if (sisPreview.state === 'loading') {
    return <span className="italic text-gray-400">Checking rosters…</span>;
  }
  if (sisPreview.state !== 'ready') {
    return <span className="text-gray-400">Will link after import</span>;
  }
  const entry = sisPreview.entries[districtStudentId.trim()];
  if (!entry) return <span className="text-gray-400">—</span>;
  if (entry.status === 'not-found') {
    return (
      <span className="text-amber-700">
        No match in your district&apos;s SIS — check the district ID.
      </span>
    );
  }
  if (entry.status === 'multiple-records') {
    return (
      <span className="text-amber-700">
        More than one SIS record has this ID — teachers will need adding by hand.
      </span>
    );
  }
  if (entry.status === 'teachers-not-in-directory') {
    return (
      <span className="text-amber-700">
        Their teachers aren&apos;t in this school&apos;s teacher list yet.
      </span>
    );
  }
  if (entry.teachers.length === 0) {
    return <span className="text-gray-500">No teachers listed in the rosters.</span>;
  }
  const shown = entry.teachers.slice(0, 3);
  const more = entry.teachers.length - shown.length;
  return (
    <ul className="space-y-0.5 text-gray-900">
      {shown.map((t) => (
        <li key={t.name} className="whitespace-nowrap">
          {t.name}
          {t.subject && <span className="text-gray-400"> · {t.subject}</span>}
          {t.period && <span className="text-gray-400"> · P{t.period}</span>}
        </li>
      ))}
      {more > 0 && <li className="text-gray-500">+{more} more</li>}
    </ul>
  );
}

interface ReviewRowProps {
  row: ReviewRowData;
  selection: ReviewSelection;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Total table columns, for the full-width expansion/warning rows. */
  columnCount: number;
  /** Render the IEP dates column (only when an IEP Dates file is in play). */
  showIepDates: boolean;
  /** The SIS-teachers column's data (SPE-546); absent = column not shown. */
  sisPreview?: SisPreviewState;
}

export function ReviewRow({ row, selection, isExpanded, onToggleExpand, columnCount, showIepDates, sisPreview }: ReviewRowProps) {
  const isSkip = row.action === 'skip';
  const selected = selection.isRowSelected(row.id);
  const goalsSelected = selection.goalsSelectedFor(row.id);
  const badge = ACTION_BADGE[row.action];
  const goalCount = row.goals.length;
  // Only a warning for inserts: on an update, sending no goals keeps the
  // student's existing goals (the confirm RPC preserves goals when none are
  // supplied), so "imported without any goals" would be misleading.
  const noGoalsSelected =
    selected && goalCount > 0 && goalsSelected.size === 0 && row.action === 'insert';
  // Pre-import caution when the incoming report's IEP date is stale/future
  // (target-student mode only; bulk rows carry no iepDate).
  const iepWarning = row.iepDate ? getIepDateWarning(row.iepDate) : null;

  return (
    <>
      <tr className={selected ? 'bg-blue-50/40' : isSkip ? 'text-gray-500' : undefined}>
        <td className="px-3 py-2 align-top">
          <input
            type="checkbox"
            checked={selected}
            disabled={isSkip}
            onChange={() => selection.toggleRow(row.id)}
            aria-label={`Select ${row.displayName}`}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-40"
          />
        </td>
        <td className="px-3 py-2 align-top text-sm font-medium text-gray-900">{row.displayName}</td>
        <td className="px-3 py-2 align-top">
          <input
            type="text"
            value={selection.initialsFor(row)}
            onChange={(e) => selection.setInitials(row.id, e.target.value)}
            maxLength={4}
            aria-label={`Initials for ${row.displayName}`}
            className="w-14 rounded border border-gray-300 px-2 py-1 text-sm font-medium uppercase"
          />
        </td>
        <td className="px-3 py-2 align-top text-sm tabular-nums text-gray-900">{row.gradeLevel}</td>
        <td className="px-3 py-2 align-top text-sm text-gray-900">
          {row.teacher ? (
            <span className="inline-flex items-center gap-1">
              <span className="truncate" title={row.teacher.teacherName ?? undefined}>
                {row.teacher.teacherName ?? 'Unknown'}
              </span>
              {row.teacher.signal === 'check' && (
                <ReviewSignalIcon signal="check" className="h-3.5 w-3.5" />
              )}
            </span>
          ) : (
            <span className="text-gray-400 italic">Not set</span>
          )}
        </td>
        <td className="px-3 py-2 align-top text-sm tabular-nums text-gray-900">
          {row.schedule ? (
            `${row.schedule.sessionsPerWeek}×/${row.schedule.minutesPerSession}min`
          ) : (
            <span className="text-gray-400 italic">Not set</span>
          )}
        </td>
        {showIepDates && (
          <td className="px-3 py-2 align-top text-xs">
            {row.iepDates ? (
              <div className="space-y-0.5 tabular-nums">
                <IepDateLine label="IEP" change={row.iepDates.upcomingIepDate} />
                <IepDateLine label="Tri" change={row.iepDates.upcomingTriennialDate} />
              </div>
            ) : (
              <span className="text-gray-400 italic">Not set</span>
            )}
          </td>
        )}
        {sisPreview && (
          <td className="px-3 py-2 align-top text-xs">
            <SisTeachersCell districtStudentId={row.districtStudentId} sisPreview={sisPreview} />
          </td>
        )}
        <td className="px-3 py-2 align-top text-sm">
          {goalCount > 0 ? (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="tabular-nums">
                {goalsSelected.size}/{goalCount}
              </span>
              {noGoalsSelected && <ReviewSignalIcon signal="check" className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </td>
      </tr>

      {iepWarning?.message && (
        <tr>
          <td colSpan={columnCount} className="px-3 pb-2 text-xs text-amber-700">
            ⚠️ {iepWarning.message}
          </td>
        </tr>
      )}

      {noGoalsSelected && (
        <tr>
          <td colSpan={columnCount} className="px-3 pb-2 text-xs text-amber-700">
            No goals selected — this student will be imported without any goals.
          </td>
        </tr>
      )}

      {/* SPE-284: an initials-only existing record matched by initials + grade
          (not by name). Surface it so a "select all → confirm" can't silently
          enrich the wrong same-initials child. */}
      {row.matchConfidence === 'low' && (
        <tr>
          <td colSpan={columnCount} className="px-3 pb-2 text-xs text-amber-700">
            ⚠️ Matched by initials + grade to an existing record with no name yet —
            &ldquo;{row.displayName}&rdquo; will be saved as its name. Confirm it&rsquo;s the same student.
          </td>
        </tr>
      )}

      {isExpanded && (goalCount > 0 || row.goalsRemoved.length > 0) && (
        <tr>
          <td colSpan={columnCount} className="p-0">
            <ReviewGoalList
              row={row}
              goalsSelected={goalsSelected}
              pastDatedGoals={selection.pastDatedGoalsFor(row.id)}
              onToggleGoal={(i) => selection.toggleGoal(row.id, i)}
              onToggleAllGoals={() => selection.toggleAllGoals(row)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
