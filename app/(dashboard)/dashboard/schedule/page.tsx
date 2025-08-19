'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useScheduleState } from './hooks/use-schedule-state';
import { useScheduleData } from '../../../../lib/supabase/hooks/use-schedule-data';
import { useScheduleOperations } from '../../../../lib/supabase/hooks/use-schedule-operations';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import { ScheduleErrorBoundary } from '../../../components/schedule/schedule-error-boundary';
import { ScheduleHeader } from './components/schedule-header';
import { ScheduleControls } from './components/schedule-controls';
import { ScheduleGrid } from './components/schedule-grid';
import { ScheduleLoading } from './components/schedule-loading';
import { ConflictFilterPanel } from './components/ConflictFilterPanel';
import { useSchool } from '../../../components/providers/school-context';
import { createClient } from '../../../../lib/supabase/client';

export default function SchedulePage() {
  const { currentSchool } = useSchool();
  const supabase = createClient();
  const [teachers, setTeachers] = useState<any[]>([]);
  
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
  
  // Helper function to generate school-specific localStorage keys
  const getSchoolSpecificKey = (key: string, schoolId?: string) => {
    if (!schoolId) return key; // fallback for no school
    return `${key}-${schoolId}`;
  };

  // Visual filter state (persisted to localStorage with school-specific keys)
  const [visualFilters, setVisualFilters] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        bellScheduleGrade: null as string | null,
        specialActivityTeacher: null as string | null,
      };
    }
    
    const savedFilters = localStorage.getItem(
      getSchoolSpecificKey('speddy-visual-filters', currentSchool?.school_id)
    );
    if (savedFilters) {
      try {
        return JSON.parse(savedFilters);
      } catch {
        return {
          bellScheduleGrade: null as string | null,
          specialActivityTeacher: null as string | null,
        };
      }
    }
    
    return {
      bellScheduleGrade: null as string | null,
      specialActivityTeacher: null as string | null,
    };
  });
  
  // Debounced save function to avoid excessive localStorage writes
  const debouncedSaveFilters = useMemo(() => {
    let timeoutId: number;
    return (filters: typeof visualFilters, schoolId?: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (typeof window !== 'undefined') {
          const key = getSchoolSpecificKey('speddy-visual-filters', schoolId);
          localStorage.setItem(key, JSON.stringify(filters));
        }
      }, 300); // 300ms debounce delay
    };
  }, []);

  // Save visual filters to localStorage with school-specific key (debounced)
  useEffect(() => {
    debouncedSaveFilters(visualFilters, currentSchool?.school_id);
  }, [visualFilters, currentSchool?.school_id, debouncedSaveFilters]);

  // Clear visual filters when switching schools if teacher is not valid
  useEffect(() => {
    if (currentSchool?.school_id && visualFilters.specialActivityTeacher) {
      // Check if the selected teacher exists in the current school's teacher list
      const teacherExists = teachers.some(teacher => {
        // Handle both string format and object format
        const teacherName = typeof teacher === 'string' ? teacher : 
          `${teacher.first_name} ${teacher.last_name}`.trim();
        return teacherName === visualFilters.specialActivityTeacher;
      });
      
      if (!teacherExists) {
        console.log('[SchedulePage] Clearing teacher filter - teacher not found in current school:', visualFilters.specialActivityTeacher);
        setVisualFilters(prev => ({
          ...prev,
          specialActivityTeacher: null,
        }));
      }
    }
  }, [currentSchool?.school_id, teachers, visualFilters.specialActivityTeacher]);
  
  // Fetch teachers from the teachers table filtered by current school
  useEffect(() => {
    async function fetchTeachers() {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;
      
      console.log('[SchedulePage] Current school for teacher fetch:', {
        display_name: currentSchool?.display_name,
        school_id: currentSchool?.school_id,
        school_site: currentSchool?.school_site,
        school_district: currentSchool?.school_district
      });
      
      // First, fetch all teachers for this provider to check their school_id values
      const { data: allTeachers, error: checkError } = await supabase
        .from('teachers')
        .select('*')
        .eq('provider_id', user.user.id);
      
      if (checkError) {
        console.error('[SchedulePage] Error checking teachers:', checkError);
        return;
      }
      
      console.log('[SchedulePage] All teachers before filtering:');
      allTeachers?.forEach(t => {
        console.log(`  - ${t.first_name} ${t.last_name}: school_id = "${t.school_id}"`);
      });
      
      // Build query with provider filter
      let query = supabase
        .from('teachers')
        .select('*')
        .eq('provider_id', user.user.id);
      
      // Add school filter if current school has a school_id
      // Only filter if teachers actually have school_id values set
      if (currentSchool?.school_id && allTeachers?.some(t => t.school_id)) {
        console.log('[SchedulePage] Applying filter - school_id:', currentSchool.school_id);
        console.log('[SchedulePage] Teachers with this school_id:', allTeachers.filter(t => t.school_id === currentSchool.school_id).length);
        console.log('[SchedulePage] Teachers with different school_id:', allTeachers.filter(t => t.school_id !== currentSchool.school_id).map(t => ({
          name: `${t.first_name} ${t.last_name}`,
          school_id: t.school_id
        })));
        query = query.eq('school_id', currentSchool.school_id);
      } else if (currentSchool?.school_id) {
        // If current school has school_id but teachers don't have school_id set,
        // we can't filter properly - log a warning
        console.warn('[SchedulePage] Current school has school_id but teachers do not have school_id values set');
      }
      
      // Execute query with ordering
      console.log('[SchedulePage] Executing query with school_id filter:', currentSchool?.school_id || 'none');
      const { data, error } = await query.order('last_name');
      
      if (data && !error) {
        console.log('[SchedulePage] Fetched teachers after filtering:', data.length, 'for school:', currentSchool?.display_name);
        console.log('[SchedulePage] Filtered teachers with school_ids:');
        data.forEach(t => {
          console.log(`  - ${t.first_name} ${t.last_name}: school_id = "${t.school_id}"`);
        });
        setTeachers(data);
      } else {
        console.error('[SchedulePage] Error fetching teachers:', error);
      }
    }
    
    fetchTeachers();
  }, [supabase, currentSchool]);
  
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
  const handleDragStart = useCallback((e: React.DragEvent, session: any) => {
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

    updateDragPosition({
      day,
      time,
      pixelY: (minutesFromStart * gridConfig.pixelsPerHour) / 60,
    });
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
          </div>
        </div>
      </div>
    </ScheduleErrorBoundary>
  );
}