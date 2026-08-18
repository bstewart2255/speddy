'use client';

import { useState } from 'react';
import { TeacherAutocomplete } from './teacher-autocomplete';
import {
  sortTeachersByPeriod,
  type EditableTeacherLink,
} from '@/lib/supabase/queries/student-teachers';

interface StudentTeachersFieldProps {
  value: EditableTeacherLink[];
  onChange: (links: EditableTeacherLink[]) => void;
  /** Scope the teacher search to the STUDENT's school, not the user's. */
  schoolId?: string;
  /** Secondary gets subject/period labels and an unbounded list. */
  isSecondary?: boolean;
  disabled?: boolean;
  required?: boolean;
}

/**
 * SPE-337 — the teacher set of one student, editable.
 *
 * Two shapes, one component, because the underlying data is identical and only
 * the presentation differs:
 *
 *   * **Elementary** — the single "Teacher" picker exactly as before, plus an
 *     "Add co-teacher" link that reveals a second one. A co-taught class is the
 *     exception, not the norm, so the second picker stays out of the way until
 *     it is asked for. No subject/period: there are no periods at elementary.
 *   * **Secondary** — a list with optional subject and period labels per row.
 *
 * Co-teachers are EQUALS (product decision 2026-07-26). Nothing here ranks
 * them: no "primary" badge, no reordering handles, and removing the first row
 * is exactly as easy as removing the last.
 *
 * The rows READ in period order — the school day the student walks through,
 * earliest first — because six secondary classes in link order are six rows
 * the provider has to scan for the one they want. That is presentation only:
 * `value` keeps the order the caller handed over, and every edit below keys
 * off `teacherId` rather than a row index, so nothing downstream that reads
 * meaning into link order sees a reshuffled set. Elementary is untouched:
 * with no periods, every row ties and the sort is stable.
 *
 * `subject`/`period` are display labels only — Speddy does not schedule at
 * secondary (SPE-149/193), and nothing downstream reads them as times.
 *
 * Composes `TeacherAutocomplete` rather than replacing it: that component is
 * single-select by contract and is used by six other surfaces (special
 * activities, CARE referrals, import review) which genuinely want one teacher.
 */
export function StudentTeachersField({
  value,
  onChange,
  schoolId,
  isSecondary = false,
  disabled = false,
  required = false,
}: StudentTeachersFieldProps) {
  // Elementary shows the extra picker only once asked; secondary always offers it.
  const [addingAnother, setAddingAnother] = useState(false);
  // TeacherAutocomplete keeps its OWN selected-teacher state and renders a
  // "selected" chip for it. Where the picker stays mounted after a pick — i.e.
  // secondary, which always offers the next slot — that chip would sit under
  // our list showing the teacher a second time, and the picker would arrive at
  // the next entry already occupied. Bumping this key remounts it clean after
  // every attempt, including a rejected duplicate. (Elementary unmounts the
  // picker on its own, so this is belt-and-braces there.)
  const [pickerNonce, setPickerNonce] = useState(0);

  const alreadyLinked = new Set(value.map(l => l.teacherId));

  function addLink(teacherId: string | null, teacherName: string | null) {
    setPickerNonce(n => n + 1);
    if (!teacherId || alreadyLinked.has(teacherId)) return;
    onChange([...value, { teacherId, name: teacherName, subject: null, period: null }]);
    setAddingAnother(false);
  }

  function removeLink(teacherId: string) {
    onChange(value.filter(l => l.teacherId !== teacherId));
  }

  function updateLabel(teacherId: string, field: 'subject' | 'period', label: string) {
    onChange(
      value.map(l =>
        l.teacherId === teacherId ? { ...l, [field]: label.trim() === '' ? null : label } : l,
      ),
    );
  }

  // The very first teacher at elementary keeps the plain single-select look the
  // form has always had, so the common case is visually unchanged.
  const showInlinePicker = value.length === 0 || isSecondary || addingAnother;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-2">
          {sortTeachersByPeriod(value).map(link => (
            <li
              key={link.teacherId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
                {link.name || 'Unnamed teacher'}
              </span>

              {isSecondary && (
                <>
                  <input
                    type="text"
                    value={link.subject ?? ''}
                    onChange={e => updateLabel(link.teacherId, 'subject', e.target.value)}
                    placeholder="Subject"
                    aria-label={`Subject for ${link.name || 'teacher'}`}
                    disabled={disabled}
                    className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={link.period ?? ''}
                    onChange={e => updateLabel(link.teacherId, 'period', e.target.value)}
                    placeholder="Period"
                    aria-label={`Period for ${link.name || 'teacher'}`}
                    disabled={disabled}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                </>
              )}

              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeLink(link.teacherId)}
                  aria-label={`Remove ${link.name || 'teacher'}`}
                  className="text-sm text-gray-400 hover:text-red-600 transition-colors px-1"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showInlinePicker && !disabled && (
        <TeacherAutocomplete
          key={pickerNonce}
          value={null}
          onChange={addLink}
          placeholder={value.length === 0 ? 'Search for a teacher...' : 'Search for another teacher...'}
          required={required && value.length === 0}
          schoolId={schoolId}
        />
      )}

      {!showInlinePicker && !disabled && (
        <button
          type="button"
          onClick={() => setAddingAnother(true)}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
        >
          + Add co-teacher
        </button>
      )}

      {isSecondary && value.length > 0 && (
        <p className="text-xs text-gray-500">
          Subject and period are labels for your reference — Speddy does not schedule at
          secondary sites.
        </p>
      )}
    </div>
  );
}
