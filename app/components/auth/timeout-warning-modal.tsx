'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

interface TimeoutWarningModalProps {
  isOpen: boolean;
  onStaySignedIn: () => void;
  onLogout: () => void;
  remainingSeconds: number;
}

export function TimeoutWarningModal({
  isOpen,
  onStaySignedIn,
  onLogout,
  remainingSeconds: initialSeconds,
}: TimeoutWarningModalProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const intervalRef = useRef<NodeJS.Timeout>();
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const ariaLiveRef = useRef<HTMLDivElement>(null);

  // Update countdown
  useEffect(() => {
    setSeconds(initialSeconds);
    
    if (isOpen && initialSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds(prev => {
          const newSeconds = prev - 1;
          if (newSeconds <= 0) {
            onLogout();
            return 0;
          }
          return newSeconds;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOpen, initialSeconds, onLogout]);

  // Focus management and accessibility
  useEffect(() => {
    if (isOpen && stayButtonRef.current) {
      // Focus the "Stay signed in" button as recommended
      const timer = setTimeout(() => {
        stayButtonRef.current?.focus();
      }, 100);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onStaySignedIn();
    }
  }, [onStaySignedIn]);

  // Format remaining time
  const formatTime = useCallback((totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="timeout-title">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" />

        {/* Modal */}
        <div className="flex min-h-screen items-center justify-center p-4">
          <div 
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
            onKeyDown={handleKeyDown}
          >
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-amber-500" aria-hidden="true" />
                <h2 id="timeout-title" className="text-lg font-semibold text-gray-900">
                  Session Timeout Warning
                </h2>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              <div className="space-y-4">
                <p className="text-gray-700">
                  You will be automatically signed out due to inactivity.
                </p>
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-800 mb-1">
                      {formatTime(seconds)}
                    </div>
                    <div className="text-sm text-amber-700">
                      remaining
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  Click "Stay signed in" to continue your session, or you will be automatically logged out.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Sign out now
              </button>
              <button
                ref={stayButtonRef}
                type="button"
                onClick={onStaySignedIn}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Screen reader announcements */}
      <div
        ref={ariaLiveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isOpen && `Session timeout warning. ${formatTime(seconds)} remaining before automatic logout.`}
      </div>
    </>
  );
}