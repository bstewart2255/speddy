'use client';

import type { ReviewSummary } from '@/lib/import/review-model';

/**
 * Zone 1 (SPE-227): the summary sentence above the fold. On a clean import this
 * is effectively the whole experience — the counts + the reassurance that
 * nothing is written until the user confirms. The primary Import action lives in
 * the modal's sticky footer.
 */
export function ReviewSummaryBar({ summary }: { summary: ReviewSummary }) {
  const parts: string[] = [];
  if (summary.inserts > 0) parts.push(`${summary.inserts} new`);
  if (summary.updates > 0) parts.push(`${summary.updates} updated`);
  if (summary.skips > 0) parts.push(`${summary.skips} unchanged`);
  const breakdown = parts.length > 0 ? parts.join(', ') : 'no changes';

  const studentWord = summary.totalStudents === 1 ? 'student' : 'students';
  const goalWord = summary.totalGoals === 1 ? 'IEP goal' : 'IEP goals';

  return (
    <div>
      <p className="text-base font-semibold text-gray-900 tabular-nums">
        {summary.totalStudents} {studentWord}: {breakdown}
        <span className="text-gray-300"> · </span>
        {summary.totalGoals} {goalWord}
      </p>
      <p className="mt-1 text-sm text-gray-500">Nothing is saved until you import.</p>
      {summary.filteredOutBySchool !== undefined && summary.filteredOutBySchool > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {summary.filteredOutBySchool} student{summary.filteredOutBySchool !== 1 ? 's' : ''} from
          {summary.filteredOutSchools && summary.filteredOutSchools.length > 0
            ? ` ${summary.filteredOutSchools.join(', ')}`
            : ' other schools'}{' '}
          filtered out.
        </p>
      )}
    </div>
  );
}
