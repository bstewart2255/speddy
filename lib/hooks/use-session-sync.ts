import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScheduleSession } from '@/src/types/database';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface OptimisticUpdate {
  sessionId: string;
  originalData: ScheduleSession;
  changes: Partial<ScheduleSession>;
  timestamp: number;
  rollbackTimer?: NodeJS.Timeout;
}

interface SessionUpdate {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  session: ScheduleSession;
  timestamp: number;
}

interface UseSessionSyncOptions {
  sessions: ScheduleSession[];
  setSessions: React.Dispatch<React.SetStateAction<ScheduleSession[]>>;
  providerId?: string;
  onConflict?: (localSession: ScheduleSession, remoteSession: ScheduleSession) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface UseSessionSyncReturn {
  isConnected: boolean;
  lastSync: Date | null;
  optimisticUpdate: (sessionId: string, changes: Partial<ScheduleSession>) => void;
  forceRefresh: () => Promise<void>;
}

export function useSessionSync({
  sessions,
  setSessions,
  providerId,
  onConflict,
  showToast
}: UseSessionSyncOptions): UseSessionSyncReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const optimisticUpdatesRef = useRef<Map<string, OptimisticUpdate>>(new Map());
  const pendingUpdatesRef = useRef<SessionUpdate[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const supabase = createClient();

  // Track our own updates to prevent duplicate processing
  const localUpdateIdsRef = useRef<Set<string>>(new Set());

  // Generate unique ID for local updates
  const generateUpdateId = (sessionId: string, timestamp: number) => {
    // Use just the session ID for tracking to ensure proper matching
    return sessionId;
  };

  // Batch update processor
  const processPendingUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.length === 0) return;

