'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DEFAULT_SCHEDULING_CONFIG } from '../../../../../lib/scheduling/scheduling-config';
import type { ScheduleSession } from '@/src/types/database';

export interface ScheduleDragPosition {
  day: number;
  time: string;
  pixelY: number;
}

export interface ScheduleUIState {
  selectedGrades: Set<string>;
  selectedTimeSlot: string | null;
  selectedDay: number | null;
  highlightedStudentId: string | null;
  sessionFilter: 'all' | 'mine' | 'sea' | 'specialist';
  draggedSession: ScheduleSession | null;
  dragOffset: number;
  dragPosition: ScheduleDragPosition | null;
  selectedSession: ScheduleSession | null;
  popupPosition: DOMRect | null;
}

export function useScheduleState() {
  // Filter states
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(
    new Set(['K', '1', '2', '3', '4', '5'])
  );
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'mine' | 'sea' | 'specialist'>('all');

  // Drag and drop states
  const [draggedSession, setDraggedSession] = useState<ScheduleSession | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [dragPosition, setDragPosition] = useState<ScheduleDragPosition | null>(null);

  // Popup states
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const [popupPosition, setPopupPosition] = useState<DOMRect | null>(null);

  // Grid configuration from config
  const gridConfig = useMemo(() => ({
    startHour: DEFAULT_SCHEDULING_CONFIG.gridStartHour,
    endHour: DEFAULT_SCHEDULING_CONFIG.gridEndHour,
    pixelsPerHour: DEFAULT_SCHEDULING_CONFIG.pixelsPerHour,
    snapInterval: DEFAULT_SCHEDULING_CONFIG.snapInterval,
    totalHeight: (DEFAULT_SCHEDULING_CONFIG.gridEndHour - DEFAULT_SCHEDULING_CONFIG.gridStartHour) * DEFAULT_SCHEDULING_CONFIG.pixelsPerHour,
  }), []);

  // Filter handlers
  const toggleGrade = useCallback((grade: string) => {
    setSelectedGrades(prev => {
      const newSet = new Set(prev);
      if (newSet.has(grade)) {
        newSet.delete(grade);
      } else {
        newSet.add(grade);
      }
      return newSet;
    });
  }, []);

  const clearTimeSlot = useCallback(() => {
    setSelectedTimeSlot(null);
  }, []);

  const clearDay = useCallback(() => {
    setSelectedDay(null);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightedStudentId(null);
  }, []);

  const toggleHighlight = useCallback((studentId: string) => {
    setHighlightedStudentId(prev => prev === studentId ? null : studentId);
  }, []);

  // Drag handlers
  const startDrag = useCallback((session: ScheduleSession, offset: number) => {
    setDraggedSession(session);
    setDragOffset(offset);
  }, []);

  const updateDragPosition = useCallback((position: ScheduleDragPosition | null) => {
    setDragPosition(position);
  }, []);

  const endDrag = useCallback(() => {
    setDraggedSession(null);
    setDragOffset(0);
    setDragPosition(null);
  }, []);


  // Popup handlers
  const openSessionPopup = useCallback((session: ScheduleSession, triggerRect: DOMRect) => {
    setSelectedSession(session);
    setPopupPosition(triggerRect);
  }, []);

  const closeSessionPopup = useCallback(() => {
    setSelectedSession(null);
    setPopupPosition(null);
  }, []);

  // Handle click outside for popup
  useEffect(() => {
    if (!selectedSession || !popupPosition) return;

    const handleClickOutside = (event: MouseEvent) => {
      const popupElement = document.getElementById('session-assignment-popup');
      if (popupElement && popupElement.contains(event.target as Node)) {
        return;
      }
      closeSessionPopup();
    };

    // Use a slight delay to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedSession, popupPosition, closeSessionPopup]);

  return {
    // States
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

    // Filter handlers
    setSelectedGrades,
    setSelectedTimeSlot,
    setSelectedDay,
    setSessionFilter,
    toggleGrade,
    clearTimeSlot,
    clearDay,
    clearHighlight,
    toggleHighlight,

    // Drag handlers
    startDrag,
    updateDragPosition,
    endDrag,

    // Popup handlers
    openSessionPopup,
    closeSessionPopup,
  };
}