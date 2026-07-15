'use client';

import type { ReviewException } from '@/lib/import/review-model';
import { TeacherAutocomplete } from '../../teachers/teacher-autocomplete';
import { ReviewSignalIcon } from './review-signal';

export interface TeacherResolution {
  teacherId: string | null;
  teacherName: string | null;
}

interface ReviewExceptionRowProps {
  exception: ReviewException;
  teacherOverride?: TeacherResolution;
  onResolveTeacher: (rowId: string, teacherId: string | null, teacherName: string | null) => void;
}

/**
 * One row in the "Needs your review" queue (SPE-227, Zone 3). Unmatched students
 * are informational (no full record to import); low-confidence teacher matches
 * resolve inline via TeacherAutocomplete; goal removals are enumerated.
 */
export function ReviewExceptionRow({ exception, teacherOverride, onResolveTeacher }: ReviewExceptionRowProps) {
  if (exception.kind === 'unmatched-student') {
    return (
      <li className="flex items-start gap-2 px-4 py-2 text-sm">
        <ReviewSignalIcon signal="check" className="mt-0.5" decorative />
        <div className="min-w-0">
          <span className="font-medium text-gray-900">{exception.name}</span>{' '}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {exception.source === 'deliveries' ? 'Deliveries' : 'Class list'}
          </span>
          <p className="mt-0.5 text-xs text-gray-500">
            Not in the goals report — won&apos;t be imported. Add via the roster or the Add Student form.
          </p>
        </div>
      </li>
    );
  }

  if (exception.kind === 'low-confidence-teacher') {
    const suggestion = exception.suggestion;
    const currentId = teacherOverride?.teacherId ?? suggestion.teacherId;
    const currentName = teacherOverride?.teacherName ?? suggestion.teacherName;
    return (
      <li className="flex items-start gap-2 px-4 py-2 text-sm">
        <ReviewSignalIcon signal="check" className="mt-0.5" decorative />
        <div className="min-w-0 flex-1">
          <p>
            <span className="font-medium text-gray-900">{exception.studentLabel}</span>
            <span className="text-gray-600">
              {' '}
              — teacher match needs review
              {suggestion.teacherName ? `: “${suggestion.teacherName}”` : ''}
            </span>
          </p>
          <div className="mt-1 max-w-sm">
            <TeacherAutocomplete
              value={currentId}
              teacherName={currentName ?? undefined}
              onChange={(teacherId, teacherName) =>
                onResolveTeacher(exception.rowId, teacherId, teacherName ?? null)
              }
              placeholder="Choose a teacher…"
            />
          </div>
        </div>
      </li>
    );
  }

  // goals-removed
  return (
    <li className="flex items-start gap-2 px-4 py-2 text-sm">
      <ReviewSignalIcon signal="removed" className="mt-0.5" decorative />
      <div className="min-w-0">
        <p>
          <span className="font-medium text-gray-900">{exception.studentLabel}</span>
          <span className="text-gray-600">
            {' '}
            — {exception.goals.length} goal{exception.goals.length !== 1 ? 's' : ''} removed on update
          </span>
        </p>
        <ul className="mt-0.5 max-h-20 space-y-0.5 overflow-y-auto text-xs text-gray-400 line-through">
          {exception.goals.map((goal, i) => (
            <li key={i}>{goal}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}
