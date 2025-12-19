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
import { ensureSessionsPersisted } from '@/lib/services/session-persistence';
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

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  sessions: ScheduleSession[];
  students: Map<string, { initials: string; grade_level?: string }>;
  /** Optional curriculum data from parent to avoid redundant API call */
  initialCurriculum?: CurriculumData | null;
  /** Callback when data is saved (to refresh parent data) */
  onUpdate?: () => void;
}

// Curriculum options
const CURRICULUM_OPTIONS = [
  { value: 'SPIRE', label: 'S.P.I.R.E.' },
  { value: 'Reveal Math', label: 'Reveal Math' }
];

const SPIRE_LEVELS = ['Foundations', '1', '2', '3', '4', '5', '6', '7', '8'];
const REVEAL_MATH_GRADES = ['K', '1', '2', '3', '4', '5'];

export function GroupDetailsModal({
  isOpen,
  onClose,
  groupId,
  groupName,
  sessions,
  students,
  initialCurriculum,
  onUpdate
}: GroupDetailsModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to ensure all sessions in the group are persisted before operations
  /**
   * Ensures all temp sessions in the group are persisted.
   * Returns the first persisted session ID (for curriculum tracking).
   */
  const ensureGroupSessionsPersisted = async (): Promise<string | undefined> => {
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
    setLoadingLesson(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/lesson`, { signal });
      if (!response.ok) throw new Error('Failed to fetch lesson');

      const data = await response.json();
      setLesson(data.lesson);

      if (data.lesson) {
        setNotes(data.lesson.notes || '');
      }
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching lesson:', error);
      showToast('Failed to load lesson', 'error');
    } finally {
      setLoadingLesson(false);
    }
  }, [groupId, showToast]);

  const fetchDocuments = useCallback(async (signal?: AbortSignal) => {
    setLoadingDocuments(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/documents`, { signal });
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
  }, [groupId, showToast]);

  // Get first persisted session ID for curriculum tracking
  const getPersistedSessionId = useCallback(() => {
    const persistedSession = sessions.find(s => !s.id.startsWith('temp-'));
    return persistedSession?.id;
  }, [sessions]);

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

  // Fetch lesson, documents, and curriculum tracking when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    fetchLesson(controller.signal);
    fetchDocuments(controller.signal);
    fetchCurriculumTracking(controller.signal);

    return () => controller.abort();
  }, [isOpen, fetchLesson, fetchDocuments, fetchCurriculumTracking]);

  /**
   * Saves curriculum tracking for the group.
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
        sessionId = await ensureGroupSessionsPersisted();
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

  const handleSaveLesson = async () => {
    try {
      // Ensure all sessions in the group are persisted before saving
      // and get the persisted session ID for curriculum tracking
      const persistedSessionId = await ensureGroupSessionsPersisted();
      console.log('Persisted session ID:', persistedSessionId);

      const hasNotes = notes.trim().length > 0;
      const hasCurriculum = !!(curriculumType && curriculumLevel && currentLesson);
      console.log('Curriculum state:', { curriculumType, curriculumLevel, currentLesson, hasCurriculum });
      // Check if we need to clear existing notes (lesson exists but notes are now empty)
      const shouldClearNotes = lesson !== null && !hasNotes;

      // Save lesson if there are notes OR if we need to clear existing notes
      if (hasNotes || shouldClearNotes) {
        const body: any = {
          title: null,
          content: null,
          lesson_source: 'manual',
          subject: null,
          notes: hasNotes ? notes.trim() : null
        };

        const response = await fetch(`/api/groups/${groupId}/lesson`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

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
        console.log('Attempting to save curriculum with session ID:', persistedSessionId);
        try {
          const curriculumSaved = await saveCurriculumTracking(persistedSessionId);
          console.log('Curriculum save result:', curriculumSaved);
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
      const response = await fetch(`/api/groups/${groupId}/lesson`, {
        method: 'DELETE'
      });

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
      await ensureGroupSessionsPersisted();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, '')); // Use filename without extension
      formData.append('document_type', 'file');

      const response = await fetch(`/api/groups/${groupId}/documents`, {
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
      const response = await fetch(`/api/groups/${groupId}/documents?documentId=${documentId}`, {
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
            <h2 className="text-xl font-semibold text-gray-900">{groupName}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-2xl font-light w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {/* Session chips in header */}
          <div className="flex flex-wrap gap-2">
            {sessions.length === 0 ? (
              <p className="text-gray-500 text-sm">No sessions in this group</p>
            ) : (
              sessions.map((session) => {
                const student = session.student_id ? students.get(session.student_id) : undefined;
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
        </div>

        {/* Content - Fixed sections + Scrollable form */}
        <div className="flex-1 overflow-y-auto">
          {/* Curriculum Context Section - Show above grid if tracking exists */}
          {curriculumTracking && (
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
                  getIdentifier={ensureGroupSessionsPersisted}
                  identifierKey="sessionId"
                  onError={(message) => showToast(message, 'error')}
                  size="small"
                />
              </div>
            </div>
          )}

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
