'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getCaseWithDetails, updateCase, moveToInitialStage, closeCase, CareCaseWithDetails } from '@/lib/supabase/queries/care-cases';
import { addNote, deleteNote } from '@/lib/supabase/queries/care-meeting-notes';
import {
  addActionItem,
  completeActionItem,
  uncompleteActionItem,
  deleteActionItem,
} from '@/lib/supabase/queries/care-action-items';
import { CaseDetailHeader } from '@/app/components/care/case-detail-header';
import { DispositionSelector } from '@/app/components/care/disposition-selector';
import { StatusHistoryLog } from '@/app/components/care/status-history-log';
import { MoveToInitialsModal } from '@/app/components/care/move-to-initials-modal';
import { CloseCaseModal } from '@/app/components/care/close-case-modal';
import { InitialAssessmentTracker } from '@/app/components/care/initial-assessment-tracker';
import { CaseNotesSection } from '@/app/components/care/case-notes-section';
import { CaseActionsSection } from '@/app/components/care/case-actions-section';
import type { CareDisposition } from '@/lib/constants/care';

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.caseId as string;

  const [caseData, setCaseData] = useState<CareCaseWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [isTeacher, setIsTeacher] = useState(false);
  const [showMoveToInitialsModal, setShowMoveToInitialsModal] = useState(false);
  const [showCloseCaseModal, setShowCloseCaseModal] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

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
    async function fetchUserData() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
          console.error('Error fetching user:', authError);
          return;
        }

        if (user) {
          setCurrentUserId(user.id);
          // Fetch user role to apply teacher restrictions
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

          if (profileError) {
            console.error('Error fetching profile:', profileError);
          }

          setIsTeacher(profile?.role === 'teacher');
        }
      } catch (err) {
        console.error('Error in fetchUserData:', err);
      }
    }

    fetchUserData();
  }, [fetchCase]);

  const handleDispositionChange = useCallback(
    async (disposition: CareDisposition) => {
      if (!caseId) return;
      setActionError(null);

      try {
        await updateCase(caseId, { current_disposition: disposition });
        await fetchCase();
        // Refresh status history after successful change
        setHistoryRefresh(prev => prev + 1);
      } catch (err) {
        console.error('Error updating disposition:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to update status');
        throw err; // Re-throw so component knows it failed
      }
    },
    [caseId, fetchCase]
  );

  const handleMoveToInitials = useCallback(async () => {
    if (!caseId) return;
    setActionError(null);

    try {
      await moveToInitialStage(caseId);
      setShowMoveToInitialsModal(false);
      // Navigate back to dashboard after moving to initials
      router.push('/dashboard/care');
    } catch (err) {
      console.error('Error moving to initials:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to move to initial stage');
      throw err;
    }
  }, [caseId, router]);

  const handleCloseCase = useCallback(async () => {
    if (!caseId) return;
    setActionError(null);

    try {
      await closeCase(caseId);
      setShowCloseCaseModal(false);
      // Navigate back to dashboard after closing
      router.push('/dashboard/care');
    } catch (err) {
      console.error('Error closing case:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to close referral');
      throw err;
    }
  }, [caseId, router]);

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

      {/* Initial Assessment Tracking - only show when in 'initial' stage */}
      {caseData.care_referrals.status === 'initial' && (
        <InitialAssessmentTracker
          caseId={caseId}
          initialData={{
            ap_received_date: caseData.ap_received_date,
            iep_due_date: caseData.iep_due_date,
            academic_testing_completed: caseData.academic_testing_completed ?? false,
            academic_testing_date: caseData.academic_testing_date,
            speech_testing_needed: caseData.speech_testing_needed ?? false,
            speech_testing_completed: caseData.speech_testing_completed ?? false,
            speech_testing_date: caseData.speech_testing_date,
            psych_testing_completed: caseData.psych_testing_completed ?? false,
            psych_testing_date: caseData.psych_testing_date,
            ot_testing_needed: caseData.ot_testing_needed ?? false,
            ot_testing_completed: caseData.ot_testing_completed ?? false,
            ot_testing_date: caseData.ot_testing_date,
          }}
          disabled={isTeacher}
          onUpdate={fetchCase}
        />
      )}

      {/* Status selector with history - read-only for teachers */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <DispositionSelector
          value={caseData.current_disposition}
          onChange={handleDispositionChange}
          onMoveToInitials={() => setShowMoveToInitialsModal(true)}
          showMoveToInitials={caseData.care_referrals.status === 'active'}
          onCloseCase={() => setShowCloseCaseModal(true)}
          showCloseCase={caseData.care_referrals.status === 'active' || caseData.care_referrals.status === 'initial'}
          disabled={isTeacher}
        />
        <StatusHistoryLog caseId={caseId} refreshTrigger={historyRefresh} />
      </div>

      {/* Move to Initials confirmation modal */}
      <MoveToInitialsModal
        isOpen={showMoveToInitialsModal}
        onClose={() => setShowMoveToInitialsModal(false)}
        onConfirm={handleMoveToInitials}
        studentName={caseData.care_referrals.student_name}
      />

      {/* Close Case confirmation modal */}
      <CloseCaseModal
        isOpen={showCloseCaseModal}
        onClose={() => setShowCloseCaseModal(false)}
        onConfirm={handleCloseCase}
        studentName={caseData.care_referrals.student_name}
      />

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
