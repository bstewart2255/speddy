"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Database } from '../../../src/types/database';
import { createClient } from '@/lib/supabase/client';
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { ensureSessionsPersisted } from '@/lib/services/session-persistence';
import { SessionGenerator } from '@/lib/services/session-generator';
import { cn } from '@/src/utils/cn';
import { useToast } from '../../contexts/toast-context';
import { toDateKeyLocal } from '../../utils/date-helpers';
import { useSchool } from '../providers/school-context';
import { filterSessionsBySchool } from '@/lib/utils/session-filters';
import { log } from '@/lib/monitoring/logger';
import { formatDateLocal } from '@/lib/utils/date-helpers';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];

interface CalendarDayViewProps {
  sessions: ScheduleSession[];
  students: Map<string, { initials: string; grade_level?: string }>;
  onSessionClick?: (session: ScheduleSession) => void;
  currentDate?: Date;
  holidays?: Array<{ date: string; name?: string }>;
  calendarEvents?: CalendarEvent[];
  onAddEvent?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

export function CalendarDayView({
  sessions,
  students,
  onSessionClick,
  currentDate = new Date(),
  holidays = [],
  calendarEvents = [],
  onAddEvent,
  onEventClick
}: CalendarDayViewProps) {
  const { showToast } = useToast();
  const { currentSchool } = useSchool();

  const [sessionsState, setSessionsState] = useState<ScheduleSession[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});

  // State for students fetched from assigned sessions
  const [additionalStudents, setAdditionalStudents] = useState<Map<string, { initials: string; grade_level?: string }>>(new Map());

