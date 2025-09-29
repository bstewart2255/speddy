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
import { useSchool } from '../../../components/providers/school-context';
import { createClient } from '../../../../lib/supabase/client';
import { useSessionTags } from './hooks/useSessionTags';
import { useVisualFilters } from './hooks/useVisualFilters';
import { useTeachers } from './hooks/useTeachers';
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
    endDate.setHours(hours, minutes + student.minutes_per_session, 0);
    const newEndTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}:00`;

    optimisticUpdateSession(sessionToMove.id, {
      day_of_week: day,
      start_time: newStartTime,
      end_time: newEndTime,
    });

    // Perform actual update
    const result = await handleSessionDrop(sessionToMove, day, dragPosition.time, student);
    
    if (!result.success) {
      // Revert optimistic update
      optimisticUpdateSession(sessionToMove.id, {
        day_of_week: sessionToMove.day_of_week,
        start_time: sessionToMove.start_time,
        end_time: sessionToMove.end_time,
      });
      
      if (result.error) {
        alert(`Failed to update session: ${result.error}`);
      }
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

  // Count filtered sessions using the same logic as the grid
  const filteredSessionsCount = useMemo(
    () => getFilteredSessions(sessions).length,
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
          />

          {/* Footer */}
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total Sessions: {filteredSessionsCount}
            </div>
            {/* Legend for assignment indicators */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-gray-400 rounded border-2 border-orange-400"></div>
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