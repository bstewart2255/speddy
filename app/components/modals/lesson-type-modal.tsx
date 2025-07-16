'use client';

import { useEffect } from 'react';

interface LessonTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAI: () => void;
  onSelectManual: () => void;
}

export function LessonTypeModal({ 
  isOpen, 
  onClose, 
  onSelectAI, 
  onSelectManual 
}: LessonTypeModalProps) {
  // Add escape key handler and body scroll prevention
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop with fade-in animation */}
      <div 
        className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity duration-300 ease-in-out" 
        onClick={onClose} 
      />

      {/* Center modal with slide-in animation */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="relative bg-white rounded-lg shadow-xl max-w-md w-full transform transition-all duration-300 ease-out"
          style={{
            animation: isOpen ? 'slideIn 0.3s ease-out' : '',
          }}
        >
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-medium text-gray-900">Create Lesson Plan</h3>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            <div className="space-y-3">
              {/* AI Option Card */}
              <button
                onClick={() => {
                  onSelectAI();
                  onClose();
                }}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">🤖</span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 group-hover:text-blue-600">
                      Create AI Lesson Plan
                    </h4>
                    <p className="text-sm text-gray-500 mt-1">
                      Generate a lesson plan using AI assistance
                    </p>
                  </div>
                </div>
              </button>

              {/* Manual Option Card */}
              <button
                onClick={() => {
                  onSelectManual();
                  onClose();
                }}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">📝</span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 group-hover:text-blue-600">
                      Create Manual Lesson Plan
                    </h4>
                    <p className="text-sm text-gray-500 mt-1">
                      Input your own lesson plan details
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* Cancel Button */}
            <div className="mt-6">
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}