'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/app/contexts/toast-context';

interface GroupDocument {
  id: string;
  group_id: string;
  title: string;
  document_type: 'pdf' | 'link' | 'note';
  content?: string | null;
  url?: string | null;
  file_path?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface GroupDocumentsPanelProps {
  groupId: string;
}

export function GroupDocumentsPanel({ groupId }: GroupDocumentsPanelProps) {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<GroupDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDocType, setNewDocType] = useState<'pdf' | 'link' | 'note'>('note');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');

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
      console.error('Error fetching documents:', error);
      showToast('Failed to load documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!newDocTitle.trim()) {
      showToast('Please enter a title', 'error');
      return;
    }

    if (newDocType === 'note' && !newDocContent.trim()) {
      showToast('Please enter content for the note', 'error');
      return;
    }

    if (newDocType === 'link' && !newDocUrl.trim()) {
      showToast('Please enter a URL', 'error');
      return;
    }

    // Validate URL for links
    if (newDocType === 'link') {
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
    }

    try {
      const body: any = {
        title: newDocTitle.trim(),
        document_type: newDocType
      };

      if (newDocType === 'note') {
        body.content = newDocContent.trim();
      } else if (newDocType === 'link') {
        body.url = newDocUrl.trim();
      }

      const response = await fetch(`/api/groups/${groupId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to add document');

      const data = await response.json();
      setDocuments(prev => [data.document, ...prev]);

      // Reset form
      setNewDocTitle('');
      setNewDocContent('');
      setNewDocUrl('');
      setAdding(false);

      showToast('Document added successfully', 'success');
    } catch (error) {
      console.error('Error adding document:', error);
      showToast('Failed to add document', 'error');
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

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return '📄';
      case 'link':
        return '🔗';
      case 'note':
        return '📝';
      default:
        return '📎';
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
              onClick={() => setNewDocType('note')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                newDocType === 'note'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              📝 Note
            </button>
            <button
              onClick={() => setNewDocType('link')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                newDocType === 'link'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              🔗 Link
            </button>
            <button
              onClick={() => setNewDocType('pdf')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                newDocType === 'pdf'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              disabled
              title="PDF upload coming soon"
            >
              📄 PDF (coming soon)
            </button>
          </div>

          {/* Title Input */}
          <input
            type="text"
            value={newDocTitle}
            onChange={(e) => setNewDocTitle(e.target.value)}
            placeholder="Document title"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Content/URL Input based on type */}
          {newDocType === 'note' && (
            <textarea
              value={newDocContent}
              onChange={(e) => setNewDocContent(e.target.value)}
              placeholder="Enter your note content..."
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {newDocType === 'link' && (
            <input
              type="url"
              value={newDocUrl}
              onChange={(e) => setNewDocUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setNewDocTitle('');
                setNewDocContent('');
                setNewDocUrl('');
              }}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDocument}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Add
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
          documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-2xl">{getDocumentIcon(doc.document_type)}</span>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-medium text-gray-900 truncate">{doc.title}</h5>

                    {doc.document_type === 'note' && doc.content && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{doc.content}</p>
                    )}

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
          ))
        )}
      </div>
    </div>
  );
}
