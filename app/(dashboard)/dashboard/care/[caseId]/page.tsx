'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getCaseWithDetails, updateCase, CareCaseWithDetails } from '@/lib/supabase/queries/care-cases';
import { addNote, deleteNote } from '@/lib/supabase/queries/care-meeting-notes';
import {
  addActionItem,
  completeActionItem,
  uncompleteActionItem,
  deleteActionItem,
} from '@/lib/supabase/queries/care-action-items';
import { CaseDetailHeader } from '@/app/components/care/case-detail-header';
import { DispositionSelector } from '@/app/components/care/disposition-selector';
import { CaseNotesSection } from '@/app/components/care/case-notes-section';
import { CaseActionsSection } from '@/app/components/care/case-actions-section';
import type { CareDisposition } from '@/lib/constants/care';

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const [caseData, setCaseData] = useState<CareCaseWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [isTeacher, setIsTeacher] = useState(false);

  const fetchCase = useCallback(async () => {
    if (!caseId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getCaseWithDetails(caseId);
      if (!data) {
        setError('Case not found');
        return;
      }
      setCaseData(data);
    } catch (err) {
      console.error('Error fetching case:', err);
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCase();

    // Get current user ID and role
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        // Fetch user role to apply teacher restrictions
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setIsTeacher(profile?.role === 'teacher');
      }
    });
  }, [fetchCase]);

  const handleDispositionChange = useCallback(
    async (disposition: CareDisposition) => {
      if (!caseId) return;
      setActionError(null);

      try {
        await updateCase(caseId, { current_disposition: disposition });
        await fetchCase();
      } catch (err) {
        console.error('Error updating disposition:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to update disposition');
        throw err; // Re-throw so component knows it failed
      }
    },
    [caseId, fetchCase]
  );

  const handleAddNote = useCallback(
    async (noteText: string) => {
      if (!caseId) return;
      setActionError(null);

      try {
        await addNote(caseId, noteText);
        await fetchCase();
      } catch (err) {
        console.error('Error adding note:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to add note');
        throw err;
      }
    },
    [caseId, fetchCase]
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!confirm('Are you sure you want to delete this note?')) return;
      setActionError(null);

      try {
        await deleteNote(noteId);
        await fetchCase();
      } catch (err) {
        console.error('Error deleting note:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to delete note');
      }
    },
    [fetchCase]
  );

  const handleAddActionItem = useCallback(
    async (item: { description: string; due_date?: string }) => {
      if (!caseId) return;
      setActionError(null);

      try {
        await addActionItem(caseId, item);
        await fetchCase();
      } catch (err) {
        console.error('Error adding action item:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to add action item');
        throw err;
      }
    },
    [caseId, fetchCase]
  );

  const handleToggleComplete = useCallback(
    async (itemId: string, completed: boolean) => {
      setActionError(null);

      try {
        if (completed) {
          await completeActionItem(itemId);
        } else {
          await uncompleteActionItem(itemId);
        }
        await fetchCase();
      } catch (err) {
        console.error('Error toggling action item:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to update action item');
      }
    },
    [fetchCase]
  );

  const handleDeleteActionItem = useCallback(
    async (itemId: string) => {
      if (!confirm('Are you sure you want to delete this action item?')) return;
      setActionError(null);

      try {
        await deleteActionItem(itemId);
        await fetchCase();
      } catch (err) {
        console.error('Error deleting action item:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to delete action item');
      }
    },
    [fetchCase]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Case not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Action error message */}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {/* Header with student info */}
      <CaseDetailHeader caseData={caseData} />

      {/* Disposition selector - read-only for teachers */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <DispositionSelector
          value={caseData.current_disposition}
          onChange={handleDispositionChange}
          disabled={isTeacher}
        />
      </div>

      {/* Notes section - teachers can add and view */}
      <CaseNotesSection
        notes={caseData.care_meeting_notes || []}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        currentUserId={currentUserId}
      />

      {/* Action items section - hidden for teachers */}
      {!isTeacher && (
        <CaseActionsSection
          actionItems={caseData.care_action_items || []}
          onAddItem={handleAddActionItem}
          onToggleComplete={handleToggleComplete}
          onDeleteItem={handleDeleteActionItem}
        />
      )}
    </div>
  );
}
