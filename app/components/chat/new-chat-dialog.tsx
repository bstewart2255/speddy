'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/app/components/ui/modal';
import { listChatStudents, type ChatStudentOption } from '@/lib/supabase/queries/chat';

interface NewChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (studentId: string) => void;
}

export function NewChatDialog({ isOpen, onClose, onPick }: NewChatDialogProps) {
  const [students, setStudents] = useState<ChatStudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuery('');
    listChatStudents()
      .then((s) => {
        if (!cancelled) setStudents(s);
      })
      .catch((e) => {
        if (!cancelled) {
          setStudents([]);
          setError(e instanceof Error ? e.message : 'Failed to load students');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.initials.toLowerCase().includes(q) ||
        (s.gradeLevel ?? '').toLowerCase().includes(q),
    );
  }, [students, query]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start a student chat">
      <div className="space-y-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200">
          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-400">Loading students…</div>
          ) : error ? (
            <div className="px-3 py-4 text-sm text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400">No students found.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s.id)}
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
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          You can start a chat for any student on your team. The roster fills in automatically.
        </p>
      </div>
    </Modal>
  );
}
