'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/app/components/ui/modal';
import { formatRoleLabel } from '@/lib/utils/role-utils';
import {
  listMyChatStudents,
  listDmEligiblePeople,
  type ChatStudentOption,
  type ChatPersonOption,
} from '@/lib/supabase/queries/chat';

type Mode = 'student' | 'direct';

interface NewChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPickStudent: (studentId: string) => void;
  onPickPerson: (personId: string) => void;
  /** Active school from the school dropdown; scopes both lists. */
  schoolId?: string | null;
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function NewChatDialog({
  isOpen,
  onClose,
  onPickStudent,
  onPickPerson,
  schoolId,
}: NewChatDialogProps) {
  const [mode, setMode] = useState<Mode>('student');
  const [students, setStudents] = useState<ChatStudentOption[]>([]);
  const [people, setPeople] = useState<ChatPersonOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Reset to the student tab each time the dialog opens.
  useEffect(() => {
    if (isOpen) setMode('student');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuery('');
    const load =
      mode === 'student'
        ? listMyChatStudents(schoolId).then((s) => {
            if (!cancelled) setStudents(s);
          })
        : listDmEligiblePeople(schoolId ?? null).then((p) => {
            if (!cancelled) setPeople(p);
          });
    load
      .catch((e) => {
        if (!cancelled) {
          setStudents([]);
          setPeople([]);
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, schoolId]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.initials.toLowerCase().includes(q) || (s.gradeLevel ?? '').toLowerCase().includes(q),
    );
  }, [students, query]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) || formatRoleLabel(p.role).toLowerCase().includes(q),
    );
  }, [people, query]);

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`;

  const isEmpty = mode === 'student' ? filteredStudents.length === 0 : filteredPeople.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start a chat">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            className={tabClass(mode === 'student')}
            onClick={() => setMode('student')}
          >
            Student chat
          </button>
          <button
            type="button"
            className={tabClass(mode === 'direct')}
            onClick={() => setMode('direct')}
          >
            Direct message
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'student' ? 'Search students…' : 'Search people…'}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200">
          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-400">Loading…</div>
          ) : error ? (
            <div className="px-3 py-4 text-sm text-red-600">{error}</div>
          ) : isEmpty ? (
            <div className="px-3 py-4 text-sm text-gray-400">
              {mode === 'student' ? 'No students found.' : 'No people found at this school.'}
            </div>
          ) : mode === 'student' ? (
            <ul className="divide-y divide-gray-100">
              {filteredStudents.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPickStudent(s.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                      {s.initials}
                    </div>
                    <span className="text-sm text-gray-900">
                      {s.initials}
                      {s.gradeLevel ? (
                        <span className="ml-1 text-gray-400">· {s.gradeLevel}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredPeople.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPickPerson(p.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                      {personInitials(p.fullName)}
                    </div>
                    <span className="text-sm text-gray-900">
                      {p.fullName}
                      <span className="ml-1 text-gray-400">· {formatRoleLabel(p.role)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-gray-400">
          {mode === 'student'
            ? 'Start a chat for any student on your team. The roster fills in automatically.'
            : 'Message anyone you share a site with. SEAs and district admins are not available.'}
        </p>
      </div>
    </Modal>
  );
}
