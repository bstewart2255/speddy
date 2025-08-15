'use client';

import { useEffect, useState } from 'react';

interface LastSavedProps {
  timestamp: string | null | undefined;
  className?: string;
}

export function LastSaved({ timestamp, className = '' }: LastSavedProps) {
  const [relativeTime, setRelativeTime] = useState<string>('');

  useEffect(() => {
    if (!timestamp) {
      setRelativeTime('Never saved');
      return;
    }

    const updateRelativeTime = () => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 5) {
        setRelativeTime('Just now');
      } else if (diffSecs < 60) {
        setRelativeTime(`${diffSecs} seconds ago`);
      } else if (diffMins === 1) {
        setRelativeTime('1 minute ago');
      } else if (diffMins < 60) {
        setRelativeTime(`${diffMins} minutes ago`);
      } else if (diffHours === 1) {
        setRelativeTime('1 hour ago');
      } else if (diffHours < 24) {
        setRelativeTime(`${diffHours} hours ago`);
      } else if (diffDays === 1) {
        setRelativeTime('1 day ago');
      } else if (diffDays < 7) {
        setRelativeTime(`${diffDays} days ago`);
      } else {
        // For older dates, show the actual date
        setRelativeTime(date.toLocaleDateString());
      }
    };

    updateRelativeTime();
    // Update every minute for recent saves, less frequently for older ones
    const interval = setInterval(updateRelativeTime, 60000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <span className={`text-sm text-gray-500 ${className}`}>
      Last saved: {relativeTime}
    </span>
  );
}