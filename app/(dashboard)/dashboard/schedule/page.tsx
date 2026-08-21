'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScheduleState, type ScheduleDragPosition } from './hooks/use-schedule-state';
import { useScheduleData } from '../../../../lib/supabase/hooks/use-schedule-data';
import { useScheduleOperations } from '../../../../lib/supabase/hooks/use-schedule-operations';
import { ScheduleErrorBoundary } from '../../../components/schedule/schedule-error-boundary';
import { ScheduleHeader } from './components/schedule-header';
import { ScheduleControls } from './components/schedule-controls';
import { ScheduleGrid } from './components/schedule-grid';
import { SessionDetailsModal } from '../../../components/modals/session-details-modal';
import { GroupPopover, type GroupPopoverData } from './components/group-popover';
import { useToast } from '../../../contexts/toast-context';
import { ScheduleLoading } from './components/schedule-loading';
import { ConflictFilterPanel } from './components/ConflictFilterPanel';
import { UnscheduledSessionsPanel } from './components/unscheduled-sessions-panel';
import { useSchool } from '../../../components/providers/school-context';
import { createClient } from '../../../../lib/supabase/client';
import { useSessionTags } from './hooks/useSessionTags';
import { useVisualFilters } from './hooks/useVisualFilters';
import { useTeachers } from './hooks/useTeachers';
import { useOtherProviderSessions } from './hooks/useOtherProviderSessions';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import { filterScheduleSessions } from './utils/session-filters';
import { buildAssignmentUpdate, buildSessionTimes } from './utils/drag-session';
import { AddMainstreamingBlockModal } from '../../../components/schedule/add-mainstreaming-block-modal';
import { AddBlockedTimeModal } from '../../../components/schedule/add-blocked-time-modal';
import { deleteMainstreamingBlock } from '../../../../lib/supabase/queries/mainstreaming-blocks';
import { deleteStudentBlockedTime } from '../../../../lib/supabase/queries/student-blocked-times';
import type { ScheduleSession } from '@/src/types';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';
import { ResourceWeekView } from './components/resource-week-view';
import { getUserRole } from '../../../../lib/supabase/queries/sea-students';

