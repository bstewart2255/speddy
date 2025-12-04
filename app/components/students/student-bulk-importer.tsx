'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { SeisUploadWizardModal } from './seis-upload-wizard-modal';

interface StudentBulkImporterProps {
  onUploadComplete: (data: any) => void;
  disabled?: boolean;
  currentSchool?: any; // Current school context
}

export function StudentBulkImporter({ onUploadComplete, disabled = false, currentSchool }: StudentBulkImporterProps) {
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={() => setIsWizardOpen(true)}
        disabled={disabled}
      >
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
        Import Students from SEIS
      </Button>

      <div className="text-sm text-gray-600 space-y-1">
        <p className="font-medium">How it works:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Upload your SEIS Student Goals Report (.xlsx, .xls, or .csv)</li>
          <li>Optionally add Deliveries and Class List files</li>
          <li>Review student information and edit if needed</li>
          <li>Select which students to import</li>
        </ol>
      </div>

      <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-md p-2">
        <strong>New:</strong> You can now upload Deliveries (for schedule) and Class List (for teacher) files
        to automatically fill in student data.
      </div>

      {currentSchool && (
        <div className="text-xs text-gray-700 bg-green-50 border border-green-200 rounded-md p-2">
          <strong>Importing to:</strong> {currentSchool.display_name || currentSchool.school_site || 'Current School'}
          <br />
          <span className="text-gray-600">Students will be assigned to this school automatically.</span>
        </div>
      )}

      {/* Wizard Modal */}
      <SeisUploadWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onUploadComplete={onUploadComplete}
        currentSchool={currentSchool}
      />
    </div>
  );
}
