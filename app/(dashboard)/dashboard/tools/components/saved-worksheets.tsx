'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TrashIcon, ArrowDownTrayIcon, DocumentTextIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/app/contexts/toast-context';

interface SavedWorksheet {
  id: string;
  title: string;
  file_path: string;
  file_type: 'pdf' | 'doc' | 'docx';
  file_size: number;
  created_at: string;
}

export default function SavedWorksheets() {
  const { showToast } = useToast();
  const [worksheets, setWorksheets] = useState<SavedWorksheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchWorksheets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/saved-worksheets');

      if (!response.ok) {
        throw new Error('Failed to fetch worksheets');
      }

      const data = await response.json();
      setWorksheets(data);
    } catch (error) {
      showToast('Failed to load saved worksheets', 'error');
      console.error('Error fetching worksheets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchWorksheets();
  }, [fetchWorksheets]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      showToast('Invalid file type. Please select a PDF or DOC file.', 'error');
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showToast('File size exceeds 10MB limit', 'error');
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Please enter a title', 'error');
      return;
    }

    if (!selectedFile) {
      showToast('Please select a file', 'error');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('file', selectedFile);

      const response = await fetch('/api/saved-worksheets', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload worksheet');
      }

      const newWorksheet = await response.json();
      setWorksheets([newWorksheet, ...worksheets]);

      // Reset form
      setTitle('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      showToast('Worksheet uploaded successfully', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to upload worksheet', 'error');
      console.error('Error uploading worksheet:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (worksheet: SavedWorksheet) => {
    try {
      const response = await fetch(`/api/saved-worksheets/${worksheet.id}`);

      if (!response.ok) {
        throw new Error('Failed to download worksheet');
      }

      const data = await response.json();

      // Validate that the URL is from Supabase storage
      const url = new URL(data.signedUrl);
      if (!url.hostname.includes('supabase.co')) {
        throw new Error('Invalid download URL');
      }

      // Use anchor element for safer download
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = worksheet.title || 'worksheet';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      showToast('Failed to download worksheet', 'error');
      console.error('Error downloading worksheet:', error);
    }
  };

  const handleDelete = async (worksheetId: string) => {
    try {
      const response = await fetch(`/api/saved-worksheets/${worksheetId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete worksheet');
      }

      showToast('Worksheet deleted successfully', 'success');
      setWorksheets(worksheets.filter(w => w.id !== worksheetId));
      setDeleteConfirmId(null);
    } catch (error) {
      showToast('Failed to delete worksheet', 'error');
      console.error('Error deleting worksheet:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') {
      return <DocumentTextIcon className="w-12 h-12 text-red-500" />;
    }
    return <DocumentIcon className="w-12 h-12 text-blue-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Upload Form */}
      <div className="mb-8 bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload New Worksheet</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter worksheet title"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isUploading}
            />
          </div>

          <div>
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-1">
              File (PDF or DOC, max 10MB) *
            </label>
            <input
              type="file"
              id="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileSelect}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isUploading}
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isUploading || !title.trim() || !selectedFile}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : 'Upload Worksheet'}
          </button>
        </form>
      </div>

      {/* Worksheets Grid */}
      {worksheets.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            No saved worksheets yet. Upload your first worksheet above!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {worksheets.map(worksheet => (
            <div
              key={worksheet.id}
              className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                {/* File Icon */}
                <div className="flex justify-center mb-4">
                  {getFileIcon(worksheet.file_type)}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 text-center">
                  {worksheet.title}
                </h3>

                {/* Metadata */}
                <div className="space-y-1 text-sm text-gray-600 mb-4">
                  <p className="text-center">
                    <span className="font-medium">Type:</span> {worksheet.file_type.toUpperCase()}
                  </p>
                  <p className="text-center">
                    <span className="font-medium">Size:</span> {formatFileSize(worksheet.file_size)}
                  </p>
                  <p className="text-center">
                    <span className="font-medium">Uploaded:</span>{' '}
                    {new Date(worksheet.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleDownload(worksheet)}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                    Download
                  </button>

                  {deleteConfirmId === worksheet.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(worksheet.id)}
                        className="px-3 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-2 text-sm font-medium rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(worksheet.id)}
                      className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
