'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import { Link as LinkIcon, Upload } from 'lucide-react';
import {
  validateDocumentFile,
  getDocumentIcon,
  formatFileSize,
  getFileTypeName
} from '@/lib/document-utils';

interface GroupDocument {
  id: string;
  group_id: string;
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

interface GroupDocumentsPanelProps {
  groupId: string;
}

export function GroupDocumentsPanel({ groupId }: GroupDocumentsPanelProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<GroupDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDocType, setNewDocType] = useState<'file' | 'link'>('link');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch documents on mount
  useEffect(() => {
    const controller = new AbortController();
    fetchDocuments(controller.signal);
    return () => controller.abort();
  }, [groupId]);

  const fetchDocuments = async (signal?: AbortSignal) => {
    setLoading(true);
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
      setLoading(false);
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
    setNewDocTitle(file.name.replace(/\.[^/.]+$/, '')); // Set filename without extension as default title
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

      const response = await fetch(`/api/groups/${groupId}/documents`, {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Loading documents...</div>
      </div>
    );
  }

  return (
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
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
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
                setNewDocContent('');
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
          <div className="text-center py-8 text-gray-500">
            <p>No documents attached yet</p>
            <p className="text-sm mt-1">Add your first document to get started</p>
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
              Icon = getDocumentIcon('application/octet-stream'); // Default file icon
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
  );
}
