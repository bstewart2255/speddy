'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';

interface StudentBulkImporterProps {
  onUploadComplete: (data: any) => void;
  disabled?: boolean;
  currentSchool?: any; // Current school context
}

export function StudentBulkImporter({ onUploadComplete, disabled = false, currentSchool }: StudentBulkImporterProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCSV = file.name.endsWith('.csv');

    if (!isExcel && !isCSV) {
      setError('Please select an Excel file (.xlsx or .xls) or CSV file (.csv)');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError('File is too large. Maximum size is 10MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Add current school context for filtering (multi-school support)
      if (currentSchool) {
        formData.append('currentSchoolId', currentSchool.school_id || '');
        formData.append('currentSchoolSite', currentSchool.school_site || '');
      }

      // Upload to API for preview
      const response = await fetch('/api/import-students', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process file');
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Pass preview data to parent
      onUploadComplete(result.data);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      <Button
        type="button"
        variant="default"
        size="default"
        onClick={handleButtonClick}
        disabled={disabled || uploading}
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
            Processing file...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Import Students from SEIS Report
          </>
        )}
      </Button>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="text-sm text-gray-600 space-y-1">
        <p className="font-medium">How it works:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Upload your SEIS Student Goals Report (.xlsx, .xls, or .csv)</li>
          <li>Review student information and edit initials if needed</li>
          <li>Select which students to import</li>
          <li>Complete student details (teacher, schedule) later</li>
        </ol>
      </div>

      <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-md p-2">
        <strong>Note:</strong> Students will be imported with their names, grades, and IEP goals.
        You'll need to assign teachers and configure schedules separately for each student.
      </div>

      {currentSchool && (
        <div className="text-xs text-gray-700 bg-green-50 border border-green-200 rounded-md p-2">
          <strong>Importing to:</strong> {currentSchool.display_name || currentSchool.school_site || 'Current School'}
          <br />
          <span className="text-gray-600">Students will be assigned to this school automatically.</span>
        </div>
      )}
    </div>
  );
}
