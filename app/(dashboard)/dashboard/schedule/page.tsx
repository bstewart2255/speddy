'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { useScheduleState, type ScheduleDragPosition } from './hooks/use-schedule-state';
import { useScheduleData } from '../../../../lib/supabase/hooks/use-schedule-data';
import { useScheduleOperations } from '../../../../lib/supabase/hooks/use-schedule-operations';
import { ScheduleErrorBoundary } from '../../../components/schedule/schedule-error-boundary';
import { ScheduleHeader } from './components/schedule-header';
import { ScheduleControls } from './components/schedule-controls';
import { ScheduleGrid } from './components/schedule-grid';
import { ScheduleLoading } from './components/schedule-loading';
import { ConflictFilterPanel } from './components/ConflictFilterPanel';
import { UnscheduledSessionsPanel } from './components/unscheduled-sessions-panel';
import { useSchool } from '../../../components/providers/school-context';
import { createClient } from '../../../../lib/supabase/client';
import { useSessionTags } from './hooks/useSessionTags';
import { useVisualFilters } from './hooks/useVisualFilters';
import { useTeachers } from './hooks/useTeachers';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import type { ScheduleSession } from '@/src/types/database';

export default function SchedulePage() {
  const { currentSchool } = useSchool();
  const supabase = createClient();
  const teachers = useTeachers(supabase, currentSchool);
  const { visualFilters, setVisualFilters } = useVisualFilters(
    currentSchool?.school_id,
    teachers
  );
  const { sessionTags, setSessionTags } = useSessionTags();

  // Data management hook
  const {
    students,
    sessions,
    unscheduledSessions,
    bellSchedules,
    specialActivities,
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

  // UI state management hook
  const {
    selectedGrades,
    selectedTimeSlot,
    selectedDay,
    highlightedStudentId,
    sessionFilter,
    draggedSession,
    dragOffset,
    dragPosition,
    selectedSession,
    popupPosition,
    gridConfig,
    setSelectedTimeSlot,
    setSelectedDay,
    setSessionFilter,
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
    const newStartTime = `${dragPosition.time}:00`;
    const [hours, minutes] = dragPosition.time.split(':').map(Number);
    const endDate = new Date();
    const minutesPerSession = student.minutes_per_session || 30; // Default to 30 if null
    endDate.setHours(hours, minutes + minutesPerSession, 0);
    const newEndTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}:00`;

    optimisticUpdateSession(sessionToMove.id, {
      day_of_week: day,
      start_time: newStartTime,
      end_time: newEndTime,
      status: 'active', // Optimistically assume the move will be valid
      conflict_reason: null,
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
      });

      if (result.error) {
        alert(`Failed to update session: ${result.error}`);
      }
    } else if (result.hasConflicts && result.conflicts) {
      // If the move succeeded but created new conflicts, update the status
      optimisticUpdateSession(sessionToMove.id, {
        status: 'needs_attention',
        conflict_reason: result.conflicts.map(c => c.description).join(' AND '),
      });
    }
  }, [draggedSession, dragPosition, students, endDrag, clearDragValidation, optimisticUpdateSession, handleSessionDrop]);

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

  const getFilteredSessions = useCallback(
    (allSessions: ScheduleSession[]) => {
      // Special handling for SEA users - always show their assigned sessions
      if (providerRole === 'sea' && currentUserId) {
        return allSessions.filter(s => s.assigned_to_sea_id === currentUserId);
      }

      // Handle 'assigned' filter - show only sessions assigned to the current specialist
      if (sessionFilter === 'assigned' && currentUserId) {
        return allSessions.filter(s => s.assigned_to_specialist_id === currentUserId);
      }

      // Special handling for specialist users - show their assigned sessions for 'mine' filter
      if (['speech', 'ot', 'counseling', 'specialist', 'resource'].includes(providerRole) && currentUserId && sessionFilter === 'mine') {
        return allSessions.filter(s =>
          s.assigned_to_specialist_id === currentUserId ||
          (s.delivered_by === 'provider' && !s.assigned_to_sea_id && !s.assigned_to_specialist_id)
        );
      }

      // Standard filtering based on delivered_by
      switch (sessionFilter) {
        case 'mine':
          return allSessions.filter(s => s.delivered_by === 'provider');
        case 'sea':
          return allSessions.filter(s => s.delivered_by === 'sea');
        case 'specialist':
          return allSessions.filter(s => s.delivered_by === 'specialist');
        default:
          return allSessions;
      }
    },
    [providerRole, currentUserId, sessionFilter]
  );

  // Count filtered sessions using the same logic as the grid (templates only)
  const filteredSessionsCount = useMemo(
    () => getFilteredSessions(sessions.filter(s => s.session_date === null)).length,
    [getFilteredSessions, sessions]
  );

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
          />

          <ConflictFilterPanel
            bellSchedules={bellSchedules}
            specialActivities={specialActivities}
            students={students}
            teachers={teachers}
            selectedFilters={visualFilters}
            onFilterChange={setVisualFilters}
          />

          <ScheduleControls
            sessionFilter={sessionFilter}
            selectedGrades={selectedGrades}
            selectedTimeSlot={selectedTimeSlot}
            selectedDay={selectedDay}
            highlightedStudentId={highlightedStudentId}
            onSessionFilterChange={setSessionFilter}
            showSpecialistFilter={providerRole === 'resource' && otherSpecialists.length > 0}
            showAssignedFilter={['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(providerRole)}
            onGradeToggle={toggleGrade}
            onTimeSlotClear={clearTimeSlot}
            onDayClear={clearDay}
            onHighlightClear={clearHighlight}
          />

          <ScheduleGrid
            sessions={sessions}
            students={students}
            schoolHours={schoolHours}
            bellSchedules={bellSchedules}
            specialActivities={specialActivities}
            visualFilters={visualFilters}
            selectedGrades={selectedGrades}
            selectedTimeSlot={selectedTimeSlot}
            selectedDay={selectedDay}
            highlightedStudentId={highlightedStudentId}
            sessionFilter={sessionFilter}
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
            onHighlightToggle={toggleHighlight}
            onPopupClose={closeSessionPopup}
            onPopupUpdate={handlePopupUpdate}
            onClearDay={handleClearDay}
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