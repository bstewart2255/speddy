"use client";

import { useState } from 'react';
import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  schoolId: string;
  schoolName: string;
}

export function ShareButton({ schoolId, schoolName }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const handleShare = async () => {
    setIsSharing(true);
    setShareStatus('idle');
    setStatusMessage('');

    try {
      const response = await fetch('/api/schedule-sharing/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ school_id: schoolId }),
      });

      if (!response.ok) {
        throw new Error('Failed to create share request');
      }

      setShareStatus('success');
      setStatusMessage('Your schedules are now available for team members to import');
    } catch (error) {
      console.error('Error sharing schedules:', error);
      setShareStatus('error');
      setStatusMessage('Failed to share schedules. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-start space-x-3">
        <Share2 className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-gray-900">Schedule Sharing</h4>
          <p className="text-sm text-gray-600 mt-1">
            Share your Bell Schedules and Special Activities with your team at {schoolName}
          </p>
          
          <button
            onClick={handleShare}
            disabled={isSharing}
            className={`mt-3 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              isSharing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : shareStatus === 'success'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSharing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sharing...
              </span>
            ) : shareStatus === 'success' ? (
              <span className="flex items-center">
                <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Shared Successfully
              </span>
            ) : (
              'Share Your Schedules'
            )}
          </button>

          {statusMessage && (
            <div className={`mt-2 text-sm ${
              shareStatus === 'success' ? 'text-green-600' : 'text-red-600'
            }`}>
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}