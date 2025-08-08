'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { useScheduleState } from './hooks/use-schedule-state';
import { useScheduleData } from '../../../../lib/supabase/hooks/use-schedule-data';
import { useScheduleOperations } from '../../../../lib/supabase/hooks/use-schedule-operations';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import { fastConflictDetectionService } from '../../../../lib/services/fast-conflict-detection-service';
import { ScheduleErrorBoundary } from '../../../components/schedule/schedule-error-boundary';
import { ScheduleHeader } from './components/schedule-header';
import { ScheduleControls } from './components/schedule-controls';
import { ScheduleGrid } from './components/schedule-grid';
import { ScheduleLoading } from './components/schedule-loading';
import { useSchool } from '../../../components/providers/school-context';

export default function SchedulePage() {
  const { currentSchool } = useSchool();
  
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

  // Add ref to track current drag calculation
  const conflictCalculationRef = useRef<AbortController | null>(null);
  
  // Feature flag to switch between old and new conflict detection
  const USE_FAST_CONFLICT_DETECTION = true;
  
  // Handle drag start - Pre-calculate conflicts using FAST method
  const handleDragStart = useCallback((e: React.DragEvent, session: any) => {
    e.dataTransfer.effectAllowed = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    
    // Start the drag
    startDrag(session, offsetY);
    
    // Find the student being dragged
    const student = students.find(s => s.id === session.student_id);
    if (!student) return;
    
    if (USE_FAST_CONFLICT_DETECTION) {
      // NEW FAST METHOD
      // Abort any previous calculation
      if (conflictCalculationRef.current) {
        conflictCalculationRef.current.abort();
      }
      conflictCalculationRef.current = new AbortController();
      
      // Get current day for priority
      const currentDay = new Date().getDay() || 7; // Convert Sunday (0) to 7
      const weekDay = currentDay <= 5 ? currentDay : 1; // Default to Monday if weekend
      
      // Use FAST conflict detection service
      console.time('[DragStart] Total conflict calculation');
      
      // Prepare conflict check data
      const conflictCheckData = {
        bellSchedules,
        specialActivities,
        existingSessions: sessions,
        studentData: {
          id: student.id,
          grade_level: student.grade_level,
          teacher_name: student.teacher_name,
          minutes_per_session: student.minutes_per_session
        },
        providerId: currentUserId || '',
        schoolHours: schoolHours.map(sh => ({
          grade_level: sh.grade_level,
          start_time: sh.start_time,
          end_time: sh.end_time
        }))
      };
      
      // Calculate conflicts progressively
      fastConflictDetectionService.calculateConflictsProgressive(
        conflictCheckData,
        session.id,
        weekDay,
        (conflicts) => {
          // Update UI progressively as conflicts are found
          if (!conflictCalculationRef.current?.signal.aborted) {
            updateConflictSlots(conflicts);
          }
        }
      ).then((finalConflicts) => {
        console.timeEnd('[DragStart] Total conflict calculation');
        console.log('[DragStart] Final conflicts count:', finalConflicts.size);
        if (!conflictCalculationRef.current?.signal.aborted) {
          updateConflictSlots(finalConflicts);
        }
      }).catch((error) => {
        console.error('[DragStart] Error calculating conflicts:', error);
      });
    } else {
      // OLD METHOD (for comparison)
      console.warn('Using OLD conflict detection method - this is slow!');
      console.time('[DragStart] OLD Total conflict calculation');
      
      (async () => {
        const conflictedSlots = new Set<string>();
        const snapInterval = gridConfig.snapInterval;
        const startHour = gridConfig.startHour;
        const endHour = gridConfig.endHour;
        
        const slotsToCheck: Array<{day: number, timeStr: string, slotKey: string}> = [];
        
        for (let day = 1; day <= 5; day++) {
          for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += snapInterval) {
              const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
              const slotKey = `${day}-${timeStr}`;
              
              const currentStartTime = session.start_time.substring(0, 5);
              if (day === session.day_of_week && timeStr === currentStartTime) {
                continue;
              }
              
              const endMinutes = hour * 60 + minute + student.minutes_per_session;
              if (endMinutes > endHour * 60) {
                conflictedSlots.add(slotKey);
                continue;
              }
              
              slotsToCheck.push({day, timeStr, slotKey});
            }
          }
        }
        
        const batchSize = 10;
        for (let i = 0; i < slotsToCheck.length; i += batchSize) {
          const batch = slotsToCheck.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async ({day, timeStr, slotKey}) => {
            const [hour, minute] = timeStr.split(':').map(Number);
            const endMinutes = hour * 60 + minute + student.minutes_per_session;
            const endHour = Math.floor(endMinutes / 60);
            const endMinute = endMinutes % 60;
            const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
            const startTimeWithSeconds = `${timeStr}:00`;
            
            try {
              const validation = await sessionUpdateService.validateOnly(
                session.id,
                day,
                startTimeWithSeconds,
                endTimeStr
              );
              
              if (!validation.valid) {
                conflictedSlots.add(slotKey);
              }
            } catch (error) {
              console.error(`Error validating slot ${slotKey}:`, error);
              conflictedSlots.add(slotKey);
            }
          }));
          
          updateConflictSlots(new Set(conflictedSlots));
        }
        
        console.timeEnd('[DragStart] OLD Total conflict calculation');
        console.log('[DragStart] OLD Final conflicts count:', conflictedSlots.size);
      })();
    }
  }, [startDrag, students, bellSchedules, specialActivities, sessions, currentUserId, schoolHours, gridConfig, updateConflictSlots, sessionUpdateService]);

  // Handle drag end - Clear all conflict indicators
  const handleDragEnd = useCallback(() => {
    // Abort any ongoing conflict calculation
    if (conflictCalculationRef.current) {
      conflictCalculationRef.current.abort();
      conflictCalculationRef.current = null;
    }
    
    clearDragValidation();
    endDrag();
    updateConflictSlots(new Set()); // Clear all conflict indicators
    fastConflictDetectionService.clearCache(); // Clear cached data
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