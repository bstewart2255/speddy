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
import type { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type Lesson = Database['public']['Tables']['lessons']['Row'];

interface SessionDocument {
  id: string;
  session_id: string;
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

export function SessionDetailsModal({
  isOpen,
  onClose,
  session,
  student
}: SessionDetailsModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lesson state
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Documents state
  const [documents, setDocuments] = useState<SessionDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDocType, setNewDocType] = useState<'file' | 'link'>('link');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
    setLoadingDocuments(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}/documents`, { signal });
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
  }, [session.id, showToast]);

  // Initialize lesson and documents when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoading(false);
      // Reset form if no lesson exists
      if (!lesson) {
        setTitle('');
        setContent('');
      }

      // Fetch documents
      const controller = new AbortController();
      fetchDocuments(controller.signal);
      return () => controller.abort();
    }
  }, [isOpen, lesson, fetchDocuments]);

  const formatTime = (time: string | null) => {
    if (!time) return "Unscheduled";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleSaveLesson = async () => {
    if (!content.trim()) {
      showToast('Please enter lesson content', 'error');
      return;
    }

    try {
      const sessionDate = session.session_date || new Date().toISOString().split('T')[0];
      const timeSlot = `${session.start_time}-${session.end_time}`;

      const body = {
        timeSlot,
        students: [{ id: session.student_id, initials: student?.initials || '?' }],
        content: content.trim(),
        lessonDate: sessionDate,
        notes: null,
        title: title.trim() || `Lesson for ${student?.initials || '?'}`,
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
      setTitle('');
      setContent('');

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
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', newDocTitle.trim());
      formData.append('document_type', 'file');

      const response = await fetch(`/api/sessions/${session.id}/documents`, {
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
      const body = {
        title: newDocTitle.trim(),
        document_type: 'link',
        url: newDocUrl.trim()
      };

      const response = await fetch(`/api/sessions/${session.id}/documents`, {
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
      const response = await fetch(`/api/sessions/${session.id}/documents?documentId=${documentId}`, {
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
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Session Information</h3>
            <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-700">Student:</span>
                <span className="text-sm text-gray-900 ml-2">
                  {student?.initials || '?'}
                  {student?.grade_level && ` (Grade ${student.grade_level})`}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Time:</span>
                <span className="text-sm text-gray-900 ml-2">
                  {formatTime(session.start_time)} - {formatTime(session.end_time)}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Delivered By:</span>
                <span className={`text-sm ml-2 px-2 py-1 rounded ${
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
              </div>
              {session.service_type && (
                <div>
                  <span className="text-sm font-medium text-gray-700">Service Type:</span>
                  <span className="text-sm text-gray-900 ml-2">{session.service_type}</span>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Section: Documents */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Documents</h3>

            {loadingDocuments ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading documents...</div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Add Document Button */}
                {!adding && (
                  <button
                    onClick={() => setAdding(true)}
                    className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <span>+</span>
                    <span>Add Document</span>
                  </button>
                )}

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
                  {documents.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 bg-white rounded-lg border border-gray-200">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    documents.map((doc) => {
                      // Get the appropriate icon based on document type
                      let Icon;
                      if (doc.document_type === 'file' && doc.mime_type) {
                        Icon = getDocumentIcon(doc.mime_type);
                      } else if (doc.document_type === 'link') {
                        Icon = LinkIcon;
                      } else {
                        Icon = getDocumentIcon('application/octet-stream');
                      }

                      return (
                        <div
                          key={doc.id}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <Icon className="w-6 h-6 text-gray-600 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <h5 className="font-medium text-gray-900 truncate">{doc.title}</h5>

                                {/* File info */}
                                {doc.document_type === 'file' && (
                                  <div className="mt-1 space-y-1">
                                    <p className="text-sm text-gray-600">
                                      {doc.original_filename && (
                                        <span className="truncate block">{doc.original_filename}</span>
                                      )}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {doc.mime_type && getFileTypeName(doc.mime_type)}
                                      {doc.file_size && ` • ${formatFileSize(doc.file_size)}`}
                                    </p>
                                  </div>
                                )}

                                {/* Link info */}
                                {doc.document_type === 'link' && doc.url && (
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 mt-1 inline-block truncate max-w-full"
                                  >
                                    {doc.url}
                                  </a>
                                )}

                                <p className="text-xs text-gray-400 mt-1">
                                  Added {new Date(doc.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-gray-400 hover:text-red-600 transition-colors ml-2"
                              title="Delete document"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* Scrollable Section: Lesson Form */}
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Lesson Plan</h3>

            {lesson && lesson.lesson_source && (
              <p className="text-xs text-gray-500 mb-3">
                {lesson.lesson_source === 'ai_generated' ? '✨ AI-Generated' : '📝 Manual'}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Lesson for ${student?.initials || '?'}`}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lesson Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter your lesson plan content..."
                  rows={15}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                />
              </div>
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
                Delete Lesson
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
              Save Lesson
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
