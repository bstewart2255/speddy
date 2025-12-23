'use client';

import { useState } from 'react';
import { CareMeetingNote } from '@/lib/supabase/queries/care-cases';

interface CaseNotesSectionProps {
  notes: CareMeetingNote[];
  onAddNote: (noteText: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
  currentUserId?: string;
}

export function CaseNotesSection({
  notes,
  onAddNote,
  onDeleteNote,
  currentUserId,
}: CaseNotesSectionProps) {
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setLoading(true);
    setError('');

    try {
      await onAddNote(newNote.trim());
      setNewNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="mb-4">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          disabled={loading}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading || !newNote.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Adding...' : 'Add Note'}
          </button>
        </div>
      </form>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="border-l-2 border-blue-200 pl-3 py-1">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.note_text}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {note.created_by_user?.full_name || 'Unknown'} - {formatDate(note.created_at)}
                </span>
                {onDeleteNote && currentUserId === note.created_by && (
                  <button
                    onClick={() => onDeleteNote(note.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
