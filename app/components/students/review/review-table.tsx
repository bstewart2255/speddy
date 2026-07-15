'use client';

import { useState } from 'react';
import { Button } from '../../ui/button';
import type { ReviewRow as ReviewRowData } from '@/lib/import/review-model';
import { ReviewRow } from './review-row';
import type { ReviewSelection } from './use-review-selection';

const COLUMN_COUNT = 8;

/**
 * Zone 4 (SPE-227): the column-scannable table. Uniform columns so verification
 * happens one attribute at a time (sweep Grade, then Teacher, then Schedule),
 * grouped New → Updated, with unchanged rows collapsed to a single line.
 */
export function ReviewTable({
  rows,
  selection,
  defaultExpandedId,
}: {
  rows: ReviewRowData[];
  selection: ReviewSelection;
  /** Row whose goals start expanded (target-student mode expands its one row). */
  defaultExpandedId?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(defaultExpandedId ?? null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const inserts = rows.filter((r) => r.action === 'insert');
  const updates = rows.filter((r) => r.action === 'update');
  const skips = rows.filter((r) => r.action === 'skip');

  const toggleExpand = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const renderGroup = (group: ReviewRowData[]) =>
    group.map((row) => (
      <ReviewRow
        key={row.id}
        row={row}
        selection={selection}
        isExpanded={expandedId === row.id}
        onToggleExpand={() => toggleExpand(row.id)}
        columnCount={COLUMN_COUNT}
      />
    ));

  return (
    <section aria-label="Students to import">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Students</h3>
        <Button type="button" variant="secondary" size="sm" onClick={selection.toggleSelectAll}>
          {selection.allSelectableSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th scope="col" className="px-3 py-2" aria-label="Select" />
              <th scope="col" className="px-3 py-2">Student</th>
              <th scope="col" className="px-3 py-2">Initials</th>
              <th scope="col" className="px-3 py-2">Grade</th>
              <th scope="col" className="px-3 py-2">Teacher</th>
              <th scope="col" className="px-3 py-2">Schedule</th>
              <th scope="col" className="px-3 py-2">Goals</th>
              <th scope="col" className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inserts.length > 0 && <GroupHeader label="New" count={inserts.length} />}
            {renderGroup(inserts)}
            {updates.length > 0 && <GroupHeader label="Updated" count={updates.length} />}
            {renderGroup(updates)}
            {skips.length > 0 &&
              (showUnchanged ? (
                <>
                  <GroupHeader label="Unchanged" count={skips.length} onHide={() => setShowUnchanged(false)} />
                  {renderGroup(skips)}
                </>
              ) : (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setShowUnchanged(true)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      <span className="tabular-nums">{skips.length}</span> unchanged · show
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupHeader({ label, count, onHide }: { label: string; count: number; onHide?: () => void }) {
  return (
    <tr className="bg-gray-50/70">
      <td colSpan={COLUMN_COUNT} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label} <span className="tabular-nums text-gray-400">({count})</span>
        {onHide && (
          <button type="button" onClick={onHide} className="ml-2 font-normal normal-case text-gray-500 underline hover:text-gray-700">
            hide
          </button>
        )}
      </td>
    </tr>
  );
}
