import React from 'react';
import { X, Info } from 'lucide-react';

interface OnboardingBannerProps {
  message: string;
  onDismiss: () => void;
  bgColor?: string;
}

export function OnboardingBanner({ 
  message, 
  onDismiss, 
  bgColor = 'bg-blue-50' 
}: OnboardingBannerProps) {
  return (
    <div className={`${bgColor} border border-blue-200 rounded-lg p-4 mb-4`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <Info className="h-5 w-5 text-blue-400" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm text-blue-800">{message}</p>
        </div>
        <div className="ml-auto pl-3">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex rounded-md p-1.5 text-blue-500 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-blue-50"
          >
            <span className="sr-only">Dismiss</span>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
