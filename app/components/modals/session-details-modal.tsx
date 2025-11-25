'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import { Link as LinkIcon, Upload } from 'lucide-react';
import {
  validateDocumentFile,
  getDocumentIcon,
  formatFileSize,
  getFileTypeName
} from '@/lib/document-utils';
import { formatTime } from '@/lib/utils/time-options';
import { ensureSessionPersisted } from '@/lib/services/session-persistence';
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

interface SessionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ScheduleSession;
  student: { initials: string; grade_level?: string } | undefined;
}

// Curriculum options
const CURRICULUM_OPTIONS = [
  { value: 'SPIRE', label: 'S.P.I.R.E.' },
  { value: 'Reveal Math', label: 'Reveal Math' }
];

const SPIRE_LEVELS = ['Foundations', '1', '2', '3', '4', '5', '6', '7', '8'];
const REVEAL_MATH_GRADES = ['K', '1', '2', '3', '4', '5'];

export function SessionDetailsModal({
  isOpen,
  onClose,
  session,
  student
}: SessionDetailsModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track persisted session ID (may differ from prop if we auto-save a temp session)
  const [currentSessionId, setCurrentSessionId] = useState<string>(session.id);

  // Helper to ensure session is persisted before operations that require a real ID
  // Using useCallback with proper dependencies to avoid stale closure issues
  const ensurePersistedSession = useCallback(async (): Promise<string> => {
    // If already using a permanent ID, return it
    if (!currentSessionId.startsWith('temp-')) {
      return currentSessionId;
    }

    // Persist the temp session and update our tracked ID
    const persistedSession = await ensureSessionPersisted(session);
    setCurrentSessionId(persistedSession.id);
    return persistedSession.id;
  }, [currentSessionId, session]);

  // Lesson state
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [notes, setNotes] = useState('');

  // Curriculum tracking state
  const [curriculumTracking, setCurriculumTracking] = useState<CurriculumTracking | null>(null);
  const [curriculumType, setCurriculumType] = useState('');
  const [curriculumLevel, setCurriculumLevel] = useState('');
  const [currentLesson, setCurrentLesson] = useState<number>(1);

  // Documents state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDocType, setNewDocType] = useState<'file' | 'link'>('link');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // Sync currentSessionId when session prop changes
  useEffect(() => {
    setCurrentSessionId(session.id);
  }, [session.id]);

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

  const fetchDocuments = useCallback(async (signal?: AbortSignal) => {
    // Skip documents for sessions that are still temporary (no real DB ID yet)
    if (currentSessionId.startsWith('temp-')) {
      setDocuments([]);
      return;
    }

    setLoadingDocuments(true);
    try {
      const response = await fetch(`/api/sessions/${currentSessionId}/documents`, { signal });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', response.status, errorData);
        console.error('Error details:', errorData.details);
        throw new Error(`${errorData.error}${errorData.details ? ': ' + errorData.details : ''}`);
      }

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
  }, [currentSessionId, showToast]);

  const fetchCurriculumTracking = useCallback(async (signal?: AbortSignal) => {
    // Skip curriculum tracking for sessions that are still temporary (no real DB ID yet)
    if (currentSessionId.startsWith('temp-')) {
      return;
    }

    try {
      const response = await fetch(`/api/curriculum-tracking?sessionId=${currentSessionId}`, { signal });
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
      }
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Silently fail for curriculum tracking - it's optional
      console.error('Error fetching curriculum tracking:', error);
    }
  }, [currentSessionId]);

  // Initialize lesson, documents and curriculum tracking when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset form if no lesson exists
      if (!lesson) {
        setNotes('');
      }

      // Fetch documents and curriculum tracking
      const controller = new AbortController();
      Promise.all([
        fetchDocuments(controller.signal),
        fetchCurriculumTracking(controller.signal)
      ]);
      return () => controller.abort();
    }
  }, [isOpen, fetchDocuments, fetchCurriculumTracking, lesson]);

  const saveCurriculumTracking = async () => {
    // Only save if all curriculum fields are provided
    if (!curriculumType || !curriculumLevel || !currentLesson) {
      return;
    }

    try {
      // Ensure session is persisted before saving curriculum tracking
      const sessionId = await ensurePersistedSession();

      const response = await fetch('/api/curriculum-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          curriculumType,
          curriculumLevel,
          currentLesson
        })
      });

      if (!response.ok) throw new Error('Failed to save curriculum tracking');

      const { data } = await response.json();
      setCurriculumTracking(data);
    } catch (error) {
      console.error('Error saving curriculum tracking:', error);
      throw error;
    }
  };

  const handleNextLesson = async () => {
    if (!curriculumTracking) {
      showToast('Please save curriculum information first', 'error');
      return;
    }

    try {
      // Ensure session is persisted before advancing lesson
      const sessionId = await ensurePersistedSession();

      const response = await fetch('/api/curriculum-tracking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'next'
        })
      });

      if (!response.ok) throw new Error('Failed to advance lesson');

      const { data } = await response.json();
      setCurriculumTracking(data);
      setCurrentLesson(data.current_lesson);

      showToast(`Advanced to Lesson ${data.current_lesson}`, 'success');
    } catch (error) {
      console.error('Error advancing lesson:', error);
      showToast('Failed to advance lesson', 'error');
    }
  };

  const handleSaveLesson = async () => {
    try {
      // Ensure session is persisted before saving lesson
      await ensurePersistedSession();

      const sessionDate = session.session_date || new Date().toISOString().split('T')[0];
      const timeSlot = `${session.start_time}-${session.end_time}`;

      const body = {
        timeSlot,
        students: [{ id: session.student_id, initials: student?.initials || '?' }],
        content: null,
        lessonDate: sessionDate,
        notes: notes.trim() || null,
        title: null,
        subject: null
      };

      const response = await fetch('/api/save-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to save lesson');

      const data = await response.json();
      setLesson(data.lesson);

      // Save curriculum tracking if provided
      if (curriculumType && curriculumLevel && currentLesson) {
        try {
          await saveCurriculumTracking();
        } catch (currError) {
          // Lesson saved but curriculum failed - warn user
          showToast('Lesson saved, but curriculum tracking failed', 'warning');
          return;
        }
      }

      showToast('Lesson saved successfully', 'success');
    } catch (error) {
      console.error('Error saving lesson:', error);
      showToast('Failed to save lesson', 'error');
    }
  };

  const handleDeleteLesson = async () => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    if (!lesson?.id) return;

    try {
      const response = await fetch(`/api/save-lesson/${lesson.id}`, {
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Invalid file', 'error');
      return;
    }

    setSelectedFile(file);
    setNewDocTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleAddDocument = async () => {
    if (newDocType === 'file') {
      await handleFileUpload();
    } else if (newDocType === 'link') {
      await handleLinkAdd();
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      showToast('Please select a file to upload', 'error');
      return;
    }

    if (!newDocTitle.trim()) {
      showToast('Please enter a title for the document', 'error');
      return;
    }

    setUploading(true);
    try {
      // Ensure session is persisted before uploading document
      const sessionId = await ensurePersistedSession();

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', newDocTitle.trim());
      formData.append('document_type', 'file');

      const response = await fetch(`/api/sessions/${sessionId}/documents`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload document');
      }

      const data = await response.json();
      setDocuments(prev => [data.document, ...prev]);

      // Reset form
      setNewDocTitle('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setAdding(false);

      showToast('Document uploaded successfully', 'success');
    } catch (error) {
      console.error('Error uploading document:', error);
      showToast(error instanceof Error ? error.message : 'Failed to upload document', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleLinkAdd = async () => {
    if (!newDocTitle.trim()) {
      showToast('Please enter a link description', 'error');
      return;
    }

    if (!newDocUrl.trim()) {
      showToast('Please enter a URL', 'error');
      return;
    }

    // Validate URL for links
    try {
      const u = new URL(newDocUrl.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        showToast('Only http(s) links are allowed', 'error');
        return;
      }
    } catch {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    try {
      // Ensure session is persisted before adding link
      const sessionId = await ensurePersistedSession();

      const body = {
        title: newDocTitle.trim(),
        document_type: 'link',
        url: newDocUrl.trim()
      };

      const response = await fetch(`/api/sessions/${sessionId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to add link');

      const data = await response.json();
      setDocuments(prev => [data.document, ...prev]);

      // Reset form
      setNewDocTitle('');
      setNewDocUrl('');
      setAdding(false);

      showToast('Link added successfully', 'success');
    } catch (error) {
      console.error('Error adding link:', error);
      showToast('Failed to add link', 'error');
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const response = await fetch(`/api/sessions/${currentSessionId}/documents?documentId=${documentId}`, {
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
    // Links open directly (handled by <a> tag)
    if (doc.document_type === 'link') {
      return;
    }

    // Files need to fetch download URL
    if (doc.document_type === 'file') {
      setDownloadingDocId(doc.id);
      try {
        const response = await fetch(`/api/documents/${doc.id}/download`);

        if (!response.ok) {
          throw new Error('Failed to get download URL');
        }

        const data = await response.json();

        if (data.type === 'file' && data.url) {
          // Open in new tab or trigger download
          const link = document.createElement('a');
          link.href = data.url;
          link.download = data.filename || 'download';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          showToast('Download started', 'success');
        }
      } catch (error) {
        console.error('Error downloading document:', error);
        showToast('Failed to download document', 'error');
      } finally {
        setDownloadingDocId(null);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {student?.initials || '?'} - Session
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {formatTime(session.start_time)} - {formatTime(session.end_time)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl font-light w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content - Fixed sections + Scrollable form */}
        <div className="flex-1 overflow-y-auto">
          {/* Fixed Section: Session Details */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Session Information</h3>
            <div className="bg-white rounded-md px-3 py-2 border border-gray-200 text-xs flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">
                {student?.initials || '?'}
                {student?.grade_level && ` (Grade ${student.grade_level})`}
              </span>
              <span className="text-gray-400">•</span>
              <span className="font-medium text-gray-900">
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
              </span>
              <span className="text-gray-400">•</span>
              <span className={`px-2 py-1 rounded ${
                session.delivered_by === 'sea'
                  ? 'bg-green-100 text-green-700'
                  : session.delivered_by === 'specialist'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
              }`}>
                {session.delivered_by === 'sea'
                  ? 'SEA'
                  : session.delivered_by === 'specialist'
                    ? 'Specialist'
                    : 'Provider'}
              </span>
              {session.service_type && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-900">{session.service_type}</span>
                </>
              )}
            </div>
          </div>

          {/* Curriculum Context Section */}
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
                    <p className="text-xs text-gray-600">
                      Lesson {curriculumTracking.current_lesson}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleNextLesson}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                >
                  Next Lesson →
                </button>
              </div>
            </div>
          )}

          {/* Fixed Section: Documents */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Documents</h3>
              {/* Add Document Button */}
              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="py-1.5 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Add Document</span>
                </button>
              )}
            </div>

            {loadingDocuments ? (
              <div className="flex items-center justify-center py-4">
                <div className="text-gray-500 text-sm">Loading documents...</div>
              </div>
            ) : (
              <div className="space-y-3">

                {/* Add Document Form */}
                {adding && (
                  <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                    <h4 className="font-medium text-gray-900">Add New Document</h4>

                    {/* Document Type Selection */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setNewDocType('link');
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                          newDocType === 'link'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <LinkIcon className="w-4 h-4" />
                        <span>Link</span>
                      </button>
                      <button
                        onClick={() => {
                          setNewDocType('file');
                          setNewDocUrl('');
                        }}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                          newDocType === 'file'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        <span>File Upload</span>
                      </button>
                    </div>

                    {/* File Input (hidden) */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv"
                      className="hidden"
                    />

                    {/* File Upload UI */}
                    {newDocType === 'file' && (
                      <div className="space-y-3">
                        {!selectedFile ? (
                          <button
                            onClick={handleFileButtonClick}
                            className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors flex flex-col items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
                          >
                            <Upload className="w-8 h-8" />
                            <span className="font-medium">Click to select file</span>
                            <span className="text-sm">PDF, Word, Excel, PowerPoint, Images, Text (max 25MB)</span>
                          </button>
                        ) : (
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {(() => {
                                  const Icon = getDocumentIcon(selectedFile.type);
                                  return <Icon className="w-8 h-8 text-gray-600" />;
                                })()}
                                <div>
                                  <p className="font-medium text-gray-900">{selectedFile.name}</p>
                                  <p className="text-sm text-gray-500">
                                    {getFileTypeName(selectedFile.type)} • {formatFileSize(selectedFile.size)}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedFile(null);
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}

                        <input
                          type="text"
                          value={newDocTitle}
                          onChange={(e) => setNewDocTitle(e.target.value)}
                          placeholder="Document Title"
                          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    {/* Link Input UI */}
                    {newDocType === 'link' && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={newDocTitle}
                          onChange={(e) => setNewDocTitle(e.target.value)}
                          placeholder="Link Description"
                          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="url"
                          value={newDocUrl}
                          onChange={(e) => setNewDocUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setAdding(false);
                          setNewDocTitle('');
                          setNewDocUrl('');
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddDocument}
                        disabled={uploading}
                        className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploading ? 'Uploading...' : 'Add'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Documents List */}
                <div className="space-y-2">
                  {documents.length === 0 && !adding ? (
                    <div className="text-center py-3 text-gray-500 bg-white rounded-md border border-gray-200">
                      <p className="text-xs">No documents attached yet</p>
                    </div>
                  ) : (
                    documents.map((doc) => {
                      // Get the appropriate icon based on document type
                      let Icon;
                      if ((doc.document_type === 'file' || doc.document_type === 'pdf') && doc.mime_type) {
                        Icon = getDocumentIcon(doc.mime_type);
                      } else if (doc.document_type === 'link') {
                        Icon = LinkIcon;
                      } else {
                        Icon = getDocumentIcon('application/octet-stream');
                      }

                      const isDownloading = downloadingDocId === doc.id;

                      return (
                        <div
                          key={doc.id}
                          onClick={() => !isDownloading && (doc.document_type === 'file' || doc.document_type === 'pdf') && handleDocumentClick(doc)}
                          className={`bg-white border border-gray-200 rounded-md p-2.5 hover:border-gray-300 transition-colors ${
                            (doc.document_type === 'file' || doc.document_type === 'pdf') ? 'cursor-pointer hover:bg-gray-50' : ''
                          } ${isDownloading ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              {isDownloading ? (
                                <div className="w-4 h-4 flex-shrink-0 mt-0.5">
                                  <svg className="animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </div>
                              ) : (
                                <Icon className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-medium text-gray-900 truncate">
                                  {doc.title}
                                  {isDownloading && <span className="ml-2 text-xs text-gray-500">Downloading...</span>}
                                </h5>

                                {/* File info */}
                                {(doc.document_type === 'file' || doc.document_type === 'pdf') && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {doc.mime_type && getFileTypeName(doc.mime_type)}
                                    {doc.file_size && ` • ${formatFileSize(doc.file_size)}`}
                                    <span className="ml-1 text-blue-600">• Click to download</span>
                                  </p>
                                )}

                                {/* Link info */}
                                {doc.document_type === 'link' && doc.url && (
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 mt-0.5 inline-block truncate max-w-full"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {doc.url}
                                  </a>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(doc.id);
                              }}
                              className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                              title="Delete document"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Curriculum Tracking Section */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Curriculum Tracking</h3>
            <div className="space-y-3 bg-white p-4 rounded-lg border border-gray-200">
              <h5 className="text-sm font-medium text-gray-900 mb-3">
                Curriculum Tracking (Optional)
              </h5>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Curriculum
                  </label>
                  <select
                    value={curriculumType}
                    onChange={(e) => {
                      setCurriculumType(e.target.value);
                      // Reset level when curriculum changes
                      setCurriculumLevel('');
                    }}
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select curriculum...</option>
                    {CURRICULUM_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {curriculumType && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {curriculumType === 'SPIRE' ? 'Level/Foundations' : 'Grade'}
                      </label>
                      <select
                        value={curriculumLevel}
                        onChange={(e) => setCurriculumLevel(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select {curriculumType === 'SPIRE' ? 'level' : 'grade'}...</option>
                        {(curriculumType === 'SPIRE' ? SPIRE_LEVELS : REVEAL_MATH_GRADES).map(level => (
                          <option key={level} value={level}>
                            {curriculumType === 'SPIRE' && level !== 'Foundations' ? `Level ${level}` : level}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Lesson Number
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={currentLesson}
                        onChange={(e) => setCurrentLesson(parseInt(e.target.value) || 1)}
                        className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>

            {lesson && lesson.lesson_source && (
              <p className="text-xs text-gray-500 mb-3">
                {lesson.lesson_source === 'ai_generated' ? '✨ AI-Generated' : '📝 Manual'}
              </p>
            )}

            <div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter your notes..."
                rows={15}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
              />
            </div>
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
