'use client';

import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import type { TargetPreviewData } from '@/lib/types/student-import';

interface IEPGoalsUploaderProps {
  onUploadComplete: (data: TargetPreviewData) => void;
  disabled?: boolean;
  targetStudent?: {
    id: string;
    initials: string;
    grade_level: string;
  };
}

export function IEPGoalsUploader({ onUploadComplete, disabled = false, targetStudent }: IEPGoalsUploaderProps) {
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
      setError('Unsupported file type. Accepted: .xlsx, .xls, .csv');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError('File is larger than 10MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Add target student ID if provided
      if (targetStudent) {
        formData.append('targetStudentId', targetStudent.id);
      }

      // Upload to API
      const response = await fetch('/api/import-iep-goals', {
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

      // Nothing matched the caseload — the route returns 200 with matches:[] when
      // it parsed rows but none matched (wrong initials/grade). Explain it here
      // rather than open a blank review with no rows and no reason.
      if (!result.data?.matches?.length) {
        setError(
          targetStudent
            ? `We couldn't match ${targetStudent.initials} (Grade ${targetStudent.grade_level}) to anyone in that file. Check that the initials and grade match your records.`
            : 'No students in that file matched your caseload. Check that initials and grades match your records.'
        );
        return;
      }

      // Pass data to parent
      onUploadComplete(result.data as TargetPreviewData);
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
    <div className="space-y-2">
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
        variant="secondary"
        size="sm"
        onClick={handleButtonClick}
        disabled={disabled || uploading}
        className="text-sm"
      >
        {uploading ? (
          <>
            <Spinner className="-ml-1 mr-2 h-4 w-4" />
            {targetStudent ? `Importing goals for ${targetStudent.initials}…` : 'Importing…'}
          </>
        ) : (
          <>
            <Upload className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
            Import goals from a file
          </>
        )}
      </Button>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        {targetStudent
          ? `Upload a SEIS report (.xlsx, .xls, or .csv) with IEP goals for ${targetStudent.initials} (Grade ${targetStudent.grade_level}).`
          : 'Upload a SEIS report (.xlsx, .xls, or .csv) with IEP goals. The system will match students by initials and grade.'}
      </p>
    </div>
  );
}
