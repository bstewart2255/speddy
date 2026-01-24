'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import {
  validateDocumentFile,
  getDocumentIcon,
  formatFileSize,
  getFileTypeName
} from '@/lib/document-utils';
import { formatTime } from '@/lib/utils/time-options';
import { ensureSessionsPersisted, ensureSessionPersisted } from '@/lib/services/session-persistence';
import { LessonControl } from '@/app/components/lesson-control';
import type { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type Lesson = Database['public']['Tables']['lessons']['Row'];

interface CurriculumTracking {
  id: string;
  group_id: string | null;
  session_id: string | null;
  curriculum_type: string;
  curriculum_level: string;
  current_lesson: number;
  created_at: string;
  updated_at: string;
}

interface Document {
  id: string;
  documentable_type: 'group' | 'session';
  documentable_id: string;
  title: string;
  document_type: 'pdf' | 'link' | 'note' | 'file';
  content?: string | null;
  url?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  original_filename?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Simplified curriculum data passed from parent (matches SessionWithCurriculum)
interface CurriculumData {
  curriculum_type: string;
  curriculum_level: string;
  current_lesson: number;
}

// Base props shared between both modes
interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional curriculum data from parent to avoid redundant API call */
  initialCurriculum?: CurriculumData | null;
  /** Callback when data is saved (to refresh parent data) */
  onUpdate?: () => void;
}

// Session mode props - for individual sessions
interface SessionModeProps extends BaseModalProps {
  mode: 'session';
  session: ScheduleSession;
  student: { initials: string; grade_level?: string } | undefined;
}

// Group mode props - for group sessions
interface GroupModeProps extends BaseModalProps {
  mode: 'group';
  groupId: string;
  groupName: string;
  sessions: ScheduleSession[];
  students: Map<string, { initials: string; grade_level?: string }>;
}

// Unified modal props using discriminated union
type SessionDetailsModalProps = SessionModeProps | GroupModeProps;

// Curriculum options
const CURRICULUM_OPTIONS = [
  { value: 'SPIRE', label: 'S.P.I.R.E.' },
  { value: 'Reveal Math', label: 'Reveal Math' }
];

const SPIRE_LEVELS = ['Foundations', '1', '2', '3', '4', '5', '6', '7', '8'];
const REVEAL_MATH_GRADES = ['K', '1', '2', '3', '4', '5'];

export function SessionDetailsModal(props: SessionDetailsModalProps) {
  const { isOpen, onClose, initialCurriculum, onUpdate } = props;

  // Extract mode-specific values for dependency arrays (avoids complex expressions)
  const groupId = props.mode === 'group' ? props.groupId : undefined;
  const groupSessions = props.mode === 'group' ? props.sessions : undefined;
  const sessionDate = props.mode === 'session' ? props.session.session_date : undefined;
  const sessionGroupId = props.mode === 'session' ? props.session.group_id : undefined;
  const sessionStartTime = props.mode === 'session' ? props.session.start_time : undefined;
  const sessionEndTime = props.mode === 'session' ? props.session.end_time : undefined;

  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ref to track if we've done the initial lesson fetch (prevents loading flash on refetch)
  const hasFetchedLessonRef = useRef(false);

  // Track persisted session ID for session mode (may differ from prop if we auto-save a temp session)
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    props.mode === 'session' ? props.session.id : ''
  );

  // Extract session ID for dependency tracking (undefined in group mode)
  const sessionId = props.mode === 'session' ? props.session.id : undefined;

  // Sync currentSessionId when session prop changes (session mode only)
  useEffect(() => {
    if (props.mode === 'session' && sessionId) {
      setCurrentSessionId(sessionId);
    }
  }, [props.mode, sessionId]);

  /**
   * Ensures sessions are persisted before operations.
   * In group mode: persists all temp sessions and returns first persisted ID.
   * In session mode: persists single temp session and returns its ID.
   */
  const ensureSessionsPersistence = async (): Promise<string | undefined> => {
    if (props.mode === 'group') {
      // Group mode: handle multiple sessions
      const sessions = props.sessions;

      // Check for already persisted sessions first
      const alreadyPersisted = sessions.find(s => !s.id.startsWith('temp-'));
      if (alreadyPersisted) {
        return alreadyPersisted.id;
      }

      // Filter temp sessions
      const tempSessions = sessions.filter(s => s.id.startsWith('temp-'));

      if (tempSessions.length === 0) {
        return undefined; // No sessions at all
      }

      // Persist all temp sessions and get the results
      const persistedSessions = await ensureSessionsPersisted(tempSessions);

      // Return the first persisted session ID
      return persistedSessions[0]?.id;
    } else {
      // Session mode: handle single session
      if (!currentSessionId.startsWith('temp-')) {
        return currentSessionId;
      }

      // Persist the temp session and update our tracked ID
      const persistedSession = await ensureSessionPersisted(props.session);
      setCurrentSessionId(persistedSession.id);
      return persistedSession.id;
    }
  };

  // Lesson state
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(true);
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to render notes with clickable links
  const renderNotesWithLinks = (text: string) => {
    if (!text) return null;
    // Match URLs (http, https, or www, or domain.tld patterns)
    // Global regex for splitting, non-global for testing individual parts
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;
    const urlTestRegex = /^(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)$/;
    const parts = text.split(urlRegex);

    return parts.map((part, i) => {
      // First check if this part matches the URL pattern
      if (!urlTestRegex.test(part)) {
        // Not a URL pattern, render as plain text
        return <span key={i}>{part}</span>;
      }

      // Part matches URL pattern - validate with URL API for security
      try {
        // Prepend https:// if no protocol
        const urlString = part.startsWith('http://') || part.startsWith('https://')
          ? part
          : `https://${part}`;
        const url = new URL(urlString);
        // Strictly validate protocol to prevent XSS via javascript: or other dangerous protocols
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return <span key={i}>{part}</span>;
        }
        return (
          <a
            key={i}
            href={url.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      } catch {
        // Invalid URL, render as plain text
        return <span key={i}>{part}</span>;
      }
    });
  };

  // Curriculum tracking state - initialize from prop if provided
  const [curriculumTracking, setCurriculumTracking] = useState<CurriculumTracking | null>(null);
  const [curriculumType, setCurriculumType] = useState(initialCurriculum?.curriculum_type || '');
  const [curriculumLevel, setCurriculumLevel] = useState(initialCurriculum?.curriculum_level || '');
  const [currentLesson, setCurrentLesson] = useState<number>(initialCurriculum?.current_lesson || 1);
  const [curriculumInitialized, setCurriculumInitialized] = useState(!!initialCurriculum);

  // Curriculum progression prompt state
  const [previousCurriculum, setPreviousCurriculum] = useState<{
    curriculum_type: string;
    curriculum_level: string;
    current_lesson: number;
    prompt_answered: boolean;
  } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptAnswering, setPromptAnswering] = useState(false);

  // Sync curriculum state with prop when it changes (e.g., after parent refetch)
  useEffect(() => {
    if (initialCurriculum) {
      setCurriculumType(initialCurriculum.curriculum_type);
      setCurriculumLevel(initialCurriculum.curriculum_level);
      setCurrentLesson(initialCurriculum.current_lesson);
      setCurriculumInitialized(true);
    }
  }, [initialCurriculum]);

  // Documents state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // Attendance state
  interface AttendanceRecord {
    student_id: string;
    present: boolean;
    absence_reason?: string | null;
  }
  const [attendance, setAttendance] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceExpanded, setAttendanceExpanded] = useState(false);
  const [attendanceChanged, setAttendanceChanged] = useState(false);

  // Add escape key handler and body scroll prevention
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const fetchLesson = useCallback(async (signal?: AbortSignal) => {
    // Only show loading on initial fetch, not refreshes
    if (!hasFetchedLessonRef.current) setLoadingLesson(true);

    try {
      if (props.mode === 'session') {
        // Session mode: fetch existing lesson by provider_id, lesson_date, and time_slot
        const timeSlot = sessionStartTime && sessionEndTime
          ? `${sessionStartTime}-${sessionEndTime}`
          : null;

        if (!sessionDate || !timeSlot) {
          // Clear stale state when session date is missing
          setLesson(null);
          setNotes('');
          setLoadingLesson(false);
          return;
        }

        // Use the save-lesson GET endpoint with query params
        const params = new URLSearchParams({
          lesson_date: sessionDate,
          time_slot: timeSlot
        });

        const response = await fetch(`/api/save-lesson/by-session?${params}`, { signal });

        if (response.ok) {
          const data = await response.json();
          if (data.lesson) {
            setLesson(data.lesson);
            setNotes(data.lesson.notes || '');
          } else {
            // Clear stale state when no lesson exists
            setLesson(null);
            setNotes('');
          }
        } else {
          // Clear stale state on error/404
          setLesson(null);
          setNotes('');
        }
      } else {
        // Group mode: fetch lesson for the group
        // Get lesson_date from the first session in the group
        const firstSession = groupSessions?.find(s => s.session_date);
        const lessonDate = firstSession?.session_date;

        // Build URL with lesson_date query param for date-specific fetch
        let url = `/api/groups/${groupId}/lesson`;
        if (lessonDate) {
          url += `?lesson_date=${encodeURIComponent(lessonDate)}`;
        }

        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('Failed to fetch lesson');

        const data = await response.json();
        if (data.lesson) {
          setLesson(data.lesson);
          setNotes(data.lesson.notes || '');
        } else {
          // Clear stale state when no lesson exists
          setLesson(null);
          setNotes('');
        }
      }
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching lesson:', error);
      // Only show toast for group mode failures
      if (props.mode === 'group') {
        showToast('Failed to load lesson', 'error');
      }
    } finally {
      hasFetchedLessonRef.current = true;
      setLoadingLesson(false);
    }
  }, [props.mode, groupId, groupSessions, showToast, sessionStartTime, sessionEndTime, sessionDate]);

  const fetchDocuments = useCallback(async (signal?: AbortSignal) => {
    // Session mode: skip for temp sessions
    if (props.mode === 'session' && currentSessionId.startsWith('temp-')) {
      setDocuments([]);
      setLoadingDocuments(false);
      return;
    }

    // Only show loading on initial fetch, not refreshes
    if (documents.length === 0) setLoadingDocuments(true);
    try {
      // Get session_date for filtering documents to this specific instance
      let instanceDate: string | null = null;
      if (props.mode === 'group') {
        const firstSession = groupSessions?.find(s => s.session_date);
        instanceDate = firstSession?.session_date || null;
      } else {
        instanceDate = sessionDate || null;
      }

      // Build endpoint with session_date filter if available
      let endpoint = props.mode === 'group'
        ? `/api/groups/${groupId}/documents`
        : `/api/sessions/${currentSessionId}/documents`;

      if (instanceDate) {
        endpoint += `?session_date=${encodeURIComponent(instanceDate)}`;
      }

      const response = await fetch(endpoint, { signal });
      if (!response.ok) throw new Error('Failed to fetch documents');

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching documents:', error);
      showToast('Failed to load documents', 'error');
    } finally {
      setLoadingDocuments(false);
    }
  }, [props.mode, groupId, groupSessions, sessionDate, currentSessionId, showToast, documents.length]);

  // Get first persisted session ID for curriculum tracking
  const getPersistedSessionId = useCallback(() => {
    if (props.mode === 'group') {
      const persistedSession = groupSessions?.find(s => !s.id.startsWith('temp-'));
      return persistedSession?.id;
    } else {
      return currentSessionId.startsWith('temp-') ? undefined : currentSessionId;
    }
  }, [props.mode, groupSessions, currentSessionId]);

  const fetchCurriculumTracking = useCallback(async (signal?: AbortSignal) => {
    // Skip if curriculum was already initialized from props
    if (curriculumInitialized) {
      return;
    }

    try {
      // Find first persisted session to use for curriculum lookup
      const sessionId = getPersistedSessionId();
      if (!sessionId) {
        // No persisted sessions yet, no curriculum to fetch
        return;
      }

      const response = await fetch(`/api/curriculum-tracking?sessionId=${sessionId}`, { signal });
      if (!response.ok) {
        if (response.status === 404) {
          // No curriculum tracking exists yet, which is fine
          return;
        }
        throw new Error('Failed to fetch curriculum tracking');
      }

      const { data } = await response.json();
      if (data) {
        setCurriculumTracking(data);
        setCurriculumType(data.curriculum_type);
        setCurriculumLevel(data.curriculum_level);
        setCurrentLesson(data.current_lesson);
        setCurriculumInitialized(true);
      }
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Silently fail for curriculum tracking - it's optional
      console.error('Error fetching curriculum tracking:', error);
    }
  }, [getPersistedSessionId, curriculumInitialized]);

  // Fetch previous curriculum for progression prompt
  const fetchPreviousCurriculum = useCallback(async (signal?: AbortSignal) => {
    // Skip if curriculum was already initialized (avoid race with fetchCurriculumTracking)
    if (curriculumInitialized) {
      return;
    }

    try {
      // Get session date and group info using extracted variables
      let sessionDateParam: string | null = null;
      let groupIdParam: string | null = null;
      let sessionIdParam: string | null = null;

      if (props.mode === 'group') {
        // For groups, use the first session's date and group ID
        const firstSession = groupSessions?.find(s => s.session_date);
        sessionDateParam = firstSession?.session_date || null;
        groupIdParam = groupId || null;
        // sessionId is optional for group queries
        sessionIdParam = getPersistedSessionId() || null;
      } else {
        sessionDateParam = sessionDate || null;
        groupIdParam = sessionGroupId || null;
        // For individual sessions, we need sessionId for template matching
        sessionIdParam = getPersistedSessionId() || null;
        if (!sessionIdParam && !groupIdParam) {
          // Individual session without group and not persisted - can't look up
          return;
        }
      }

      if (!sessionDateParam) {
        // No session date, can't look up previous
        return;
      }

      // Build params - sessionId is optional for group queries
      const params = new URLSearchParams({ sessionDate: sessionDateParam });
      if (sessionIdParam) params.set('sessionId', sessionIdParam);
      if (groupIdParam) params.set('groupId', groupIdParam);

      const response = await fetch(`/api/curriculum-tracking/previous?${params}`, { signal });
      if (!response.ok) {
        throw new Error('Failed to fetch previous curriculum');
      }

      const { data, isFirstInstance, isCurrentInstance } = await response.json();

      // If current instance already has curriculum tracking, use that
      if (isCurrentInstance && data) {
        setCurriculumTracking(data);
        setCurriculumType(data.curriculum_type);
        setCurriculumLevel(data.curriculum_level);
        setCurrentLesson(data.current_lesson);
        setCurriculumInitialized(true);
        // Always hide prompt if current instance has curriculum (user already dealt with it)
        setShowPrompt(false);
        setPreviousCurriculum(null);
        return;
      }

      // If we have previous curriculum and it's not the first instance, show prompt
      // (Current instance has no curriculum tracking - we already returned above if it did)
      if (data && !isFirstInstance) {
        setPreviousCurriculum({
          curriculum_type: data.curriculum_type,
          curriculum_level: data.curriculum_level,
          current_lesson: data.current_lesson,
          prompt_answered: false // Current instance hasn't answered yet
        });
        setShowPrompt(true);
        // Pre-fill the curriculum fields
        setCurriculumType(data.curriculum_type);
        setCurriculumLevel(data.curriculum_level);
        setCurrentLesson(data.current_lesson);
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching previous curriculum:', error);
    }
  }, [getPersistedSessionId, props.mode, groupId, groupSessions, sessionDate, sessionGroupId, curriculumInitialized]);

  // Fetch attendance for the session(s)
  const fetchAttendance = useCallback(async (signal?: AbortSignal) => {
    setLoadingAttendance(true);
    try {
      const dateParam = props.mode === 'group'
        ? groupSessions?.find(s => s.session_date)?.session_date
        : sessionDate;

      if (!dateParam) {
        setLoadingAttendance(false);
        return;
      }

      const attendanceMap = new Map<string, AttendanceRecord>();

      if (props.mode === 'group') {
        // For group mode, fetch from all persisted sessions using each session's own date
        const persistedSessions = groupSessions?.filter(s => !s.id.startsWith('temp-')) || [];

        const fetchPromises = persistedSessions.map(async (session) => {
          try {
            // Use this session's own session_date (fallback to shared dateParam if null)
            const sessionDateForFetch = session.session_date || dateParam;
            if (!sessionDateForFetch) return;

            const response = await fetch(
              `/api/sessions/${session.id}/attendance?session_date=${encodeURIComponent(sessionDateForFetch)}`,
              { signal }
            );
            if (response.ok) {
              const data = await response.json();
              for (const record of data.attendance || []) {
                attendanceMap.set(record.student_id, {
                  student_id: record.student_id,
                  present: record.present,
                  absence_reason: record.absence_reason
                });
              }
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') throw err;
          }
        });

        await Promise.all(fetchPromises);
      } else {
        // For individual session mode
        const sessionId = getPersistedSessionId();
        if (!sessionId) {
          setLoadingAttendance(false);
          return;
        }

        const response = await fetch(
          `/api/sessions/${sessionId}/attendance?session_date=${encodeURIComponent(dateParam)}`,
          { signal }
        );

        if (response.ok) {
          const data = await response.json();
          for (const record of data.attendance || []) {
            attendanceMap.set(record.student_id, {
              student_id: record.student_id,
              present: record.present,
              absence_reason: record.absence_reason
            });
          }
        }
      }

      setAttendance(attendanceMap);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Error fetching attendance:', error);
    } finally {
      setLoadingAttendance(false);
    }
  }, [getPersistedSessionId, props.mode, groupSessions, sessionDate]);

  // Save attendance for all students
  // Optional parameter to pass attendance directly (for All Present quick action)
  const saveAttendance = async (directAttendance?: Map<string, AttendanceRecord>) => {
    setSavingAttendance(true);
    try {
      const dateParam = props.mode === 'group'
        ? groupSessions?.find(s => s.session_date)?.session_date
        : sessionDate;

      if (!dateParam) {
        showToast('Unable to save attendance: no session date', 'error');
        return;
      }

      const attendanceToSave = directAttendance || attendance;

      if (props.mode === 'group') {
        // For group mode, save attendance per student's session using each session's own date
        const persistedSessions = await ensureSessionsPersisted(props.sessions.filter(s => s.id.startsWith('temp-')));
        const allSessions = [...props.sessions.filter(s => !s.id.startsWith('temp-')), ...persistedSessions];

        // Save attendance for each student's actual session with their specific session_date
        const savePromises = allSessions.map(async (session) => {
          const studentId = session.student_id;
          if (!studentId) return;

          // Use this session's own session_date (fallback to shared dateParam if null)
          const sessionDateForRecord = session.session_date || dateParam;
          if (!sessionDateForRecord) return;

          const record = attendanceToSave.get(studentId);
          if (!record) return;

          const response = await fetch(`/api/sessions/${session.id}/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_date: sessionDateForRecord,
              attendance: [record]
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to save attendance for student ${studentId}`);
          }
        });

        await Promise.all(savePromises);
      } else {
        // For individual session mode
        const persistedSessionId = await ensureSessionsPersistence();
        if (!persistedSessionId) {
          showToast('Unable to save attendance: no session available', 'error');
          return;
        }

        const attendanceRecords = Array.from(attendanceToSave.values());

        const response = await fetch(`/api/sessions/${persistedSessionId}/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_date: dateParam,
            attendance: attendanceRecords
          })
        });

        if (!response.ok) {
          throw new Error('Failed to save attendance');
        }
      }

      setAttendanceChanged(false);
      showToast('Attendance saved', 'success');
      onUpdate?.();
    } catch (error) {
      console.error('Error saving attendance:', error);
      showToast('Failed to save attendance', 'error');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Mark all students present and save immediately
  const markAllPresentAndSave = async () => {
    const students = props.mode === 'group'
      ? props.sessions.map(s => s.student_id).filter((id): id is string => !!id)
      : props.session.student_id ? [props.session.student_id] : [];

    const newAttendance = new Map<string, AttendanceRecord>();
    for (const studentId of students) {
      newAttendance.set(studentId, { student_id: studentId, present: true });
    }
    setAttendance(newAttendance);
    setAttendanceChanged(false);

    // Pass the new attendance directly to avoid race condition
    await saveAttendance(newAttendance);
  };

  // Mark all students present (state only, for manual save)
  const markAllPresent = () => {
    const students = props.mode === 'group'
      ? props.sessions.map(s => s.student_id).filter((id): id is string => !!id)
      : props.session.student_id ? [props.session.student_id] : [];

    const newAttendance = new Map<string, AttendanceRecord>();
    for (const studentId of students) {
      newAttendance.set(studentId, { student_id: studentId, present: true });
    }
    setAttendance(newAttendance);
    setAttendanceChanged(true);
  };

  // Toggle individual student attendance
  const toggleStudentAttendance = (studentId: string, present: boolean) => {
    setAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, {
        student_id: studentId,
        present,
        absence_reason: present ? null : (prev.get(studentId)?.absence_reason || null)
      });
      return newMap;
    });
    setAttendanceChanged(true);
  };

  // Update absence reason
  const updateAbsenceReason = (studentId: string, reason: string) => {
    setAttendance(prev => {
      const newMap = new Map(prev);
      const existing = prev.get(studentId);
      newMap.set(studentId, {
        student_id: studentId,
        present: existing?.present ?? false,
        absence_reason: reason || null
      });
      return newMap;
    });
    setAttendanceChanged(true);
  };

  // Check if all students are marked present
  const allPresent = useCallback(() => {
    const students = props.mode === 'group'
      ? props.sessions.map(s => s.student_id).filter((id): id is string => !!id)
      : props.session.student_id ? [props.session.student_id] : [];

    if (students.length === 0) return false;
    return students.every(id => attendance.get(id)?.present === true);
  }, [props, attendance]);

  // Reset fetch ref when modal opens or session identity changes
  useEffect(() => {
    if (isOpen) {
      hasFetchedLessonRef.current = false;
    }
  }, [isOpen, props.mode, groupId, sessionId, sessionDate]);

  // Fetch lesson, documents, curriculum tracking, and attendance when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    fetchLesson(controller.signal);
    fetchDocuments(controller.signal);
    fetchCurriculumTracking(controller.signal);
    fetchPreviousCurriculum(controller.signal);
    fetchAttendance(controller.signal);

    return () => controller.abort();
  }, [isOpen, fetchLesson, fetchDocuments, fetchCurriculumTracking, fetchPreviousCurriculum, fetchAttendance]);

  /**
   * Saves curriculum tracking for the session(s).
   * @param persistedSessionId - Optional session ID to use. If not provided, will try to get one.
   * @returns true if saved successfully, false if no session available
   * @throws Error if API call fails
   */
  const saveCurriculumTracking = async (persistedSessionId?: string): Promise<boolean> => {
    // Only save if all curriculum fields are provided
    if (!curriculumType || !curriculumLevel || !currentLesson) {
      return false;
    }

    try {
      // Use provided sessionId or try to get one
      let sessionId = persistedSessionId;
      if (!sessionId) {
        sessionId = await ensureSessionsPersistence();
      }

      if (!sessionId) {
        console.error('No persisted session found for curriculum tracking');
        return false;
      }

      const payload = {
        sessionId,
        curriculumType,
        curriculumLevel,
        currentLesson
      };

      const response = await fetch('/api/curriculum-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Curriculum tracking API error:', response.status, errorData);
        throw new Error(errorData.details || errorData.error || 'Failed to save curriculum tracking');
      }

      const responseData = await response.json();

      if (!responseData.data) {
        console.error('No data in curriculum API response:', responseData);
        throw new Error('No data returned from curriculum save');
      }

      setCurriculumTracking(responseData.data);
      return true;
    } catch (error) {
      console.error('Error saving curriculum tracking:', error);
      throw error;
    }
  };

  /**
   * Handles the curriculum progression prompt answer (Yes/No).
   * @param answer - 'yes' to increment lesson, 'no' to keep same lesson
   */
  const handlePromptAnswer = async (answer: 'yes' | 'no') => {
    if (!previousCurriculum) return;

    setPromptAnswering(true);
    try {
      // Ensure session is persisted first
      const sessionId = await ensureSessionsPersistence();
      if (!sessionId) {
        showToast('Unable to save - no session available', 'error');
        return;
      }

      const response = await fetch('/api/curriculum-tracking/answer-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answer,
          previousLesson: previousCurriculum.current_lesson,
          curriculumType: previousCurriculum.curriculum_type,
          curriculumLevel: previousCurriculum.curriculum_level
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save curriculum');
      }

      const { data } = await response.json();

      // Update local state
      setCurriculumTracking(data);
      setCurriculumType(data.curriculum_type);
      setCurriculumLevel(data.curriculum_level);
      setCurrentLesson(data.current_lesson);
      setCurriculumInitialized(true);
      setShowPrompt(false);
      setPreviousCurriculum(null);

      // Trigger parent refresh
      onUpdate?.();

      showToast(
        answer === 'yes'
          ? `Advanced to Lesson ${data.current_lesson}`
          : `Staying on Lesson ${data.current_lesson}`,
        'success'
      );
    } catch (error) {
      console.error('Error answering prompt:', error);
      showToast('Failed to save curriculum progress', 'error');
    } finally {
      setPromptAnswering(false);
    }
  };

  const handleSaveLesson = async () => {
    try {
      // Ensure sessions are persisted before saving and get persisted session ID
      const persistedSessionId = await ensureSessionsPersistence();

      const hasNotes = notes.trim().length > 0;
      const hasCurriculum = !!(curriculumType && curriculumLevel && currentLesson);
      // Check if we need to clear existing notes (lesson exists but notes are now empty)
      const shouldClearNotes = lesson !== null && !hasNotes;

      // Save lesson if there are notes OR if we need to clear existing notes
      if (hasNotes || shouldClearNotes) {
        let response: Response;

        if (props.mode === 'group') {
          // Group mode: POST to /api/groups/{groupId}/lesson
          // Get lesson_date from the first session in the group
          const firstSession = props.sessions.find(s => s.session_date);
          const groupLessonDate = firstSession?.session_date;

          if (!groupLessonDate) {
            showToast('Unable to save: no session date found', 'error');
            return;
          }

          const body = {
            title: null,
            content: null,
            lesson_source: 'manual',
            subject: null,
            notes: hasNotes ? notes.trim() : null,
            lesson_date: groupLessonDate  // Include lesson_date for date-specific storage
          };

          response = await fetch(`/api/groups/${props.groupId}/lesson`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        } else {
          // Session mode: POST to /api/save-lesson
          const sessionDate = props.session.session_date || new Date().toISOString().split('T')[0];
          const timeSlot = `${props.session.start_time}-${props.session.end_time}`;

          const body = {
            timeSlot,
            students: [{ id: props.session.student_id, initials: props.student?.initials || '?' }],
            content: null,
            lessonDate: sessionDate,
            notes: hasNotes ? notes.trim() : null,
            title: null,
            subject: null
          };

          response = await fetch('/api/save-lesson', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || `Failed to save lesson (${response.status})`;
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setLesson(data.lesson);
      }

      // Save curriculum tracking if provided (independent of lesson)
      if (hasCurriculum) {
        try {
          const curriculumSaved = await saveCurriculumTracking(persistedSessionId);
          if (!curriculumSaved) {
            // No session available to save curriculum to
            if (hasNotes || shouldClearNotes) {
              showToast('Lesson saved, but no session available for curriculum', 'warning');
            } else {
              showToast('No session available to save curriculum', 'error');
            }
            return;
          }
        } catch (currError) {
          // Curriculum API call failed
          if (hasNotes || shouldClearNotes) {
            showToast('Lesson saved, but curriculum tracking failed', 'warning');
          } else {
            showToast('Failed to save curriculum tracking', 'error');
          }
          return;
        }
      }

      // Show appropriate success message and trigger refresh
      if ((hasNotes || shouldClearNotes) && hasCurriculum) {
        showToast('Lesson and curriculum saved', 'success');
        onUpdate?.();
      } else if (hasNotes) {
        showToast('Lesson saved', 'success');
        onUpdate?.();
      } else if (shouldClearNotes) {
        showToast('Notes cleared', 'success');
        onUpdate?.();
      } else if (hasCurriculum) {
        showToast('Curriculum saved', 'success');
        onUpdate?.();
      } else {
        showToast('Nothing to save', 'info');
      }
    } catch (error) {
      console.error('Error saving lesson:', error);
      const message = error instanceof Error ? error.message : 'Failed to save lesson';
      showToast(message, 'error');
    }
  };

  const handleDeleteLesson = async () => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;

    try {
      let response: Response;

      if (props.mode === 'group') {
        // Get lesson_date from the first session to delete the correct lesson
        const firstSession = props.sessions.find(s => s.session_date);
        const groupLessonDate = firstSession?.session_date;

        if (!groupLessonDate) {
          showToast('Unable to delete: no session date found', 'error');
          return;
        }

        const deleteUrl = `/api/groups/${props.groupId}/lesson?lesson_date=${encodeURIComponent(groupLessonDate)}`;

        response = await fetch(deleteUrl, {
          method: 'DELETE'
        });
      } else {
        // Session mode: delete via /api/save-lesson/{lessonId}
        if (!lesson?.id) return;
        response = await fetch(`/api/save-lesson/${lesson.id}`, {
          method: 'DELETE'
        });
      }

      if (!response.ok) throw new Error('Failed to delete lesson');

      setLesson(null);
      setNotes('');

      showToast('Lesson deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting lesson:', error);
      showToast('Failed to delete lesson', 'error');
    }
  };

  // Handle file selection - immediately upload
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Invalid file', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Upload immediately with original filename
    setUploading(true);
    try {
      const persistedId = await ensureSessionsPersistence();

      // In session mode, we need a valid session ID to upload documents
      if (props.mode === 'session' && !persistedId) {
        showToast('Failed to persist session for document upload', 'error');
        return;
      }

      // Get session_date for scoping document to this specific instance
      let instanceDate: string | null = null;
      if (props.mode === 'group') {
        const firstSession = groupSessions?.find(s => s.session_date);
        instanceDate = firstSession?.session_date || null;
      } else {
        instanceDate = sessionDate || null;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, '')); // Use filename without extension
      formData.append('document_type', 'file');
      if (instanceDate) {
        formData.append('session_date', instanceDate);
      }

      const endpoint = props.mode === 'group'
        ? `/api/groups/${props.groupId}/documents`
        : `/api/sessions/${persistedId}/documents`;

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload document');
      }

      const data = await response.json();
      setDocuments(prev => [data.document, ...prev]);
      showToast('Document uploaded', 'success');
      // Refresh parent data so session IDs are updated (temp → real)
      onUpdate?.();
    } catch (error) {
      console.error('Error uploading document:', error);
      showToast(error instanceof Error ? error.message : 'Failed to upload', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const endpoint = props.mode === 'group'
        ? `/api/groups/${props.groupId}/documents?documentId=${documentId}`
        : `/api/sessions/${currentSessionId}/documents?documentId=${documentId}`;

      const response = await fetch(endpoint, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete document');

      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      showToast('Document deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting document:', error);
      showToast('Failed to delete document', 'error');
    }
  };

  const handleDocumentClick = async (doc: Document) => {
    setDownloadingDocId(doc.id);
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`);
      if (!response.ok) throw new Error('Failed to get download URL');

      const data = await response.json();
      if (data.url) {
        const link = document.createElement('a');
        link.href = data.url;
        link.download = data.filename || 'download';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      showToast('Failed to download', 'error');
    } finally {
      setDownloadingDocId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-gray-900">
              {props.mode === 'group' ? props.groupName : `${props.student?.initials || '?'} - Session`}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-2xl font-light w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {/* Session info - different for group vs session mode */}
          {props.mode === 'group' ? (
            // Group mode: Session chips
            <div className="flex flex-wrap gap-2">
              {props.sessions.length === 0 ? (
                <p className="text-gray-500 text-sm">No sessions in this group</p>
              ) : (
                props.sessions.map((session) => {
                  const student = session.student_id ? props.students.get(session.student_id) : undefined;
                  return (
                    <div
                      key={session.id}
                      className="bg-gray-100 rounded-md px-2 py-1 text-xs flex items-center gap-1.5"
                    >
                      <span className="font-medium text-gray-900">
                        {formatTime(session.start_time)}-{formatTime(session.end_time)}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {student?.initials || '?'}
                      </span>
                      {student?.grade_level && (
                        <span className="text-gray-500">Gr{student.grade_level}</span>
                      )}
                      <span className={`px-1 py-0.5 rounded text-xs ${
                        session.delivered_by === 'sea'
                          ? 'bg-green-100 text-green-700'
                          : session.delivered_by === 'specialist'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}>
                        {session.delivered_by === 'sea'
                          ? 'SEA'
                          : session.delivered_by === 'specialist'
                            ? 'Spec'
                            : 'Me'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // Session mode: Single session info
            <div className="bg-gray-100 rounded-md px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">
                {props.student?.initials || '?'}
                {props.student?.grade_level && ` (Grade ${props.student.grade_level})`}
              </span>
              <span className="text-gray-400">•</span>
              <span className="font-medium text-gray-900">
                {formatTime(props.session.start_time)} - {formatTime(props.session.end_time)}
              </span>
              <span className="text-gray-400">•</span>
              <span className={`px-2 py-1 rounded ${
                props.session.delivered_by === 'sea'
                  ? 'bg-green-100 text-green-700'
                  : props.session.delivered_by === 'specialist'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
              }`}>
                {props.session.delivered_by === 'sea'
                  ? 'SEA'
                  : props.session.delivered_by === 'specialist'
                    ? 'Specialist'
                    : 'Me'}
              </span>
            </div>
          )}

          {/* Attendance Section */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Attendance:</span>
              {loadingAttendance ? (
                <span className="text-xs text-gray-400">Loading...</span>
              ) : (
                <>
                  <button
                    onClick={markAllPresentAndSave}
                    disabled={savingAttendance}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      allPresent()
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700'
                    } disabled:opacity-50`}
                  >
                    {savingAttendance ? '...' : allPresent() ? 'All Present ✓' : 'All Present'}
                  </button>
                  <button
                    onClick={() => setAttendanceExpanded(!attendanceExpanded)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-1"
                  >
                    Mark Absences
                    <svg
                      className={`w-3 h-3 transition-transform ${attendanceExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Expanded attendance view */}
            {attendanceExpanded && !loadingAttendance && (
              <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-3">
                {props.mode === 'group' ? (
                  props.sessions.map((session) => {
                    const studentId = session.student_id;
                    if (!studentId) return null;
                    const student = props.students.get(studentId);
                    const record = attendance.get(studentId);
                    const isPresent = record?.present ?? true;

                    return (
                      <div key={session.id} className="flex items-start gap-3 py-2 border-b border-gray-200 last:border-0">
                        <span className="font-medium text-sm text-gray-900 w-16">{student?.initials || '?'}</span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`attendance-${studentId}`}
                              checked={isPresent}
                              onChange={() => toggleStudentAttendance(studentId, true)}
                              className="text-green-600 focus:ring-green-500"
                            />
                            <span className="text-xs text-gray-700">Present</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`attendance-${studentId}`}
                              checked={!isPresent}
                              onChange={() => toggleStudentAttendance(studentId, false)}
                              className="text-red-600 focus:ring-red-500"
                            />
                            <span className="text-xs text-gray-700">Absent</span>
                          </label>
                        </div>
                        {!isPresent && (
                          <input
                            type="text"
                            value={record?.absence_reason || ''}
                            onChange={(e) => updateAbsenceReason(studentId, e.target.value)}
                            placeholder="Reason (optional)"
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    );
                  })
                ) : (
                  // Individual session mode
                  (() => {
                    const studentId = props.session.student_id;
                    if (!studentId) return null;
                    const record = attendance.get(studentId);
                    const isPresent = record?.present ?? true;

                    return (
                      <div className="flex items-start gap-3 py-2">
                        <span className="font-medium text-sm text-gray-900 w-16">{props.student?.initials || '?'}</span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="attendance-single"
                              checked={isPresent}
                              onChange={() => toggleStudentAttendance(studentId, true)}
                              className="text-green-600 focus:ring-green-500"
                            />
                            <span className="text-xs text-gray-700">Present</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="attendance-single"
                              checked={!isPresent}
                              onChange={() => toggleStudentAttendance(studentId, false)}
                              className="text-red-600 focus:ring-red-500"
                            />
                            <span className="text-xs text-gray-700">Absent</span>
                          </label>
                        </div>
                        {!isPresent && (
                          <input
                            type="text"
                            value={record?.absence_reason || ''}
                            onChange={(e) => updateAbsenceReason(studentId, e.target.value)}
                            placeholder="Reason (optional)"
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    );
                  })()
                )}

                {attendanceChanged && (
                  <div className="pt-2 border-t border-gray-200 mt-2">
                    <button
                      onClick={() => saveAttendance()}
                      disabled={savingAttendance}
                      className="w-full py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {savingAttendance ? 'Saving...' : 'Save Attendance'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content - Fixed sections + Scrollable form */}
        <div className="flex-1 overflow-y-auto">
          {/* Curriculum Context Section - Show prompt or normal display */}
          {showPrompt && previousCurriculum ? (
            // Show progression prompt
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📚</span>
                  <span className="font-medium text-gray-900 text-sm">
                    {previousCurriculum.curriculum_type === 'SPIRE' ? 'S.P.I.R.E.' : 'Reveal Math'}{' '}
                    {previousCurriculum.curriculum_type === 'SPIRE'
                      ? (previousCurriculum.curriculum_level === 'Foundations' ? '' : 'Level ')
                      : 'Grade '}{previousCurriculum.curriculum_level} • Lesson {previousCurriculum.current_lesson}
                  </span>
                  <span className="text-gray-600 text-sm ml-2">Completed?</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePromptAnswer('yes')}
                    disabled={promptAnswering}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    aria-label={`Yes, completed lesson ${previousCurriculum.current_lesson}`}
                  >
                    Yes ✓
                  </button>
                  <button
                    onClick={() => handlePromptAnswer('no')}
                    disabled={promptAnswering}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                    aria-label={`No, did not complete lesson ${previousCurriculum.current_lesson}`}
                  >
                    No ✗
                  </button>
                </div>
              </div>
            </div>
          ) : curriculumTracking ? (
            // Show normal curriculum display with +/- controls
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📚</span>
                  <div>
                    <h5 className="font-medium text-gray-900 text-sm">
                      {curriculumTracking.curriculum_type === 'SPIRE' ? 'S.P.I.R.E.' : 'Reveal Math'}{' '}
                      {curriculumTracking.curriculum_type === 'SPIRE'
                        ? (curriculumTracking.curriculum_level === 'Foundations' ? '' : 'Level ')
                        : 'Grade '}{curriculumTracking.curriculum_level}
                    </h5>
                  </div>
                </div>
                <LessonControl
                  currentLesson={currentLesson}
                  setCurrentLesson={setCurrentLesson}
                  curriculumType={curriculumType}
                  curriculumLevel={curriculumLevel}
                  getIdentifier={ensureSessionsPersistence}
                  identifierKey="sessionId"
                  onError={(message) => showToast(message, 'error')}
                  size="small"
                />
              </div>
            </div>
          ) : null}

          {/* Two-column grid: Documents and Curriculum */}
          <div className="grid grid-cols-2 gap-4 p-4 border-b border-gray-200">
            {/* Column 1: Documents */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">Documents</h3>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="py-1 px-2 bg-blue-600 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  {uploading ? '...' : '+ Add'}
                </button>
              </div>

              {loadingDocuments ? (
                <div className="flex items-center justify-center py-4">
                  <div className="text-gray-500 text-xs">Loading...</div>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {/* Documents List */}
                  {documents.length === 0 ? (
                    <div className="text-center py-2 text-gray-500 bg-white rounded border border-gray-200">
                      <p className="text-xs">No documents yet</p>
                    </div>
                  ) : (
                    documents.map((doc) => {
                      const Icon = doc.mime_type ? getDocumentIcon(doc.mime_type) : getDocumentIcon('application/octet-stream');
                      const isDownloading = downloadingDocId === doc.id;

                      return (
                        <div
                          key={doc.id}
                          onClick={() => !isDownloading && handleDocumentClick(doc)}
                          className={`bg-white border border-gray-200 rounded p-1.5 hover:border-gray-300 cursor-pointer hover:bg-gray-50 ${isDownloading ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isDownloading ? (
                              <div className="w-3 h-3 flex-shrink-0">
                                <svg className="animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              </div>
                            ) : (
                              <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
                            )}
                            <span className="text-xs text-gray-900 truncate flex-1">{doc.title}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(doc.id);
                              }}
                              className="text-gray-300 hover:text-red-500 flex-shrink-0"
                              title="Delete"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Column 2: Curriculum Tracking */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Curriculum</h3>
              <div className="space-y-2">
                <select
                  value={curriculumType}
                  onChange={(e) => {
                    setCurriculumType(e.target.value);
                    setCurriculumLevel('');
                  }}
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select curriculum...</option>
                  {CURRICULUM_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {curriculumType && (
                  <div className="flex gap-2">
                    <select
                      value={curriculumLevel}
                      onChange={(e) => setCurriculumLevel(e.target.value)}
                      className="flex-1 p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{curriculumType === 'SPIRE' ? 'Level' : 'Grade'}...</option>
                      {(curriculumType === 'SPIRE' ? SPIRE_LEVELS : REVEAL_MATH_GRADES).map(level => (
                        <option key={level} value={level}>
                          {curriculumType === 'SPIRE' && level !== 'Foundations' ? `Lvl ${level}` : level}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={currentLesson}
                      onChange={(e) => setCurrentLesson(parseInt(e.target.value) || 1)}
                      placeholder="Lesson"
                      className="w-20 p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
            {loadingLesson ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading...</div>
              </div>
            ) : editingNotes ? (
              <textarea
                ref={notesTextareaRef}
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => setEditingNotes(false)}
                placeholder="Enter your notes..."
                rows={10}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                autoFocus
              />
            ) : (
              <div
                onClick={() => {
                  setEditingNotes(true);
                  setTimeout(() => notesTextareaRef.current?.focus(), 0);
                }}
                className="w-full min-h-[240px] p-3 border border-gray-300 rounded-md cursor-text font-mono text-sm whitespace-pre-wrap hover:border-gray-400"
              >
                {notes ? renderNotesWithLinks(notes) : <span className="text-gray-400">Enter your notes...</span>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 p-6 border-t border-gray-200">
          <div>
            {lesson && (
              <button
                onClick={handleDeleteLesson}
                className="px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors font-medium"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Close
            </button>
            <button
              onClick={handleSaveLesson}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export with legacy name for backward compatibility during migration
export { SessionDetailsModal as GroupDetailsModal };
