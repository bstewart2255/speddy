'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useScheduleState } from './hooks/use-schedule-state';
import { useScheduleData } from '../../../../lib/supabase/hooks/use-schedule-data';
import { useScheduleOperations } from '../../../../lib/supabase/hooks/use-schedule-operations';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import { getAllConflictsForSession } from '../../../../lib/utils/conflict-checker';
import { ScheduleErrorBoundary } from '../../../components/schedule/schedule-error-boundary';
import { ScheduleHeader } from './components/schedule-header';
import { ScheduleControls } from './components/schedule-controls';
import { ScheduleGrid } from './components/schedule-grid';
import { ScheduleLoading } from './components/schedule-loading';
import { useSchool } from '../../../components/providers/school-context';

export default function SchedulePage() {
  const { currentSchool } = useSchool();
  
  // Session tags state (persisted to localStorage)
  const [sessionTags, setSessionTags] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    
    const savedTags = localStorage.getItem('speddy-session-tags');
    if (savedTags) {
      try {
        return JSON.parse(savedTags);
      } catch (error) {
        return {};
      }
    }
    return {};
  });
  
  // Save tags to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('speddy-session-tags', JSON.stringify(sessionTags));
    }
  }, [sessionTags]);
  
  // Data management hook
  const {
    students,
    sessions,
    bellSchedules,
    specialActivities,
    schoolHours,
    seaProfiles,
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
    showSchoolHours,
    draggedSession,
    dragOffset,
    dragPosition,
    conflictSlots,
    selectedSession,
    popupPosition,
    gridConfig,
    setSelectedTimeSlot,
    setSelectedDay,
    setSessionFilter,
    setShowSchoolHours,
    toggleGrade,
    clearTimeSlot,
    clearDay,
    clearHighlight,
    toggleHighlight,
    startDrag,
    updateDragPosition,
    endDrag,
    updateConflictSlots,
    openSessionPopup,
    closeSessionPopup,
  } = useScheduleState();

  // Operations hook
  const {
    handleSessionDrop,
    validateDragOver,
    clearDragValidation,
  } = useScheduleOperations();

  // State for tracking conflict calculation
  const [isCalculatingConflicts, setIsCalculatingConflicts] = useState(false);

  // Handle drag start - Calculate conflicts for all slots
  const handleDragStart = useCallback(async (e: React.DragEvent, session: any) => {
    e.dataTransfer.effectAllowed = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    
    // Start the drag
    startDrag(session, offsetY);
    
    // Find the student being dragged
    const student = students.find(s => s.id === session.student_id);
    if (!student) return;
    
    // Calculate conflicts asynchronously
    setIsCalculatingConflicts(true);
    try {
      const currentStartTime = session.start_time.substring(0, 5);
      const conflicts = await getAllConflictsForSession(
        session.id,
        student.minutes_per_session,
        session.day_of_week,
        currentStartTime
      );
      updateConflictSlots(conflicts);
    } catch (error) {
      // On error, clear conflicts
      updateConflictSlots(new Set());
    } finally {
      setIsCalculatingConflicts(false);
    }
  }, [startDrag, students, updateConflictSlots]);

  // Handle drag end - Clear all conflict indicators
  const handleDragEnd = useCallback(() => {
    clearDragValidation();
    endDrag();
    updateConflictSlots(new Set()); // Clear all conflict indicators
    setIsCalculatingConflicts(false);
  }, [clearDragValidation, endDrag, updateConflictSlots]);

  // Handle drag over - Just update position, conflicts already pre-calculated
  const handleDragOver = useCallback((e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedSession) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top - dragOffset;
    const snapInterval = gridConfig.snapInterval;
    const minutesFromStart = Math.round(((relativeY / gridConfig.pixelsPerHour) * 60) / snapInterval) * snapInterval;
    const time = pixelsToTime((minutesFromStart * gridConfig.pixelsPerHour) / 60);

    updateDragPosition({
      day,
      time,
      pixelY: (minutesFromStart * gridConfig.pixelsPerHour) / 60,
    });
    
    // No validation needed here - conflicts are already pre-calculated
  }, [draggedSession, dragOffset, gridConfig, updateDragPosition]);

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

  // Helper function to convert pixels to time
  const pixelsToTime = (pixels: number): string => {
    const totalMinutes = Math.round((pixels * 60) / gridConfig.pixelsPerHour);
    const hours = Math.floor(totalMinutes / 60) + gridConfig.startHour;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

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

  // Count filtered sessions
  const filteredSessionsCount = providerRole === 'sea' && currentUserId
    ? sessions.filter(s => s.assigned_to_sea_id === currentUserId).length
    : sessionFilter === 'mine'
      ? sessions.filter(s => s.delivered_by !== 'sea').length
      : sessionFilter === 'sea'
        ? sessions.filter(s => s.delivered_by === 'sea').length
        : sessions.length;

  return (
    <ScheduleErrorBoundary>
      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ScheduleHeader
            unscheduledCount={unscheduledCount}
            currentSchool={currentSchool}
            onScheduleComplete={handleScheduleComplete}
          />

          <ScheduleControls
            sessionFilter={sessionFilter}
            selectedGrades={selectedGrades}
            selectedTimeSlot={selectedTimeSlot}
            selectedDay={selectedDay}
            highlightedStudentId={highlightedStudentId}
            showSchoolHours={showSchoolHours}
            onSessionFilterChange={setSessionFilter}
            onGradeToggle={toggleGrade}
            onTimeSlotClear={clearTimeSlot}
            onDayClear={clearDay}
            onHighlightClear={clearHighlight}
            onSchoolHoursToggle={setShowSchoolHours}
          />

          {/* Conflict calculation indicator */}
          {isCalculatingConflicts && (
            <div className="mb-2 p-2 bg-blue-100 border border-blue-300 rounded-md text-sm text-blue-800">
              <span className="inline-block animate-pulse">⏳</span> Calculating conflicts...
            </div>
          )}

          <ScheduleGrid
            sessions={sessions}
            students={students}
            schoolHours={schoolHours}
            selectedGrades={selectedGrades}
            selectedTimeSlot={selectedTimeSlot}
            selectedDay={selectedDay}
            highlightedStudentId={highlightedStudentId}
            sessionFilter={sessionFilter}
            showSchoolHours={showSchoolHours}
            draggedSession={draggedSession}
            dragPosition={dragPosition}
            conflictSlots={conflictSlots}
            selectedSession={selectedSession}
            popupPosition={popupPosition}
            seaProfiles={seaProfiles}
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
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showSchoolHours}
                onChange={(e) => setShowSchoolHours(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show school hours
            </label>
          </div>
        </div>
      </div>
    </ScheduleErrorBoundary>
  );
}