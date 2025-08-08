'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useScheduleState } from './hooks/use-schedule-state';
import { useScheduleData } from '../../../../lib/supabase/hooks/use-schedule-data';
import { useScheduleOperations } from '../../../../lib/supabase/hooks/use-schedule-operations';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import { optimizedConflictDetectionService } from '../../../../lib/services/optimized-conflict-detection-service';
import { ScheduleErrorBoundary } from '../../../components/schedule/schedule-error-boundary';
import { ScheduleHeader } from './components/schedule-header';
import { ScheduleControls } from './components/schedule-controls';
import { ScheduleGrid } from './components/schedule-grid';
import { ScheduleLoading } from './components/schedule-loading';
import { useSchool } from '../../../components/providers/school-context';

export default function SchedulePage() {
  const { currentSchool } = useSchool();
  
  // Session tags state (persisted to localStorage) - Initialize with localStorage data
  const [sessionTags, setSessionTags] = useState<Record<string, string>>(() => {
    console.log('[SchedulePage] Initializing sessionTags from localStorage...');
    if (typeof window === 'undefined') {
      return {};
    }
    
    const savedTags = localStorage.getItem('speddy-session-tags');
    if (savedTags) {
      try {
        const parsedTags = JSON.parse(savedTags);
        console.log('[SchedulePage] Initialized with tags from localStorage:', parsedTags);
        return parsedTags;
      } catch (error) {
        console.error('[SchedulePage] Failed to parse saved tags:', error);
        return {};
      }
    } else {
      console.log('[SchedulePage] No saved tags found, initializing empty');
      return {};
    }
  });
  
  // Track if this is the first render to avoid saving on mount
  const isFirstRender = useRef(true);
  
  // Save tags to localStorage whenever they change (but not on first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      console.log('[SchedulePage] First render, skipping localStorage save');
      return;
    }
    
    console.log('[SchedulePage] sessionTags state changed:', sessionTags);
    console.log('[SchedulePage] Saving to localStorage:', JSON.stringify(sessionTags));
    localStorage.setItem('speddy-session-tags', JSON.stringify(sessionTags));
    
    // Verify what was actually saved
    const verifyStored = localStorage.getItem('speddy-session-tags');
    console.log('[SchedulePage] Verified localStorage content:', verifyStored);
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

  // Add ref to track if data has been cached
  const dataCachedRef = useRef(false);
  const [cacheReady, setCacheReady] = useState(false);
  
  // Feature flag to switch between old and new conflict detection
  const USE_OPTIMIZED_CONFLICT_DETECTION = true;
  
  // Cache all data when it loads (happens once per page load)
  useEffect(() => {
    if (!loading && students.length > 0 && !dataCachedRef.current) {
      console.log('[Schedule] Caching all schedule data for conflict detection');
      optimizedConflictDetectionService.loadAndCacheData({
        bellSchedules,
        specialActivities,
        existingSessions: sessions,
        schoolHours: schoolHours.map(sh => ({
          grade_level: sh.grade_level,
          start_time: sh.start_time,
          end_time: sh.end_time
        })),
        students: students.map(s => ({
          id: s.id,
          grade_level: s.grade_level,
          teacher_name: s.teacher_name,
          minutes_per_session: s.minutes_per_session
        }))
      }).then(() => {
        dataCachedRef.current = true;
        setCacheReady(true);
        console.log('[Schedule] Data cached successfully');
      }).catch(error => {
        console.error('[Schedule] Failed to cache data:', error);
        setCacheReady(false);
      });
    }
  }, [loading, students, bellSchedules, specialActivities, sessions, schoolHours]);

  // NEW: Refresh cache when data changes or cache goes stale
  useEffect(() => {
    if (loading) return;

    // Only run after initial cache has been created
    if (!dataCachedRef.current) return;

    let status: { itemCounts?: any } | undefined;
    try {
      status = optimizedConflictDetectionService.getCacheStatus?.();
    } catch (e) {
      // If the service doesn't support getCacheStatus, skip counts check
    }

    const countsChanged =
      !!status?.itemCounts &&
      (
        status.itemCounts.sessions !== sessions.length ||
        status.itemCounts.bellSchedules !== bellSchedules.length ||
        status.itemCounts.specialActivities !== specialActivities.length ||
        status.itemCounts.students !== students.length
      );

    const stale =
      typeof optimizedConflictDetectionService.isDataStale === 'function'
        ? optimizedConflictDetectionService.isDataStale()
        : false;

    if (countsChanged || stale) {
      setCacheReady(false);
      optimizedConflictDetectionService
        .loadAndCacheData({
          bellSchedules,
          specialActivities,
          existingSessions: sessions,
          schoolHours: schoolHours.map((sh) => ({
            grade_level: sh.grade_level,
            start_time: sh.start_time,
            end_time: sh.end_time,
          })),
          students: students.map((s) => ({
            id: s.id,
            grade_level: s.grade_level,
            teacher_name: s.teacher_name,
            minutes_per_session: s.minutes_per_session,
          })),
        })
        .then(() => {
          setCacheReady(true);
          console.log('[Schedule] Cache refreshed');
        })
        .catch((error) => {
          console.error('[Schedule] Failed to refresh cache:', error);
        });
    }
  }, [
    loading,
    sessions,
    bellSchedules,
    specialActivities,
    schoolHours,
    students,
  ]);

  // Handle drag start - Pre-calculate conflicts using OPTIMIZED method
  const handleDragStart = useCallback((e: React.DragEvent, session: any) => {
    // Prevent drag if cache is not ready
    if (!cacheReady && USE_OPTIMIZED_CONFLICT_DETECTION) {
      e.preventDefault();
      console.warn('[DragStart] Cache not ready, preventing drag');
      return;
    }
    
    e.dataTransfer.effectAllowed = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    
    // Start the drag
    startDrag(session, offsetY);
    
    // Find the student being dragged
    const student = students.find(s => s.id === session.student_id);
    if (!student) return;
    
    if (USE_OPTIMIZED_CONFLICT_DETECTION) {
      // NEW OPTIMIZED METHOD - INSTANT, NO ASYNC
      console.time('[DragStart] Optimized conflict calculation');
      
      // Check if data is cached
      const cacheStatus = optimizedConflictDetectionService.getCacheStatus();
      if (!cacheStatus.isLoaded) {
        console.warn('[DragStart] Cache not loaded, loading now...');
        // Fallback: load data now (should rarely happen)
        optimizedConflictDetectionService.loadAndCacheData({
          bellSchedules,
          specialActivities,
          existingSessions: sessions,
          schoolHours: schoolHours.map(sh => ({
            grade_level: sh.grade_level,
            start_time: sh.start_time,
            end_time: sh.end_time
          })),
          students: students.map(s => ({
            id: s.id,
            grade_level: s.grade_level,
            teacher_name: s.teacher_name,
            minutes_per_session: s.minutes_per_session
          }))
        }).then(() => {
          // Calculate conflicts after loading
          const conflicts = optimizedConflictDetectionService.calculateConflictsInstant(
            session.id,
            student.id,
            student.grade_level,
            student.teacher_name,
            student.minutes_per_session
          );
          updateConflictSlots(conflicts);
          console.timeEnd('[DragStart] Optimized conflict calculation');
          console.log('[DragStart] Conflicts found:', conflicts.size);
        });
        return;
      }
      
      // Calculate conflicts instantly (no async, no await)
      const conflicts = optimizedConflictDetectionService.calculateConflictsInstant(
        session.id,
        student.id,
        student.grade_level,
        student.teacher_name,
        student.minutes_per_session
      );
      
      // Update UI immediately
      updateConflictSlots(conflicts);
      
      console.timeEnd('[DragStart] Optimized conflict calculation');
      console.log('[DragStart] Conflicts found:', conflicts.size, 'Cache age:', cacheStatus.dataAge + 'ms');
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
  }, [startDrag, students, bellSchedules, specialActivities, sessions, currentUserId, schoolHours, gridConfig, updateConflictSlots, cacheReady]);

  // Handle drag end - Clear all conflict indicators
  const handleDragEnd = useCallback(() => {
    clearDragValidation();
    endDrag();
    updateConflictSlots(new Set()); // Clear all conflict indicators
    // Note: We don't clear the cache here - it persists for the entire page session
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
      optimizedConflictDetectionService.clearCache();
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

          {/* Cache Status Indicator - Only show when loading */}
          {USE_OPTIMIZED_CONFLICT_DETECTION && !cacheReady && (
            <div className="mb-2 p-2 bg-yellow-100 border border-yellow-300 rounded-md text-sm text-yellow-800">
              <span className="inline-block animate-pulse">⏳</span> Preparing conflict detection... 
              Sessions may not be draggable until ready.
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