function MainSchedule() {
  const { currentSchool, isSecondary } = useSchool();
  const { showToast } = useToast();
  const supabase = createClient();
  const teachers = useTeachers(supabase, currentSchool);
  const { sessionTags, setSessionTags } = useSessionTags();

  // Data management hook - called before useVisualFilters to have students available
  const {
    students,
    sessions,
    unscheduledSessions,
    bellSchedules,
    specialActivities,
    mainstreamingBlocks,
    studentBlockedTimes,
    studentPushInTimes,
    schoolHours,
    seaProfiles,
    otherSpecialists,
    unscheduledCount,
    currentUserId,
    providerRole,
    loading,
    error,
    refreshData,
    refreshSessions,
    refreshUnscheduledCount,
    optimisticUpdateSession,
  } = useScheduleData();

  // SPE-478: "Add Mainstreaming Block" shows only for providers whose account
  // is linked to their own classroom in the teacher directory — the SDC
  // dual-role marker (SPE-355). No new role or flag; the link IS the gate.
  const hasOwnClassroom = useMemo(
    () => !!currentUserId && teachers.some(t => t.account_id === currentUserId),
    [teachers, currentUserId]
  );
  // SPE-482: the caseload Auto-Schedule will actually place, which is the
  // provider's OWN students. For specialist roles `students` also carries
  // students from other providers' caseloads that are delegated to this user
  // (use-schedule-data appends them by assigned_to_specialist_id), while
  // handleScheduleSessions rebuilds its roster with provider_id = me and never
  // touches them. Reporting grouping coverage over the mixed array would
  // describe a population the run ignores — delegated students sharing a
  // teacher could hide that none of the provider's own students are groupable.
  const ownedStudents = useMemo(
    () => students.filter(student => student.provider_id === currentUserId),
    [students, currentUserId]
  );
  const [mainstreamingModalOpen, setMainstreamingModalOpen] = useState(false);
  // SPE-492: protected times surface at secondary sites first — that's where
  // the "don't pull during PE" need lives (JSUSD). The blocks themselves are
  // respected at any school level.
  const [blockedTimeModalOpen, setBlockedTimeModalOpen] = useState(false);

  // Deleting a block leaves any 'sits on protected/mainstreaming time' flag
  // it earned at creation; the full-validation reconcile (SPE-288) is the
  // safe way to clear the caller's now-stale flags — it re-checks EVERY rule,
  // so a flag with any other live cause survives. Other providers' flags
  // self-heal the same way on their next schedule view (Codex, PR #864).
  const reconcileAfterBlockDelete = useCallback(async () => {
    if (!currentUserId) return;
    try {
      await sessionUpdateService.reconcileStaleConflictsForProvider(currentUserId);
    } catch (err) {
      console.error('[schedule] post-delete reconcile failed:', err);
    }
  }, [currentUserId]);

  const handleBlockedTimeDelete = useCallback(
    async (blockId: string) => {
      try {
        await deleteStudentBlockedTime(blockId);
        await reconcileAfterBlockDelete();
        showToast('Protected time removed', 'success');
        refreshData();
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Failed to remove protected time',
          'error'
        );
      }
    },
    [showToast, refreshData, reconcileAfterBlockDelete]
  );
  const handleMainstreamingBlockDelete = useCallback(
    async (blockId: string) => {
      try {
        await deleteMainstreamingBlock(blockId);
        await reconcileAfterBlockDelete();
        showToast('Mainstreaming block removed', 'success');
        refreshData();
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Failed to remove mainstreaming block',
          'error'
        );
      }
    },
    [showToast, refreshData, reconcileAfterBlockDelete]
  );

  // Groups v2 (Phase 3): a click on a group plate or member pill opens the group
  // popover anchored to it; a member row drills into that session's details.
  const [groupPopover, setGroupPopover] = useState<GroupPopoverData | null>(null);
  const [sessionDetail, setSessionDetail] = useState<ScheduleSession | null>(null);
  const handleGroupClick = useCallback(
    (_groupId: string, _groupName: string, groupSessions: ScheduleSession[], triggerRect: DOMRect) => {
      setGroupPopover({ anchor: triggerRect, members: groupSessions });
    },
    []
  );
  const studentsMap = useMemo(
    () =>
      new Map<string, { initials: string; grade_level?: string }>(
        students.map(
          s =>
            [s.id, { initials: s.initials, grade_level: s.grade_level || undefined }] as [
              string,
              { initials: string; grade_level?: string }
            ]
        )
      ),
    [students]
  );

  // SPE-288 (pull-on-view): when this provider opens their schedule, clear any of THEIR
  // cross-provider conflict flags that the OTHER provider has since resolved. The flag
  // otherwise lingers until the owner next moves a session (an over-warning). Runs once per
  // mount; refreshes only if something was actually cleared. Best-effort — never blocks the view.
  const staleReconcileRef = useRef(false);
  useEffect(() => {
    if (!currentUserId || staleReconcileRef.current) return;
    staleReconcileRef.current = true;
    sessionUpdateService
      .reconcileStaleConflictsForProvider(currentUserId)
      .then(({ cleared }) => {
        if (cleared > 0) refreshSessions();
      })
      .catch((err) => console.error('[schedule] stale-conflict reconcile failed:', err));
  }, [currentUserId, refreshSessions]);

  // Visual filters hook - needs students for validation
  const { visualFilters, setVisualFilters } = useVisualFilters(
    currentSchool?.school_id,
    teachers,
    students,
    !isSecondary
  );

  // Fetch other provider sessions when a student is selected in filters
  const { sessions: otherProviderSessions } = useOtherProviderSessions(
    visualFilters.studentId
  );

  // UI state management hook
  const {
    selectedGrades,
    selectedTimeSlot,
    selectedDay,
    highlightedStudentId,
    sessionFilter,
    selectedSeaId,
    selectedSpecialistId,
    draggedSession,
    dragOffset,
    dragPosition,
    selectedSession,
    popupPosition,
    gridConfig,
    setSelectedTimeSlot,
    setSelectedDay,
    setSessionFilter,
    setSelectedSeaId,
    setSelectedSpecialistId,
    toggleGrade,
    clearTimeSlot,
    clearDay,
    clearHighlight,
    toggleHighlight,
    startDrag,
    updateDragPosition,
    endDrag,
    openSessionPopup,
    closeSessionPopup,
  } = useScheduleState();

  // Operations hook
  const {
    handleSessionDrop,
    validateDragOver,
    clearDragValidation,
  } = useScheduleOperations();

  // Unscheduled panel state
  const [isUnscheduledPanelDragOver, setIsUnscheduledPanelDragOver] = React.useState(false);
  const [isUnscheduledHeaderDragOver, setIsUnscheduledHeaderDragOver] = React.useState(false);

  // Handle drag start - Simple drag without validation
  const handleDragStart = useCallback((e: React.DragEvent, session: ScheduleSession) => {
    e.dataTransfer.effectAllowed = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    // Start the drag
    startDrag(session, offsetY);
  }, [startDrag]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    clearDragValidation();
    endDrag();
  }, [clearDragValidation, endDrag]);

  // Helper function to convert pixels to time
  const pixelsToTime = useCallback((pixels: number): string => {
    const totalMinutes = Math.round((pixels * 60) / gridConfig.pixelsPerHour);
    const hours = Math.floor(totalMinutes / 60) + gridConfig.startHour;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, [gridConfig.pixelsPerHour, gridConfig.startHour]);

  // Handle drag over - Just update position
  const handleDragOver = useCallback((e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedSession) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top - dragOffset;
    const snapInterval = gridConfig.snapInterval;
    const minutesFromStart = Math.round(((relativeY / gridConfig.pixelsPerHour) * 60) / snapInterval) * snapInterval;
    const time = pixelsToTime((minutesFromStart * gridConfig.pixelsPerHour) / 60);

    const nextPosition: ScheduleDragPosition = {
      day,
      time,
      pixelY: (minutesFromStart * gridConfig.pixelsPerHour) / 60,
    };

    updateDragPosition(nextPosition);
  }, [draggedSession, dragOffset, gridConfig, updateDragPosition, pixelsToTime]);

  // Groups v2 (Phase 3): after a VALID move, reconcile grouping for MATERIALIZED
  // groups. Derived clusters (no group_ref) need nothing — the plates re-derive
  // from the moved schedule. A pill dragged out of a materialized group leaves it
  // (retiring it if it empties); one dropped into a materialized group at its new
  // slot (same deliverer) joins it. Best-effort: never blocks the move.
  const reconcileGroupsAfterMove = useCallback(
    async (moved: ScheduleSession, newDay: number, newStart: string) => {
      const delivererKey = (s: ScheduleSession) =>
        `${s.delivered_by ?? 'provider'}|${s.assigned_to_sea_id ?? ''}|${s.assigned_to_specialist_id ?? ''}`;
      const hhmm = (t: string | null) => (t ?? '').slice(0, 5);
      const slotChanged = moved.day_of_week !== newDay || hhmm(moved.start_time) !== hhmm(newStart);
      const mutate = (body: Record<string, unknown>) =>
        fetch('/api/groups/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      try {
        let changed = false;
        if (moved.group_ref && slotChanged) {
          await mutate({ action: 'leave', sessionId: moved.id });
          changed = true;
        }
        // Join a materialized group already present at the destination slot.
        const target = sessions.find(
          s =>
            s.id !== moved.id &&
            s.session_date === null &&
            s.group_ref &&
            s.day_of_week === newDay &&
            hhmm(s.start_time) === hhmm(newStart) &&
            delivererKey(s) === delivererKey(moved)
        );
        if (target?.group_ref) {
          await mutate({ action: 'join', sessionId: moved.id, groupId: target.group_ref });
          changed = true;
        }
        if (changed) {
          refreshSessions();
          showToast('Group updated', 'success');
        }
      } catch (err) {
        console.error('Groups v2: reconcile after move failed', err);
      }
    },
    [sessions, refreshSessions, showToast]
  );

  // Handle drop
  const handleDrop = useCallback(async (e: React.DragEvent, day: number) => {
    e.preventDefault();

    if (!draggedSession || !dragPosition || dragPosition.day !== day) return;

    const student = students.find(s => s.id === draggedSession.student_id);
    if (!student) return;

    const sessionToMove = draggedSession;
    endDrag();
    clearDragValidation();

    // Optimistic update
    const minutesPerSession = student.minutes_per_session || 30; // Default to 30 if null
    const { startTime: newStartTime, endTime: newEndTime } = buildSessionTimes(
      dragPosition.time,
      minutesPerSession
    );

    // Determine assignment updates based on selected filter
    const assignmentUpdate = buildAssignmentUpdate(sessionFilter, selectedSeaId, selectedSpecialistId);

    optimisticUpdateSession(sessionToMove.id, {
      day_of_week: day,
      start_time: newStartTime,
      end_time: newEndTime,
      status: 'active', // Optimistically assume the move will be valid
      conflict_reason: null,
      ...assignmentUpdate,
    });

    // Perform actual update
    const result = await handleSessionDrop(sessionToMove, day, dragPosition.time, student);

    if (!result.success) {
      // Revert optimistic update, restoring original conflict status
      optimisticUpdateSession(sessionToMove.id, {
        day_of_week: sessionToMove.day_of_week,
        start_time: sessionToMove.start_time,
        end_time: sessionToMove.end_time,
        status: sessionToMove.status,
        conflict_reason: sessionToMove.conflict_reason,
        delivered_by: sessionToMove.delivered_by,
        assigned_to_sea_id: sessionToMove.assigned_to_sea_id,
        assigned_to_specialist_id: sessionToMove.assigned_to_specialist_id,
      });

      if (result.error) {
        alert(`Failed to update session: ${result.error}`);
      }
    } else {
      // If the move succeeded, also update assignment if needed
      if (Object.keys(assignmentUpdate).length > 0) {
        const { error: assignError } = await supabase
          .from('schedule_sessions')
          .update(assignmentUpdate)
          .eq('id', sessionToMove.id);

        if (assignError) {
          console.error('Failed to update session assignment:', assignError);
          // Revert the assignment part of the optimistic update
          optimisticUpdateSession(sessionToMove.id, {
            delivered_by: sessionToMove.delivered_by,
            assigned_to_sea_id: sessionToMove.assigned_to_sea_id,
            assigned_to_specialist_id: sessionToMove.assigned_to_specialist_id,
          });
          alert('Session was moved but assignment update failed. Please try assigning again.');
        }
      }

      // Groups v2: reconcile grouping for materialized groups after a valid move.
      await reconcileGroupsAfterMove(sessionToMove, day, newStartTime);

      if (result.hasConflicts && result.conflicts) {
        // If the move succeeded but created new conflicts, update the status
        optimisticUpdateSession(sessionToMove.id, {
          status: 'needs_attention',
          conflict_reason: result.conflicts.map(c => c.description).join(' AND '),
        });
      }
    }
  }, [draggedSession, dragPosition, students, endDrag, clearDragValidation, optimisticUpdateSession, handleSessionDrop, sessionFilter, selectedSeaId, selectedSpecialistId, supabase, reconcileGroupsAfterMove]);

  // Handle schedule complete
  const handleScheduleComplete = useCallback(() => {
    refreshSessions();
    refreshUnscheduledCount();
  }, [refreshSessions, refreshUnscheduledCount]);

  // Handle popup update
  const handlePopupUpdate = useCallback(() => {
    refreshSessions();
    closeSessionPopup();
  }, [refreshSessions, closeSessionPopup]);

  // Handle drag over unscheduled panel
  const handleUnscheduledPanelDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsUnscheduledPanelDragOver(true);
  }, []);

  // Handle drag leave from unscheduled panel
  const handleUnscheduledPanelDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsUnscheduledPanelDragOver(false);
  }, []);

  // Reset drag over state when drag ends
  useEffect(() => {
    if (!draggedSession) {
      setIsUnscheduledPanelDragOver(false);
      setIsUnscheduledHeaderDragOver(false);
    }
  }, [draggedSession]);

  // Shared logic for unscheduling a session
  const unscheduleSessionWithOptimisticUpdate = useCallback(async () => {
    if (!draggedSession) return;

    const sessionToUnschedule = draggedSession;
    endDrag();
    clearDragValidation();

    // Optimistically remove from grid by setting times to null
    optimisticUpdateSession(sessionToUnschedule.id, {
      day_of_week: null,
      start_time: null,
      end_time: null,
      status: 'active',
      conflict_reason: null,
    });

    // Perform actual unschedule
    const result = await sessionUpdateService.unscheduleSession(sessionToUnschedule.id);

    if (!result.success) {
      // Revert optimistic update
      optimisticUpdateSession(sessionToUnschedule.id, {
        day_of_week: sessionToUnschedule.day_of_week,
        start_time: sessionToUnschedule.start_time,
        end_time: sessionToUnschedule.end_time,
        status: sessionToUnschedule.status,
        conflict_reason: sessionToUnschedule.conflict_reason,
      });

      if (result.error) {
        alert(`Failed to unschedule session: ${result.error}`);
      }
    } else {
      // Refresh to get updated data
      await refreshSessions();
    }
  }, [draggedSession, endDrag, clearDragValidation, optimisticUpdateSession, refreshSessions]);

  // Handle drop into unscheduled panel (unschedule the session)
  const handleUnscheduledPanelDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsUnscheduledPanelDragOver(false);
    await unscheduleSessionWithOptimisticUpdate();
  }, [unscheduleSessionWithOptimisticUpdate]);

  // Handle drag over unscheduled header
  const handleUnscheduledHeaderDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsUnscheduledHeaderDragOver(true);
  }, []);

  // Handle drag leave from unscheduled header
  const handleUnscheduledHeaderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsUnscheduledHeaderDragOver(false);
  }, []);

  // Handle drop on unscheduled header (reuse same logic as panel drop)
  const handleUnscheduledHeaderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsUnscheduledHeaderDragOver(false);
    await unscheduleSessionWithOptimisticUpdate();
  }, [unscheduleSessionWithOptimisticUpdate]);

  // Handle clearing all sessions from a specific day
  const handleClearDay = useCallback(async (day: number) => {
    if (!currentUserId) return;

    const result = await sessionUpdateService.unscheduleDaySessions(currentUserId, day);

    if (result.success) {
      // Refresh sessions to reflect the changes
      await refreshSessions();
      alert(`Successfully cleared ${result.count || 0} sessions from the day`);
    } else {
      alert(`Failed to clear day: ${result.error}`);
    }
  }, [currentUserId, refreshSessions]);

  // Handle time slot click
  const handleTimeSlotClick = useCallback((time: string) => {
    if (selectedTimeSlot === time) {
      clearTimeSlot();
    } else {
      setSelectedTimeSlot(time);
      setSelectedDay(null);
    }
  }, [selectedTimeSlot, clearTimeSlot, setSelectedTimeSlot, setSelectedDay]);

  // Handle day click
  const handleDayClick = useCallback((day: number) => {
    if (selectedDay === day) {
      clearDay();
    } else {
      setSelectedDay(day);
      setSelectedTimeSlot(null);
    }
  }, [selectedDay, clearDay, setSelectedDay, setSelectedTimeSlot]);

  // Count filtered sessions using the same logic as the grid (templates only)
  const filteredSessionsCount = useMemo(() => {
    const templateSessions = sessions.filter(s => s.session_date === null);
    return filterScheduleSessions({
      sessions: templateSessions,
      sessionFilter,
      providerRole,
      currentUserId,
      selectedSeaId,
      selectedSpecialistId,
    }).length;
  }, [
    sessions,
    sessionFilter,
    providerRole,
    currentUserId,
    selectedSeaId,
    selectedSpecialistId,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearDragValidation();
    };
  }, [clearDragValidation]);

  // Show loading state
  if (loading) {
    return <ScheduleLoading />;
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Schedule</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={refreshData}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ScheduleErrorBoundary>
      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ScheduleHeader
            unscheduledCount={unscheduledCount}
            unscheduledPanelCount={unscheduledSessions.length}
            currentSchool={currentSchool}
            onScheduleComplete={handleScheduleComplete}
            students={ownedStudents}
            showMainstreamingButton={hasOwnClassroom}
            onAddMainstreamingBlock={() => setMainstreamingModalOpen(true)}
            showBlockedTimeButton={isSecondary}
            onAddBlockedTime={() => setBlockedTimeModalOpen(true)}
          />

          {/* SPE-588: elementary-only. Neither shading this panel drives can be
              accurate above elementary — a secondary bell row carries the whole
              grade span (SPE-491), so every grade paints the same bands, and the
              teacher filter reads Special Activities, a page secondary sites
              don't have. Rather than offer filters that can't tell the truth,
              hide the card; useVisualFilters is disabled in step, so no stored
              selection shades the grid behind it. */}
          {!isSecondary && (
            <ConflictFilterPanel
              bellSchedules={bellSchedules}
              specialActivities={specialActivities}
              students={students}
              teachers={teachers}
              selectedFilters={visualFilters}
              onFilterChange={setVisualFilters}
              hasOtherProviderSessions={otherProviderSessions.length > 0}
            />
          )}

          <ScheduleControls
            sessionFilter={sessionFilter}
            selectedGrades={selectedGrades}
            selectedTimeSlot={selectedTimeSlot}
            selectedDay={selectedDay}
            highlightedStudentId={highlightedStudentId}
            onSessionFilterChange={setSessionFilter}
            showSpecialistFilter={providerRole === 'resource' && otherSpecialists.length > 0}
            showAssignedFilter={isSpecialistSourceRole(providerRole)}
            onGradeToggle={toggleGrade}
            onTimeSlotClear={clearTimeSlot}
            onDayClear={clearDay}
            onHighlightClear={clearHighlight}
            seaProfiles={seaProfiles}
            otherSpecialists={otherSpecialists}
            selectedSeaId={selectedSeaId}
            selectedSpecialistId={selectedSpecialistId}
            onSeaSelect={setSelectedSeaId}
            onSpecialistSelect={setSelectedSpecialistId}
          />

          <ScheduleGrid
            sessions={sessions}
            students={students}
            schoolHours={schoolHours}
            bellSchedules={bellSchedules}
            specialActivities={specialActivities}
            mainstreamingBlocks={mainstreamingBlocks}
            onMainstreamingBlockDelete={currentUserId ? handleMainstreamingBlockDelete : undefined}
            studentBlockedTimes={studentBlockedTimes}
            onBlockedTimeDelete={currentUserId ? handleBlockedTimeDelete : undefined}
            studentPushInTimes={studentPushInTimes}
            teachers={teachers}
            visualFilters={visualFilters}
            otherProviderSessions={otherProviderSessions}
            selectedGrades={selectedGrades}
            selectedTimeSlot={selectedTimeSlot}
            selectedDay={selectedDay}
            highlightedStudentId={highlightedStudentId}
            sessionFilter={sessionFilter}
            selectedSeaId={selectedSeaId}
            selectedSpecialistId={selectedSpecialistId}
            draggedSession={draggedSession}
            dragPosition={dragPosition}
            selectedSession={selectedSession}
            popupPosition={popupPosition}
            seaProfiles={seaProfiles}
            otherSpecialists={otherSpecialists}
            providerRole={providerRole}
            currentUserId={currentUserId}
            gridConfig={gridConfig}
            sessionTags={sessionTags}
            setSessionTags={setSessionTags}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onTimeSlotClick={handleTimeSlotClick}
            onDayClick={handleDayClick}
            onSessionClick={openSessionPopup}
            onGroupClick={handleGroupClick}
            onHighlightToggle={toggleHighlight}
            onPopupClose={closeSessionPopup}
            onPopupUpdate={handlePopupUpdate}
            onClearDay={handleClearDay}
          />

          {/* Groups v2 (Phase 3): the group popover (name, color, meets, members,
              split), wired to the transactional mutation engine. A member row
              drills into that session's own details modal. */}
          {groupPopover && (
            <GroupPopover
              data={groupPopover}
              allSessions={sessions}
              students={studentsMap}
              seaProfiles={seaProfiles}
              otherSpecialists={otherSpecialists}
              onClose={() => setGroupPopover(null)}
              onMutated={refreshSessions}
              onOpenSession={(s) => { setGroupPopover(null); setSessionDetail(s); }}
            />
          )}
          {sessionDetail && (
            <SessionDetailsModal
              mode="session"
              isOpen={true}
              onClose={() => setSessionDetail(null)}
              session={sessionDetail}
              student={sessionDetail.student_id ? studentsMap.get(sessionDetail.student_id) : undefined}
              onUpdate={refreshSessions}
            />
          )}

          {/* SPE-478: mainstreaming block input (SDC dual-role providers only) */}
          <AddMainstreamingBlockModal
            isOpen={mainstreamingModalOpen}
            onClose={() => setMainstreamingModalOpen(false)}
            onSuccess={(sessionsFlagged) => {
              showToast(
                sessionsFlagged > 0
                  ? `Mainstreaming block added — ${sessionsFlagged} of your session${sessionsFlagged === 1 ? '' : 's'} now need${sessionsFlagged === 1 ? 's' : ''} attention`
                  : 'Mainstreaming block added',
                'success'
              );
              refreshData();
            }}
            students={students}
            teachers={teachers}
            existingBlocks={mainstreamingBlocks}
            currentUserId={currentUserId}
            schoolId={currentSchool?.school_id || null}
          />

          {/* SPE-492: protected time input (secondary sites) */}
          <AddBlockedTimeModal
            isOpen={blockedTimeModalOpen}
            onClose={() => setBlockedTimeModalOpen(false)}
            onSuccess={(sessionsFlagged) => {
              showToast(
                sessionsFlagged > 0
                  ? `Protected time added — ${sessionsFlagged} of your session${sessionsFlagged === 1 ? '' : 's'} now need${sessionsFlagged === 1 ? 's' : ''} attention`
                  : 'Protected time added',
                'success'
              );
              refreshData();
            }}
            students={students}
            existingBlockedTimes={studentBlockedTimes}
            currentUserId={currentUserId}
            schoolId={currentSchool?.school_id || null}
          />

          {/* Unscheduled Sessions Panel */}
          <UnscheduledSessionsPanel
            unscheduledSessions={unscheduledSessions}
            students={students}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleUnscheduledPanelDragOver}
            onDragLeave={handleUnscheduledPanelDragLeave}
            onDrop={handleUnscheduledPanelDrop}
            onHeaderDragOver={handleUnscheduledHeaderDragOver}
            onHeaderDrop={handleUnscheduledHeaderDrop}
            onHeaderDragLeave={handleUnscheduledHeaderDragLeave}
            draggedSessionId={draggedSession?.id || null}
            isDragOver={isUnscheduledPanelDragOver}
            isDragOverHeader={isUnscheduledHeaderDragOver}
            onSessionClick={openSessionPopup}
          />

          {/* Footer */}
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total Sessions: {filteredSessionsCount}
            </div>
            {/* Legend for assignment indicators */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-gray-400 rounded border-2 border-green-600"></div>
                <span>SEA Assigned</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-gray-400 rounded border-2 border-purple-400"></div>
                <span>Specialist Assigned</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScheduleErrorBoundary>
  );
}

