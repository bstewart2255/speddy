'use client';

import { useState } from 'react';
import {
  sortTeachersByPeriod,
  summarizeTeacherSet,
  type LinkedTeacher,
} from '@/lib/supabase/queries/student-teachers';

interface TeacherSetCellProps {
  teachers: LinkedTeacher[];
  /**
   * The legacy free-text `students.teacher_name`, shown only when the child has
   * no links at all. One production row is in exactly that state (SPE-334 left
   * its hand-typed name alone), and dropping to "Not assigned" would look like
   * data loss to the provider who typed it.
   */
  fallbackName?: string | null;
  isSecondary?: boolean;
  onOpenTeacher?: (teacherId: string) => void;
}

/**
 * SPE-337 — a student's teacher set in one table cell.
 *
 * Elementary lists every name ("Davis / Winbery", the way class lists are
 * written); secondary summarises ("6 teachers") and expands on click, because
 * six names per row turns a roster into a wall of text. A single teacher
 * renders as a plain name at either level, so the common case is unchanged.
 *
 * Names are buttons keyed by teacher **id**. The old cell opened the teacher
 * modal on the free-text name, so a typo opened the wrong record — or created
 * a duplicate teacher.
 *
 * Expanded, the names read in period order — the same order the student's own
 * teacher list uses in the details modal, so the two views of one set cannot
 * disagree. Elementary carries no periods, so its rows are untouched.
 */
export function TeacherSetCell({
  teachers: unordered,
  fallbackName,
  isSecondary = false,
  onOpenTeacher,
}: TeacherSetCellProps) {
  const [expanded, setExpanded] = useState(false);
  const teachers = sortTeachersByPeriod(unordered);

  if (teachers.length === 0) {
    return fallbackName ? (
      <span className="text-gray-900" title="Typed in by hand — not linked to a teacher record">
        {fallbackName}
      </span>
    ) : (
      <span className="text-gray-400 italic">Not assigned</span>
    );
  }

  const collapsed = isSecondary && teachers.length > 1 && !expanded;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
        title={teachers.map(t => t.name).filter(Boolean).join(', ')}
      >
        {summarizeTeacherSet(teachers, true)}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      {teachers.map((teacher, i) => {
        const labels =
          [teacher.subject, teacher.period ? `Period ${teacher.period}` : null]
            .filter(Boolean).join(' · ') || undefined;
        return (
          <span key={teacher.id} className="inline-flex items-center">
            {i > 0 && <span className="text-gray-400 mr-1">/</span>}
            {/* Without a handler there is nothing to open — a blue underlined
                control that does nothing (and takes keyboard focus) is worse
                than plain text. */}
            {onOpenTeacher ? (
              <button
                type="button"
                onClick={() => onOpenTeacher(teacher.id)}
                className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                title={labels}
              >
                {teacher.name || 'Unnamed teacher'}
              </button>
            ) : (
              <span className="text-gray-900" title={labels}>
                {teacher.name || 'Unnamed teacher'}
              </span>
            )}
          </span>
        );
      })}
      {isSecondary && teachers.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          aria-label="Collapse teacher list"
        >
          (hide)
        </button>
      )}
    </span>
  );
}
