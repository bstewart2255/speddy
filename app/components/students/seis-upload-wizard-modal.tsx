'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';

interface SeisUploadWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (data: any) => void;
  currentSchool?: any;
}

interface FileState {
  file: File | null;
  name: string;
  error: string | null;
}

export function SeisUploadWizardModal({
  isOpen,
  onClose,
  onUploadComplete,
  currentSchool
}: SeisUploadWizardModalProps) {
  const [studentsFile, setStudentsFile] = useState<FileState>({ file: null, name: '', error: null });
  const [deliveriesFile, setDeliveriesFile] = useState<FileState>({ file: null, name: '', error: null });
  const [classListFile, setClassListFile] = useState<FileState>({ file: null, name: '', error: null });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentsInputRef = useRef<HTMLInputElement>(null);
  const deliveriesInputRef = useRef<HTMLInputElement>(null);
  const classListInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStudentsFile({ file: null, name: '', error: null });
    setDeliveriesFile({ file: null, name: '', error: null });
    setClassListFile({ file: null, name: '', error: null });
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const validateFile = (file: File, allowedTypes: string[], maxSizeMB: number = 10): string | null => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedTypes.includes(extension)) {
      return `Invalid file type. Allowed: ${allowedTypes.join(', ')}`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File is too large. Maximum size is ${maxSizeMB}MB.`;
    }
    return null;
  };

  const handleStudentsFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateFile(file, ['xlsx', 'xls', 'csv']);
    setStudentsFile({ file: error ? null : file, name: file.name, error });
  };

  const handleDeliveriesFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateFile(file, ['csv']);
    setDeliveriesFile({ file: error ? null : file, name: file.name, error });
  };

  const handleClassListFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateFile(file, ['txt']);
    setClassListFile({ file: error ? null : file, name: file.name, error });
  };

  const handleProcessFiles = async () => {
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();

      if (studentsFile.file) {
        formData.append('studentsFile', studentsFile.file);
      }

      if (deliveriesFile.file) {
        formData.append('deliveriesFile', deliveriesFile.file);
      }

      if (classListFile.file) {
        formData.append('classListFile', classListFile.file);
      }

      if (currentSchool) {
        formData.append('currentSchoolId', currentSchool.school_id || '');
        formData.append('currentSchoolSite', currentSchool.school_site || '');
      }

      const response = await fetch('/api/import-students', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process files');
      }

      // Pass data to parent and close wizard
      onUploadComplete(result.data);
      handleClose();
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to process files. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const clearFile = (type: 'students' | 'deliveries' | 'classList') => {
    if (type === 'students') {
      setStudentsFile({ file: null, name: '', error: null });
      if (studentsInputRef.current) studentsInputRef.current.value = '';
    } else if (type === 'deliveries') {
      setDeliveriesFile({ file: null, name: '', error: null });
      if (deliveriesInputRef.current) deliveriesInputRef.current.value = '';
    } else {
      setClassListFile({ file: null, name: '', error: null });
      if (classListInputRef.current) classListInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={uploading ? undefined : handleClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-6 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                File Upload
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload student data from multiple sources
              </p>
            </div>
            <button
              onClick={handleClose}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-2xl font-light"
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Error message */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            {/* File 1: Student Goals (Optional) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-gray-700">
                  1. SEIS Student Goals Report
                </label>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Optional</span>
              </div>
              <p className="text-xs text-gray-500">
                SEIS Excel/CSV file with student names, grades, and IEP goals
              </p>

              <input
                ref={studentsInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleStudentsFileSelect}
                className="hidden"
              />

              {studentsFile.file ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-green-800">{studentsFile.name}</span>
                  </div>
                  <button
                    onClick={() => clearFile('students')}
                    className="text-sm text-green-700 hover:text-green-900"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => studentsInputRef.current?.click()}
                  className="w-full p-3 border-2 border-dashed border-gray-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <p className="text-sm text-gray-500">Click to select file (.xlsx, .xls, or .csv)</p>
                </button>
              )}

              {studentsFile.error && (
                <p className="text-xs text-red-600">{studentsFile.error}</p>
              )}
            </div>

            {/* File 2: Deliveries (Optional) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-gray-700">
                  2. SEIS Service Tracker &gt; Delivery Report
                </label>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Optional</span>
              </div>
              <p className="text-xs text-gray-500">
                SEIS Deliveries CSV to auto-fill schedule requirements (sessions per week)
              </p>

              <input
                ref={deliveriesInputRef}
                type="file"
                accept=".csv"
                onChange={handleDeliveriesFileSelect}
                className="hidden"
              />

              {deliveriesFile.file ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-green-800">{deliveriesFile.name}</span>
                  </div>
                  <button
                    onClick={() => clearFile('deliveries')}
                    className="text-sm text-green-700 hover:text-green-900"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => deliveriesInputRef.current?.click()}
                  className="w-full p-3 border-2 border-dashed border-gray-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <p className="text-sm text-gray-500">Click to select file (.csv)</p>
                </button>
              )}

              {deliveriesFile.error && (
                <p className="text-xs text-red-600">{deliveriesFile.error}</p>
              )}
            </div>

            {/* File 3: Class List (Optional) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-gray-700">
                  3. Aeries Reports &gt; Special Ed Class List
                </label>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Optional</span>
              </div>
              <p className="text-xs text-gray-500">
                Aeries Class List (Report Format: TXT, 'Print by Teacher') to auto-assign teachers to students
              </p>

              <input
                ref={classListInputRef}
                type="file"
                accept=".txt"
                onChange={handleClassListFileSelect}
                className="hidden"
              />

              {classListFile.file ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-green-800">{classListFile.name}</span>
                  </div>
                  <button
                    onClick={() => clearFile('classList')}
                    className="text-sm text-green-700 hover:text-green-900"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => classListInputRef.current?.click()}
                  className="w-full p-3 border-2 border-dashed border-gray-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <p className="text-sm text-gray-500">Click to select file (.txt)</p>
                </button>
              )}

              {classListFile.error && (
                <p className="text-xs text-red-600">{classListFile.error}</p>
              )}
            </div>

            {/* Info box */}
            <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="font-medium text-blue-800 mb-1">How it works:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                <li>Student Goals file provides names, grades, and IEP goals</li>
                <li>Deliveries file auto-fills session requirements</li>
                <li>Class List file auto-assigns teachers by matching names</li>
                <li>Unmatched students from optional files will be shown for review</li>
              </ul>
            </div>

            {currentSchool && (
              <div className="text-xs text-gray-700 bg-green-50 border border-green-200 rounded-md p-2">
                <strong>Importing to:</strong> {currentSchool.display_name || currentSchool.school_site || 'Current School'}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="secondary" onClick={handleClose} disabled={uploading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleProcessFiles}
              disabled={uploading || (!studentsFile.file && !deliveriesFile.file && !classListFile.file)}
            >
              {uploading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Process Files'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
