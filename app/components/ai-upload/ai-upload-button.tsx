// app/components/ai-upload/ai-upload-button.tsx
'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import AIUploadModal from './ai-upload-modal';

interface AIUploadButtonProps {
  uploadType: 'students' | 'bell_schedule' | 'special_activities';
  onSuccess: () => void;
  className?: string;
}

export default function AIUploadButton({ 
  uploadType, 
  onSuccess,
  className = ''
}: AIUploadButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${className}`}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        AI Upload
      </button>

      <AIUploadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        uploadType={uploadType}
        onSuccess={onSuccess}
      />
    </>
  );
}
