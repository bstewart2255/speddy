'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface ActivityConfig {
  timeout: number; // in milliseconds
  warningTime: number; // in milliseconds before timeout
  onActivity: () => void;
  onWarning: () => void;
  onTimeout: () => void;
  throttleInterval?: number; // minimum time between activity updates
}

export interface KeepAliveOptions {
  activityType?: string;
  skipThrottle?: boolean;
}

export function useActivityTracker({
  timeout,
  warningTime,
  onActivity,
  onWarning,
  onTimeout,
  throttleInterval = 30000, // 30 seconds default throttle
}: ActivityConfig) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottledUpdate = useRef<number>(0);
  const isWarningShownRef = useRef<boolean>(false);

  // Update activity timestamp across tabs
  const updateActivity = useCallback((options: KeepAliveOptions = {}) => {
    const now = Date.now();
    const { skipThrottle = false } = options;
    
    // Apply throttling unless explicitly skipped
    if (!skipThrottle && now - lastThrottledUpdate.current < throttleInterval) {
      return;
    }
    
    lastActivityRef.current = now;
    lastThrottledUpdate.current = now;
    localStorage.setItem('lastActivity', now.toString());
    
    // Clear any existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    
    // Reset warning state
    isWarningShownRef.current = false;
    
    // Set new warning timer
    warningRef.current = setTimeout(() => {
      if (!isWarningShownRef.current) {
        isWarningShownRef.current = true;
        onWarning();
      }
    }, timeout - warningTime);
    
    // Set new timeout timer
    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeout);

    onActivity();
  }, [timeout, warningTime, onActivity, onWarning, onTimeout, throttleInterval]);

  // Check if activity happened in another tab
  const checkCrossTabActivity = useCallback(() => {
    const stored = localStorage.getItem('lastActivity');
    if (stored) {
      const storedTime = parseInt(stored, 10);
      if (storedTime > lastActivityRef.current) {
        lastActivityRef.current = storedTime;
        updateActivity();
      }
    }
  }, [updateActivity]);

  // Activity event handlers
  const handleActivity = useCallback((event: Event) => {
    // Ignore certain events that shouldn't reset the timer
    if (event.target instanceof HTMLElement) {
      const tagName = event.target.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style') {
        return;
      }
    }
    
    updateActivity();
  }, [updateActivity]);

  useEffect(() => {
    // Activity events to monitor
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'keydown',
      'keyup',
      'scroll',
      'touchstart',
      'click',
      'focus',
    ];

    // Add event listeners for activity detection
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Listen for storage changes (cross-tab communication)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'lastActivity') {
        checkCrossTabActivity();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);

    // Listen for BroadcastChannel messages for more reliable cross-tab sync
    const channel = new BroadcastChannel('user-activity');
    const handleChannelMessage = (event: MessageEvent) => {
      if (event.data.type === 'activity') {
        updateActivity();
      }
    };
    
    channel.addEventListener('message', handleChannelMessage);

    // Initialize activity
    updateActivity();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      
      window.removeEventListener('storage', handleStorageChange);
      channel.removeEventListener('message', handleChannelMessage);
      channel.close();
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [handleActivity, checkCrossTabActivity, updateActivity]);

  // Method to manually extend session
  const extendSession = useCallback((options: KeepAliveOptions = {}) => {
    updateActivity({ ...options, skipThrottle: true });
    
    // Broadcast to other tabs
    const channel = new BroadcastChannel('user-activity');
    channel.postMessage({ 
      type: 'activity', 
      timestamp: Date.now(),
      activityType: options.activityType 
    });
    channel.close();
  }, [updateActivity]);

  // Keep-alive method for long-running operations
  const keepAlive = useCallback((activityType: string) => {
    extendSession({ activityType, skipThrottle: true });
  }, [extendSession]);

  // Method to get remaining time
  const getRemainingTime = useCallback(() => {
    const elapsed = Date.now() - lastActivityRef.current;
    const remaining = timeout - elapsed;
    return Math.max(0, remaining);
  }, [timeout]);

  return {
    extendSession,
    keepAlive,
    getRemainingTime,
    isWarningShown: () => isWarningShownRef.current,
  };
}