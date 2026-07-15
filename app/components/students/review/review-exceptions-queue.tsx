'use client';

import type { ReviewException } from '@/lib/import/review-model';
import { ReviewExceptionRow, type TeacherResolution } from './review-exception-row';

/**
 * Zone 3 (SPE-227): the exceptions queue — first-class rows for everything that
 * needs judgment (unmatched students, low-confidence teacher matches, goal
 * removals). Everything not listed here is implicitly clean. Replaces the old
 * collapsed yellow banners.
 */
interface ReviewExceptionsQueueProps {
  exceptions: ReviewException[];
  teacherOverrides: Record<string, TeacherResolution>;
  onResolveTeacher: (rowId: string, teacherId: string | null, teacherName: string | null) => void;
}

export function ReviewExceptionsQueue({
  exceptions,
  teacherOverrides,
  onResolveTeacher,
}: ReviewExceptionsQueueProps) {
  if (exceptions.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-md border border-amber-200 bg-amber-50/50" aria-label="Needs your review">
      <div className="border-b border-amber-200 px-4 py-2">
        <h3 className="text-sm font-semibold text-amber-900">
          Needs your review <span className="tabular-nums">· {exceptions.length}</span>
        </h3>
      </div>
      <ul className="divide-y divide-amber-100">
        {exceptions.map((exception, i) => (
          <ReviewExceptionRow
            key={i}
            exception={exception}
            teacherOverride={
              exception.kind === 'low-confidence-teacher' ? teacherOverrides[exception.rowId] : undefined
            }
            onResolveTeacher={onResolveTeacher}
          />
        ))}
      </ul>
    </section>
  );
}
