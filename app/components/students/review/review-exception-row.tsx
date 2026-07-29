'use client';

import type { ReviewException } from '@/lib/import/review-model';
import type { ChildMatchOffer } from '@/lib/types/student-import';
import { TeacherAutocomplete } from '../../teachers/teacher-autocomplete';
import { formatRoleLabel } from '@/lib/utils/role-utils';
import { ReviewSignalIcon } from './review-signal';

export interface TeacherResolution {
  teacherId: string | null;
  teacherName: string | null;
}

/** The importer's answer to a "same child?" offer (SPE-348). */
export type ChildLinkChoice = 'link' | 'separate';

interface ReviewExceptionRowProps {
  exception: ReviewException;
  teacherOverride?: TeacherResolution;
  onResolveTeacher: (rowId: string, teacherId: string | null, teacherName: string | null) => void;
  /** Undefined until the importer answers — which imports as a separate child. */
  childLinkChoice?: ChildLinkChoice;
  onResolveChildLink: (rowId: string, choice: ChildLinkChoice) => void;
}

/**
 * "Emily Chen (Speech)", "a Speech provider", or "another provider" — whatever
 * we actually know about who already serves this child.
 */
function describeProvider(match: ChildMatchOffer): string {
  const role = match.providerRole ? formatRoleLabel(match.providerRole) : null;
  if (match.providerName) return role ? `${match.providerName} (${role})` : match.providerName;
  return role ? `A ${role} provider` : 'Another provider';
}

/** Ordinal grade wording for the copy: "a 5th grader", "a Kindergartener". */
function describeGrade(gradeLevel: string | null): string {
  const grade = (gradeLevel ?? '').trim();
  if (!grade) return 'a student';
  const upper = grade.toUpperCase();
  if (upper === 'K') return 'a Kindergartener';
  if (upper === 'TK') return 'a TK student';
  const n = Number(grade);
  if (!Number.isInteger(n) || n < 1 || n > 12) return `a grade ${grade} student`;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `a ${n}${suffix} grader`;
}

/** The one-line evidence, in the importer's terms. */
function describeEvidence(match: ChildMatchOffer): string {
  const who = describeProvider(match);
  const grade = describeGrade(match.gradeLevel);
  if (match.reason === 'district-student-id' && match.districtStudentId) {
    return `${who} already serves ${grade} with the same Student ID (${match.districtStudentId}).`;
  }
  if (match.reason === 'name-grade') {
    return `${who} already serves ${grade} with the same name.`;
  }
  return `${who} already serves ${grade} with the same initials and teacher.`;
}

/**
 * One row in the "Needs your review" queue (SPE-227, Zone 3). Unmatched students
 * are informational (no full record to import); low-confidence teacher matches
 * resolve inline via TeacherAutocomplete; goal removals are enumerated.
 */
export function ReviewExceptionRow({
  exception,
  teacherOverride,
  onResolveTeacher,
  childLinkChoice,
  onResolveChildLink,
}: ReviewExceptionRowProps) {
  if (exception.kind === 'unmatched-student') {
    return (
      <li className="flex items-start gap-2 px-4 py-2 text-sm">
        <ReviewSignalIcon signal="check" className="mt-0.5" decorative />
        <div className="min-w-0">
          <span className="font-medium text-gray-900">{exception.name}</span>{' '}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {exception.source === 'deliveries'
              ? 'Deliveries'
              : exception.source === 'iepDates'
                ? 'IEP dates'
                : 'Class list'}
          </span>
          <p className="mt-0.5 text-xs text-gray-500">
            Not matched to a student here — won&apos;t be imported. Add via the roster or the Add Student form.
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

  // SPE-339: the file's Student ID is already on file against a different child.
  // Informational — the student still imports, but the disputed id is not
  // written, so nothing is silently merged or re-pointed.
  if (exception.kind === 'district-id-conflict') {
    return (
      <li className="flex items-start gap-2 px-4 py-2 text-sm">
        <ReviewSignalIcon signal="check" className="mt-0.5" decorative />
        <div className="min-w-0">
          <p>
            <span className="font-medium text-gray-900">{exception.studentLabel}</span>
            <span className="text-gray-600">
              {' '}
              — Student ID {exception.districtStudentId} already belongs to {exception.existingLabel}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            The student will still be imported, but this ID won&apos;t be saved. Check the ID in your
            source file, then re-import to attach it.
          </p>
        </div>
      </li>
    );
  }

  // SPE-348: the "same child?" offer — the one exception here that decides a
  // write. Nothing is linked unless the importer clicks "Yes"; leaving it
  // unanswered imports a separate child, exactly as every import does today.
  if (exception.kind === 'possible-shared-child') {
    const { match } = exception;
    const answered = childLinkChoice !== undefined;
    const linked = childLinkChoice === 'link';
    const choiceButton = (choice: ChildLinkChoice, label: string) => {
      const selected = childLinkChoice === choice;
      return (
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onResolveChildLink(exception.rowId, choice)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
            selected
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      );
    };

    return (
      <li className="flex items-start gap-2 px-4 py-2 text-sm">
        <ReviewSignalIcon signal="check" className="mt-0.5" decorative />
        <div className="min-w-0 flex-1">
          <p>
            <span className="font-medium text-gray-900">{exception.studentLabel}</span>
            <span className="text-gray-600"> — may be the same child a colleague already serves</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-600">{describeEvidence(match)}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Same child?</span> Yes records them as one
            child served by two providers. No imports them as a separate student. This doesn&apos;t
            share your goals or change your caseload.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {choiceButton('link', 'Yes — same child')}
            {choiceButton('separate', 'No — different child')}
            <span className="text-xs text-gray-500">
              {!answered
                ? 'Not answered — will import as a separate student.'
                : linked
                  ? 'Will be recorded as the same child.'
                  : 'Will import as a separate student.'}
            </span>
          </div>
        </div>
      </li>
    );
  }

  // SPE-348: we found something but won't offer it. Informational — the student
  // imports as a separate child, which is what happens today anyway.
  if (exception.kind === 'shared-child-not-offered') {
    const ambiguous = exception.conflict.kind === 'ambiguous';
    return (
      <li className="flex items-start gap-2 px-4 py-2 text-sm">
        <ReviewSignalIcon signal="check" className="mt-0.5" decorative />
        <div className="min-w-0">
          <p>
            <span className="font-medium text-gray-900">{exception.studentLabel}</span>
            <span className="text-gray-600">
              {ambiguous
                ? ' — more than one possible match'
                : ' — Student ID points to a different child'}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {ambiguous
              ? `${exception.conflict.count ?? 2} children here could be this student, so nothing will be linked. They'll import as a separate student.`
              : "A colleague's student has that Student ID under a different name, so nothing will be linked. They'll import as a separate student."}
          </p>
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