/**
 * SPE-513: /dashboard/schedule is role-aware at secondary sites. Resource
 * providers get the period week view (their service is a weekly minutes
 * bucket embedded in class periods — SPE-424 — so the drag-and-drop time
 * grid's machinery is all noise for them, and creating time-based sessions
 * there is exactly the phantom-session mess SPE-425 cleaned up). Every other
 * role keeps the Main Schedule grid, including related services at secondary
 * (SPE-490).
 */
export default function SchedulePage() {
  const { isSecondary, loading: schoolLoading } = useSchool();
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // The role only matters on a secondary site — don't spend a round-trip
    // (or delay first paint) on the elementary majority path.
    if (schoolLoading || !isSecondary) return;
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setRoleLoaded(true);
        return;
      }
      const fetched = await getUserRole(user.id);
      if (!cancelled) {
        setRole(fetched);
        setRoleLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, schoolLoading, isSecondary]);

  if (schoolLoading) {
    return <ScheduleLoading />;
  }

  // Elementary (and unclassified) schools always get the grid — no role
  // round-trip needed.
  if (!isSecondary) {
    return <MainSchedule />;
  }

  // Secondary: wait for the role so a resource provider never sees the grid
  // flash before the week view replaces it.
  if (!roleLoaded) {
    return <ScheduleLoading />;
  }

  return role?.trim() === 'resource' ? <ResourceWeekView /> : <MainSchedule />;
}