  // Grouping state
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [groupingModalOpen, setGroupingModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  const supabase = useMemo(() => createClient<Database>(), []);
  const sessionGenerator = useMemo(() => new SessionGenerator(), []);

  // Group color mapping (cycle through colors for different groups)
  const groupColors = [
    { border: 'border-l-4 border-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', badgeWithLesson: 'bg-blue-600 text-white' },
    { border: 'border-l-4 border-green-500', bg: 'bg-green-50', badge: 'bg-green-100 text-green-700', badgeWithLesson: 'bg-green-600 text-white' },
    { border: 'border-l-4 border-purple-500', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700', badgeWithLesson: 'bg-purple-600 text-white' },
    { border: 'border-l-4 border-orange-500', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', badgeWithLesson: 'bg-orange-600 text-white' },
    { border: 'border-l-4 border-pink-500', bg: 'bg-pink-50', badge: 'bg-pink-100 text-pink-700', badgeWithLesson: 'bg-pink-600 text-white' },
  ];

  // Get color for a group (deterministic based on group_id)
  const getGroupColor = (groupId: string) => {
    // Use a simple hash of the group ID to pick a color
    const hash = groupId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return groupColors[hash % groupColors.length];
  };

  // Helper function to check if session is temporary (not saved to database)
  const isTemporarySession = (sessionId: string): boolean => {
    return sessionId.startsWith('temp-');
  };

  // Helper function for time conversion
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to check if current user can group a session
  const canUserGroupSession = (session: ScheduleSession): boolean => {
    if (!providerId) return false;

    // User can group sessions they own AND are delivering themselves
    if (session.delivered_by === 'provider' && session.provider_id === providerId) {
      return true;
    }

    // User can also group sessions they are assigned to deliver
    if (session.delivered_by === 'specialist' && session.assigned_to_specialist_id === providerId) {
      return true;
    }
    if (session.delivered_by === 'sea' && session.assigned_to_sea_id === providerId) {
      return true;
    }

    return false;
  };

  // Load sessions and user info for the current date
  React.useEffect(() => {
    const loadSessions = async () => {
      if (!currentDate) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUser(user);
      setProviderId(user.id);

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, school_site, school_district, works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      setUserProfile(profile);

      // If user works at multiple schools and no school is selected yet, wait
      if (profile?.works_at_multiple_schools && !currentSchool) {
        log.info('[CalendarDayView] Waiting for school selection');
        setSessionsState([]);
        return;
      }

      // Format current date as YYYY-MM-DD in local timezone
      const dateStr = formatDateLocal(currentDate);

      // Use SessionGenerator to get sessions for this day
      // This will return both:
      // 1. Existing instances from the database
      // 2. Temporary instances created from templates (if database instances don't exist)
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const sessions = await sessionGenerator.getSessionsForDateRange(user.id, dayStart, dayEnd, profile?.role);

      log.info('[CalendarDayView] SessionGenerator returned sessions', {
        count: sessions?.length || 0,
        sessionIds: sessions?.map(s => s.id) || [],
        dateStr
      });

      // Filter sessions by current school if applicable
      let filteredSessions = await filterSessionsBySchool(supabase, sessions || [], currentSchool);

      log.info('[CalendarDayView] After school filtering', {
        count: filteredSessions.length,
        sessionIds: filteredSessions.map(s => s.id)
      });

      setSessionsState(filteredSessions);
    };

    loadSessions();
  }, [currentDate, currentSchool, supabase, sessionGenerator]);

  // Fetch student data for assigned sessions (students that aren't in the prop)
  React.useEffect(() => {
    const fetchMissingStudents = async () => {
      if (sessionsState.length === 0) return;

      // Find student IDs that are in sessions but not in the students Map
      // Filter out nulls and deduplicate
      const missingStudentIds = Array.from(
        new Set(
          sessionsState
            .map(s => s.student_id)
            .filter((id): id is string => !!id && !students.has(id))
        )
      );

      if (missingStudentIds.length === 0) return;

      // Fetch the missing students
      const { data: missingStudents, error: fetchError } = await supabase
        .from('students')
        .select('id, initials, grade_level')
        .in('id', missingStudentIds);

      if (fetchError) {
        log.error('[Calendar Day View] Error fetching student data for assigned sessions', fetchError);
        return;
      }

      if (missingStudents && missingStudents.length > 0) {
        setAdditionalStudents(prev => {
          const newAdditionalStudents = new Map(prev);
          missingStudents.forEach(student => {
            newAdditionalStudents.set(student.id, {
              initials: student.initials,
              grade_level: student.grade_level || undefined
            });
          });
          return newAdditionalStudents;
        });
      }
    };

    fetchMissingStudents();
  }, [sessionsState, students, supabase]); // Remove additionalStudents from deps to avoid infinite loop

  // Check for conflicts after sessions are loaded
  const checkSessionConflicts = useCallback(async () => {
    const conflicts: Record<string, boolean> = {};

    for (const session of sessionsState) {
      // Skip validation for unscheduled sessions (with null times)
      if (!session.day_of_week || !session.start_time || !session.end_time) {
        conflicts[session.id] = false;
        continue;
      }

      const validation = await sessionUpdateService.validateSessionMove({
        session,
        targetDay: session.day_of_week,
        targetStartTime: session.start_time,
        targetEndTime: session.end_time,
        studentMinutes: timeToMinutes(session.end_time) - timeToMinutes(session.start_time)
      });

      conflicts[session.id] = !validation.valid;
    }

    setSessionConflicts(conflicts);
  }, [sessionsState]);
  
  // Check conflicts when sessions change
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSessionConflicts();
    }, 500); // Small delay to batch updates
    
    return () => clearTimeout(timer);
  }, [sessionsState, checkSessionConflicts]);

  // Merge students from prop with additionally fetched students
  const allStudents = useMemo(() => {
    const merged = new Map(students);
    additionalStudents.forEach((student, id) => {
      if (!merged.has(id)) {
        merged.set(id, student);
      }
    });
    return merged;
  }, [students, additionalStudents]);

  // Memoize filtered sessions for performance
  const filteredSessions = useMemo(
    () => sessionsState.filter((s) => {
      // Always include sessions assigned to this user, even if student isn't in their list
      const isAssignedToMe = (
        s.assigned_to_specialist_id === providerId ||
        s.assigned_to_sea_id === providerId
      );

      // Include if student is in the merged list OR if session is assigned to this user
      return (s.student_id && allStudents.has(s.student_id)) || isAssignedToMe;
    }),
    [sessionsState, allStudents, providerId]
  );

  // Check if current date is a holiday
  const isHoliday = () => {
    const dateStr = toDateKeyLocal(currentDate);
    return holidays.some(h => h.date === dateStr);
  };

  // Get holiday name for current date
  const getHolidayName = () => {
    const dateStr = toDateKeyLocal(currentDate);
    const holiday = holidays.find(h => h.date === dateStr);
    return holiday?.name || 'Holiday';
  };

  // Generate time slots for the day
  const generateTimeSlots = () => {
    const slots: string[] = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(time);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Format time for display
  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Handler for checkbox selection
  const handleSessionSelect = (sessionId: string, checked: boolean) => {
    setSelectedSessionIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(sessionId);
      } else {
        newSet.delete(sessionId);
      }
      return newSet;
    });
  };

  // Handler for creating a group - show warning first
  const handleCreateGroup = () => {
    if (selectedSessionIds.size < 2) {
      showToast('Please select at least 2 sessions to create a group', 'error');
      return;
    }

    // Validate all selected sessions can be grouped by current user
    const selectedSessions = Array.from(selectedSessionIds)
      .map(id => sessionsState.find(s => s.id === id))
      .filter(Boolean) as ScheduleSession[];

    const invalidSessions = selectedSessions.filter(s => !canUserGroupSession(s));
    if (invalidSessions.length > 0) {
      showToast(
        'You can only group sessions that you are assigned to deliver',
        'error'
      );
      return;
    }

    setWarningModalOpen(true);
  };

  // Handler to proceed after warning is acknowledged
  const handleProceedWithGrouping = () => {
    setWarningModalOpen(false);
    setGroupNameInput('');
    setGroupingModalOpen(true);
  };

  // Handler for saving group - groups TEMPLATE sessions for recurring behavior
  const handleSaveGroup = async () => {
    if (!groupNameInput.trim()) {
      showToast('Please enter a group name', 'error');
      return;
    }

    setSavingGroup(true);
    try {
      if (!providerId) {
        throw new Error('User not authenticated');
      }

      // Persist any temporary sessions before grouping
      const selectedSessions = Array.from(selectedSessionIds)
        .map(id => sessionsState.find(s => s.id === id))
        .filter((s): s is ScheduleSession => s !== undefined);

      const tempSessions = selectedSessions.filter(s => s.id.startsWith('temp-'));
      if (tempSessions.length > 0) {
        log.info('Persisting temporary sessions before grouping', {
          tempSessionCount: tempSessions.length
        });
        const persistedSessions = await ensureSessionsPersisted(tempSessions);

        // Update sessionsState with persisted sessions (new IDs)
        const idMap = new Map(persistedSessions.map(ps => {
          const temp = tempSessions.find(ts =>
            ts.student_id === ps.student_id &&
            ts.day_of_week === ps.day_of_week &&
            ts.start_time === ps.start_time &&
            ts.session_date === ps.session_date
          );
          return temp ? [temp.id, ps.id] : null;
        }).filter((entry): entry is [string, string] => entry !== null));

        // Update sessionsState with persisted sessions
        setSessionsState(prev => prev.map(s => {
          const persistedSession = persistedSessions.find(ps =>
            s.student_id === ps.student_id &&
            s.day_of_week === ps.day_of_week &&
            s.start_time === ps.start_time &&
            s.session_date === ps.session_date
          );
          return persistedSession || s;
        }));

        // Update selectedSessionIds with new persisted IDs
        setSelectedSessionIds(prev => {
          const newSet = new Set<string>();
          prev.forEach(id => {
            newSet.add(idMap.get(id) || id);
          });
          return newSet;
        });
      }

      // Find template sessions that correspond to the selected sessions
      // Templates have: same student_id, same day_of_week, same start_time, and session_date IS NULL
      const templateIds: string[] = [];

      log.info('Selected sessions for grouping', { selectedSessionIds: Array.from(selectedSessionIds) });

      for (const sessionId of Array.from(selectedSessionIds)) {
        const session = sessionsState.find(s => s.id === sessionId);
        if (!session) {
          log.warn('Session not found in state', { sessionId });
          continue;
        }

        // Skip sessions without required fields
        if (!session.student_id || session.day_of_week === null || !session.start_time) {
          log.warn('Session missing required fields for template lookup', { sessionId });
          continue;
        }

        log.info('Finding template for session', {
          sessionId,
          student_id: session.student_id,
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          session_date: session.session_date,
          delivered_by: session.delivered_by,
          provider_id: session.provider_id,
          assigned_to_specialist_id: session.assigned_to_specialist_id,
          assigned_to_sea_id: session.assigned_to_sea_id,
          group_id: session.group_id
        });

        // Query for the template session
        // Find template that matches session characteristics (student, day, time)
        // Note: The template may have different delivered_by than the instance
        // (e.g., instance assigned to specialist still has a provider template)
        // so we don't filter by delivered_by or assignment here
        log.info('Template query criteria', {
          student_id: session.student_id,
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          session_date: 'IS NULL'
        });

        const { data: templates, error: templateError } = await supabase
          .from('schedule_sessions')
          .select('id, student_id, day_of_week, start_time, group_id, group_name, provider_id, delivered_by, assigned_to_specialist_id, assigned_to_sea_id, session_date')
          .eq('student_id', session.student_id)
          .eq('day_of_week', session.day_of_week)
          .eq('start_time', session.start_time)
          .is('session_date', null)
          .limit(1);

        if (templateError) {
          log.error('Error finding template', templateError);
          continue;
        }

        log.info('Template query result', {
          found: templates?.length || 0,
          templates
        });

        if (templates && templates.length > 0) {
          const template = templates[0];

          // Authorization check: verify user has permission to access this template
          const isAuthorized =
            template.provider_id === providerId ||
            template.assigned_to_specialist_id === providerId ||
            template.assigned_to_sea_id === providerId;

          if (!isAuthorized) {
            log.warn('Template found but user not authorized to access it', {
              template_provider_id: template.provider_id,
              current_user_id: providerId
            });
            continue;
          }

          log.info('Found authorized template', { template });
          templateIds.push(template.id);
        } else {
          log.warn('No template found for session - session will be excluded from group', {
            sessionId,
            possibleReasons: [
              'Session is an instance-only (not recurring)',
              'Template has different student_id, day_of_week, or start_time',
              'Database query issue'
            ]
          });
        }
      }

      log.info('Template IDs to group', { templateIds });

      if (templateIds.length < 2) {
        throw new Error(`Could not find template sessions to group. Found ${templateIds.length} template(s), need at least 2. Please ensure sessions are from your recurring schedule.`);
      }

      // Group the template sessions
      const response = await fetch('/api/sessions/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionIds: templateIds,
          groupName: groupNameInput.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        log.error('Grouping API error', {
          error: data.error,
          data: JSON.stringify(data),
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(data.error || 'Failed to create group');
      }

      log.info('Grouping API response', { data });

      // Reload sessions using SessionGenerator to maintain role-based filtering
      log.info('Reloading sessions for date', { currentDate });
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const updatedSessions = await sessionGenerator.getSessionsForDateRange(
        providerId,
        dayStart,
        dayEnd,
        userProfile?.role
      );

      log.info('Reloaded sessions', {
        sessionCount: updatedSessions.length,
        sessionsWithGroups: updatedSessions.filter(s => s.group_id).length
      });

      // Filter by current school
      const filteredSessions = await filterSessionsBySchool(supabase, updatedSessions, currentSchool);

      setSessionsState(filteredSessions);

      showToast(`Group "${groupNameInput.trim()}" created successfully`, 'success');
      setGroupingModalOpen(false);
      setSelectedSessionIds(new Set());
      setGroupNameInput('');
    } catch (error) {
      log.error('Error creating group', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
      });
      showToast(error instanceof Error ? error.message : 'Failed to create group', 'error');
    } finally {
      setSavingGroup(false);
    }
  };

  // Handler for ungrouping sessions - ungroups the TEMPLATE session for recurring behavior
  const handleUngroupSession = async (sessionId: string) => {
    try {
      if (!providerId) {
        throw new Error('User not authenticated');
      }

      const session = sessionsState.find(s => s.id === sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Check if user has permission to ungroup this session
      if (!canUserGroupSession(session)) {
        throw new Error('You can only ungroup sessions that you are assigned to deliver');
      }

      // Ensure session has required fields
      if (!session.student_id || session.day_of_week === null || !session.start_time) {
        throw new Error('Session is missing required fields');
      }

      // Find the template session (preferred)
      const { data: templates } = await supabase
        .from('schedule_sessions')
        .select('id, session_date')
        .eq('provider_id', providerId)
        .eq('student_id', session.student_id)
        .eq('day_of_week', session.day_of_week)
        .eq('start_time', session.start_time)
        .is('session_date', null)
        .limit(1);

      let targetSessionId: string;

      if (templates && templates.length > 0) {
        // Found template - ungroup it (this is the normal case)
        targetSessionId = templates[0].id;
      } else {
        // No template found - check if this is an old instance-based group
        // In this case, ungroup the instance itself and log a warning
        log.warn('No template found for ungrouping - ungrouping instance instead', { sessionId });
        targetSessionId = sessionId;
      }

      // Ungroup the session (template or instance)
      const response = await fetch('/api/sessions/ungroup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionIds: [targetSessionId]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to ungroup session');
      }

      // Reload sessions using SessionGenerator to maintain role-based filtering
      log.info('Reloading sessions for date after ungrouping', { currentDate });
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const updatedSessions = await sessionGenerator.getSessionsForDateRange(
        providerId,
        dayStart,
        dayEnd,
        userProfile?.role
      );

      log.info('Reloaded sessions', {
        sessionCount: updatedSessions.length
      });

      // Filter by current school
      const filteredSessions = await filterSessionsBySchool(supabase, updatedSessions, currentSchool);

      setSessionsState(filteredSessions);

      showToast('Session removed from group', 'success');
    } catch (error) {
      log.error('Error ungrouping session', error);
      showToast(error instanceof Error ? error.message : 'Failed to ungroup session', 'error');
    }
  };

  // Group sessions by time slot
  const getSessionsForTimeSlot = (timeSlot: string) => {
    const slotTime = `${timeSlot}:00`;
    return sessionsState.filter((session) => {
      const sessionStartTime = session.start_time;
      return sessionStartTime === slotTime;
    });
  };

  const isCurrentTimeSlot = (timeSlot: string) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
    const slotTimeInMinutes = slotHour * 60 + slotMinute;
    const slotEndTimeInMinutes = slotTimeInMinutes + 30;
    
    return currentTimeInMinutes >= slotTimeInMinutes && currentTimeInMinutes < slotEndTimeInMinutes;
  };

  const isPastTimeSlot = (timeSlot: string) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
    const slotTimeInMinutes = slotHour * 60 + slotMinute;
    
    return currentTimeInMinutes > slotTimeInMinutes + 30;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          {formatDate(currentDate)}
        </h2>
        {isHoliday() && (
          <p className="text-sm text-red-600 mt-1">
            🎉 {getHolidayName()} - No sessions scheduled
          </p>
        )}
      </div>

      {/* Calendar Events */}
      {!isHoliday() && calendarEvents.length > 0 && (() => {
        const dateStr = toDateKeyLocal(currentDate);
        const todayEvents = calendarEvents.filter(e => e.date === dateStr);
        
        if (todayEvents.length === 0) return null;
        
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-md font-semibold text-gray-900 mb-3">Events</h3>
            <div className="space-y-2">
              {todayEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="p-3 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  style={{
                    backgroundColor: 
                      event.event_type === 'meeting' ? '#DBEAFE' : 
                      event.event_type === 'assessment' ? '#FEF3C7' :
                      event.event_type === 'activity' ? '#D1FAE5' :
                      '#F3F4F6',
                    color:
                      event.event_type === 'meeting' ? '#1E40AF' : 
                      event.event_type === 'assessment' ? '#92400E' :
                      event.event_type === 'activity' ? '#065F46' :
                      '#374151'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {event.title}
                      </div>
                      {!event.all_day && event.start_time && (
                        <div className="text-sm opacity-75 mt-1">
                          {formatTime(event.start_time)}
                          {event.end_time && ` - ${formatTime(event.end_time)}`}
                        </div>
                      )}
                      {event.all_day && (
                        <div className="text-sm opacity-75 mt-1">All Day</div>
                      )}
                      {event.location && (
                        <div className="text-sm opacity-75 mt-1">📍 {event.location}</div>
                      )}
                    </div>
                    <div className="text-xs uppercase font-medium opacity-75">
                      {event.event_type}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Sessions list */}
      {!isHoliday() && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="divide-y divide-gray-100">
              {filteredSessions.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No sessions scheduled for today
                </div>
              ) : (
                filteredSessions
                  .filter(s => s.start_time && s.end_time) // Filter out unscheduled sessions
                  .sort((a, b) => a.start_time!.localeCompare(b.start_time!))
                  .map((session) => {
                    const student = session.student_id ? allStudents.get(session.student_id) : undefined;
                    const isGrouped = !!session.group_id;
                    const groupColor = isGrouped ? getGroupColor(session.group_id as string) : null;

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "p-4 hover:bg-gray-50 transition-colors",
                          isGrouped && groupColor?.border,
                          isGrouped && groupColor?.bg
                        )}
                      >
                        {/* Group badge (if session is grouped) */}
                        {isGrouped && session.group_name && (
                          <div className="flex items-center gap-2 mb-2">
                            <button
                              type="button"
                              className={cn(
                                "text-xs px-2 py-1 rounded font-medium cursor-pointer hover:opacity-80 transition-opacity",
                                groupColor?.badge
                              )}
                              title="Click to create/view lesson plan for this group"
                              onClick={() => {
                                // TODO: Implement lesson plan view/create action
                              }}
                            >
                              📚 {session.group_name}
                            </button>
                            {/* Only show ungroup button if user has permission */}
                            {canUserGroupSession(session) && (
                              <button
                                onClick={() => handleUngroupSession(session.id)}
                                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                                title="Remove from group"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Selection checkbox - only show if user can group this session */}
                            {canUserGroupSession(session) && (
                              <input
                                type="checkbox"
                                checked={selectedSessionIds.has(session.id)}
                                onChange={(e) => handleSessionSelect(session.id, e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                title="Select for grouping"
                                aria-label="Select session for grouping"
                              />
                            )}

                            <div className="text-sm font-medium text-gray-900">
                              {formatTime(session.start_time!)} - {formatTime(session.end_time!)}
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              {student?.initials || '?'}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {(() => {
                              // Check if this is a cross-provider assignment:
                              // 1. Session belongs to another provider
                              // 2. Current user's role matches the delivered_by (they're assigned to deliver it)
                              const isAssignedToMe = session.provider_id !== providerId && canUserGroupSession(session);

                              if (isAssignedToMe) {
                                // Current user assigned to deliver another provider's session
                                return (
                                  <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
                                    Assigned
                                  </span>
                                );
                              }

                              // Normal delivered_by badge
                              return (
                                <span className={`text-xs px-2 py-1 rounded ${
                                  session.delivered_by === 'sea'
                                    ? 'bg-green-100 text-green-700'
                                    : session.delivered_by === 'specialist'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {session.delivered_by === 'sea' ? 'SEA' : session.delivered_by === 'specialist' ? 'Specialist' : 'Me'}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Create Group button (appears when 2+ sessions are selected) */}
          {selectedSessionIds.size >= 2 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <button
                onClick={handleCreateGroup}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <span>📁</span>
                <span>Create Group ({selectedSessionIds.size} sessions selected)</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Warning Modal for Recurring Groups */}
      {warningModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <span className="text-yellow-600 text-xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Recurring Group Warning</h3>
                <p className="text-sm text-gray-600 mt-2">
                  This group will apply to <strong>all future occurrences</strong> of these sessions, not just today.
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  For example, if you're grouping Thursday sessions, they will appear grouped <strong>every Thursday</strong> going forward.
                </p>
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
              <p className="text-sm text-gray-700">
                <strong>Note:</strong> You can ungroup sessions at any time, which will also remove the group from all future weeks.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setWarningModalOpen(false);
                  setSelectedSessionIds(new Set());
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedWithGrouping}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                I Understand, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Naming Modal */}
      {groupingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Create Session Group</h3>
            <p className="text-sm text-gray-600 mb-4">
              You're grouping {selectedSessionIds.size} sessions together. Give this group a name:
            </p>
            <input
              type="text"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !savingGroup) {
                  handleSaveGroup();
                }
              }}
              className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Morning Reading Group"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setGroupingModalOpen(false);
                  setGroupNameInput('');
                }}
                disabled={savingGroup}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGroup}
                disabled={savingGroup || !groupNameInput.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}