    const updates = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];

    setSessions((currentSessions) => {
      let updatedSessions = [...currentSessions];

      updates.forEach(({ type, session }) => {
        switch (type) {
          case 'INSERT':
            // Check if session already exists
            if (!updatedSessions.find(s => s.id === session.id)) {
              updatedSessions.push(session);
            }
            break;

          case 'UPDATE':
            const updateIndex = updatedSessions.findIndex(s => s.id === session.id);
            if (updateIndex !== -1) {
              const localSession = updatedSessions[updateIndex];
              const optimisticUpdate = optimisticUpdatesRef.current.get(session.id);

              // Check if this update matches our optimistic update
              if (optimisticUpdate) {
                console.log('Comparing optimistic update with real-time update:', {
                  sessionId: session.id,
                  optimistic: {
                    start_time: localSession.start_time,
                    end_time: localSession.end_time,
                    day_of_week: localSession.day_of_week
                  },
                  realtime: {
                    start_time: session.start_time,
                    end_time: session.end_time,
                    day_of_week: session.day_of_week
                  }
                });
              }

              // Apply update (last-write-wins)
              updatedSessions[updateIndex] = session;
              
              // Clear optimistic update for this session
              if (optimisticUpdatesRef.current.has(session.id)) {
                console.log('Clearing optimistic update for session:', session.id);
                const update = optimisticUpdatesRef.current.get(session.id);
                if (update?.rollbackTimer) {
                  clearTimeout(update.rollbackTimer);
                }
                optimisticUpdatesRef.current.delete(session.id);
              }
            }
            break;

          case 'DELETE':
            updatedSessions = updatedSessions.filter(s => s.id !== session.id);
            optimisticUpdatesRef.current.delete(session.id);
            break;
        }
      });

      return updatedSessions;
    });

    setLastSync(new Date());
  }, [setSessions, onConflict]);

  // Schedule batch update
  const scheduleBatchUpdate = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }

    batchTimerRef.current = setTimeout(() => {
      processPendingUpdates();
      batchTimerRef.current = null;
    }, 100); // 100ms batch window
  }, [processPendingUpdates]);

  // Handle real-time changes
  const handleRealtimeChange = useCallback((
    payload: RealtimePostgresChangesPayload<ScheduleSession>
  ) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    console.log('Realtime event received:', eventType, {
      newId: newRecord?.id,
      oldId: oldRecord?.id,
      providerId: newRecord?.provider_id || oldRecord?.provider_id
    });

    // Check if this is an update to a session we have an optimistic update for
    const sessionId = newRecord?.id || oldRecord?.id || '';
    
    // Skip if this is our own update (within a short time window)
    if (localUpdateIdsRef.current.has(sessionId)) {
      console.log('Skipping our own update for session:', sessionId);
      return;
    }

    // Only process sessions for the current provider if specified
    if (providerId && newRecord?.provider_id !== providerId && oldRecord?.provider_id !== providerId) {
      return;
    }

    let update: SessionUpdate | null = null;

    switch (eventType) {
      case 'INSERT':
        if (newRecord) {
          update = { type: 'INSERT', session: newRecord, timestamp: Date.now() };
        }
        break;

      case 'UPDATE':
        if (newRecord) {
          update = { type: 'UPDATE', session: newRecord, timestamp: Date.now() };
        }
        break;

      case 'DELETE':
        if (oldRecord) {
          update = { type: 'DELETE', session: oldRecord as ScheduleSession, timestamp: Date.now() };
        }
        break;
    }

    if (update) {
      pendingUpdatesRef.current.push(update);
      scheduleBatchUpdate();
    }
  }, [providerId, scheduleBatchUpdate]);

  // Optimistic update function
  const optimisticUpdate = useCallback((sessionId: string, changes: Partial<ScheduleSession>) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    console.log('Applying optimistic update for session:', sessionId, changes);

    // Clear any existing rollback timer for this session
    const existingUpdate = optimisticUpdatesRef.current.get(sessionId);
    if (existingUpdate?.rollbackTimer) {
      clearTimeout(existingUpdate.rollbackTimer);
    }
    
    // Set up rollback timer
    const rollbackTimer = setTimeout(() => {
      if (optimisticUpdatesRef.current.has(sessionId)) {
        console.log('Auto-rollback optimistic update for session:', sessionId);
        setSessions(current => 
          current.map(s => 
            s.id === sessionId ? session : s
          )
        );
        optimisticUpdatesRef.current.delete(sessionId);
      }
    }, 30000); // 30 seconds
    
    // Store original data for rollback
    optimisticUpdatesRef.current.set(sessionId, {
      sessionId,
      originalData: { ...session },
      changes,
      timestamp: Date.now(),
      rollbackTimer
    });

    // Track this update to prevent duplicate processing
    localUpdateIdsRef.current.add(sessionId);

    // Apply optimistic update immediately
    setSessions(current => 
      current.map(s => 
        s.id === sessionId 
          ? { ...s, ...changes, updated_at: new Date().toISOString() }
          : s
      )
    );

    // Clean up tracking ID after a delay
    setTimeout(() => {
      localUpdateIdsRef.current.delete(sessionId);
    }, 5000);
  }, [sessions, setSessions]);

  // Force refresh function
  const forceRefresh = useCallback(async () => {
    if (!providerId) return;

    try {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', providerId)
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;

      if (data) {
        setSessions(data);
        setLastSync(new Date());
        
        // Clear any pending optimistic updates
        optimisticUpdatesRef.current.clear();
        
        // showToast?.('Sessions refreshed', 'success');
      }
    } catch (error) {
      console.error('Failed to refresh sessions:', error);
      // showToast?.('Failed to refresh sessions', 'error');
    }
  }, [providerId, setSessions, supabase]);

  // Setup real-time subscription
  useEffect(() => {
    if (!providerId) return;

    let isSubscribing = false;
    let isCancelled = false;

    const setupSubscription = async () => {
      // Prevent multiple simultaneous subscription attempts
      if (isSubscribing) return;
      isSubscribing = true;

      try {
        // Clean up existing channel
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        // Check if cancelled during cleanup
        if (isCancelled) return;

        // Create new channel
        const channel = supabase
          .channel(`session-sync-${providerId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'schedule_sessions',
              filter: `provider_id=eq.${providerId}`
            },
            handleRealtimeChange
          )
          .on('system', { event: 'connect' }, () => {
            setIsConnected(true);
            retryCountRef.current = 0;
            // Only show toast on first connection, not reconnections
            if (!channelRef.current) {
              // showToast?.('Real-time sync connected', 'success');
            }
          })
          .on('system', { event: 'disconnect' }, () => {
            setIsConnected(false);
            // Don't show disconnect toast to avoid spam
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
              channelRef.current = channel;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setIsConnected(false);
              
              // Retry logic
              if (retryCountRef.current < maxRetries && !isCancelled) {
                retryCountRef.current++;
                const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000);
                
                // showToast?.(`Connection failed. Retrying in ${retryDelay / 1000}s...`, 'error');
                
                setTimeout(() => {
                  if (!isCancelled) {
                    isSubscribing = false;
                    setupSubscription();
                  }
                }, retryDelay);
              } else if (!isCancelled) {
                // showToast?.('Failed to establish real-time connection. Please refresh the page.', 'error');
              }
            }
          });

      } catch (error) {
        console.error('Failed to setup subscription:', error);
        setIsConnected(false);
      } finally {
        isSubscribing = false;
      }
    };

    setupSubscription();

    // Cleanup
    return () => {
      isCancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, [providerId, handleRealtimeChange, supabase]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Clear all rollback timers
      optimisticUpdatesRef.current.forEach((update) => {
        if (update.rollbackTimer) {
          clearTimeout(update.rollbackTimer);
        }
      });
    };
  }, []);

  return {
    isConnected,
    lastSync,
    optimisticUpdate,
    forceRefresh
  };
}