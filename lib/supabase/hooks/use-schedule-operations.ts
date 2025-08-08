'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sessionUpdateService } from '../../services/session-update-service';
import type { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type Student = Database['public']['Tables']['students']['Row'];

interface DragOperationResult {
  success: boolean;
  hasConflicts?: boolean;
  conflicts?: Array<{ type: string; description: string }>;
  error?: string;
}

export function useScheduleOperations() {
  const supabase = createClient<Database>();
  const [isUpdating, setIsUpdating] = useState(false);
  const conflictCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Validate session move
  const validateSessionMove = useCallback(async (
    session: ScheduleSession,
    targetDay: number,
    targetStartTime: string,
    targetEndTime: string,
    studentMinutes: number
  ) => {
    try {
      const validation = await sessionUpdateService.validateSessionMove({
        session: session as any,
        targetDay,
        targetStartTime,
        targetEndTime,
        studentMinutes,
      });
      
      return validation;
    } catch (error) {
      console.error('Error validating session move:', error);
      return { valid: false, conflicts: [] };
    }
  }, []);

  // Handle session drop with validation
  const handleSessionDrop = useCallback(async (
    session: ScheduleSession,
    targetDay: number,
    targetTime: string,
    student: Student
  ): Promise<DragOperationResult> => {
    setIsUpdating(true);
    
    try {
      // Calculate end time
      const [hours, minutes] = targetTime.split(':').map(Number);
      const endDate = new Date();
      endDate.setHours(hours, minutes + student.minutes_per_session, 0);
      const newEndTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}:00`;
      const newStartTimeWithSeconds = `${targetTime}:00`;

      // Update session time with comprehensive validation
      const result = await sessionUpdateService.updateSessionTime(
        session.id,
        targetDay,
        newStartTimeWithSeconds,
        newEndTime
      );

      // Handle conflicts
      if (result.hasConflicts && result.conflicts) {
        const conflictMessages = result.conflicts.map(c => `- ${c.description}`).join('\n');
        const confirmMessage = `Warning: This placement has conflicts:\n\n${conflictMessages}\n\nDo you want to proceed anyway?`;
        
        if (!confirm(confirmMessage)) {
          // Revert the change
          await sessionUpdateService.updateSessionTime(
            session.id,
            session.day_of_week,
            session.start_time,
            session.end_time
          );
          return {
            success: false,
            hasConflicts: true,
            conflicts: result.conflicts,
          };
        }
      }

      return {
        success: result.success,
        hasConflicts: result.hasConflicts,
        conflicts: result.conflicts,
        error: result.error,
      };
    } catch (error) {
      console.error('Error handling session drop:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update session',
      };
    } finally {
      setIsUpdating(false);
    }
  }, []);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!confirm('Are you sure you want to remove this session?')) {
      return false;
    }

    try {
      const { error } = await supabase
        .from('schedule_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) {
        alert('Failed to delete session: ' + error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Failed to delete session');
      return false;
    }
  }, [supabase]);

  // Update session assignment (provider vs SEA)
  const updateSessionAssignment = useCallback(async (
    sessionId: string,
    assignToSeaId: string | null
  ): Promise<boolean> => {
    try {
      const updateData: any = {
        delivered_by: assignToSeaId ? 'sea' : 'provider',
        assigned_to_sea_id: assignToSeaId,
      };

      const { error } = await supabase
        .from('schedule_sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error) {
        console.error('Error updating session assignment:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating session assignment:', error);
      return false;
    }
  }, [supabase]);

  // Batch update sessions
  const batchUpdateSessions = useCallback(async (
    updates: Array<{ id: string; changes: Partial<ScheduleSession> }>
  ): Promise<boolean> => {
    try {
      const promises = updates.map(({ id, changes }) =>
        supabase
          .from('schedule_sessions')
          .update(changes)
          .eq('id', id)
      );

      const results = await Promise.all(promises);
      const hasErrors = results.some(r => r.error);

      if (hasErrors) {
        console.error('Some session updates failed:', results.filter(r => r.error));
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in batch update:', error);
      return false;
    }
  }, [supabase]);

  // Validate drag over with debouncing
  const validateDragOver = useCallback((
    session: ScheduleSession,
    targetDay: number,
    targetTime: string,
    student: Student,
    onConflictDetected: (hasConflict: boolean, conflictKey: string) => void
  ) => {
    const conflictKey = `${targetDay}-${targetTime}`;
    
    // Cancel any pending validation
    if (conflictCheckTimeoutRef.current) {
      clearTimeout(conflictCheckTimeoutRef.current);
    }
    
    // Debounce the validation
    conflictCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const [hours, minutes] = targetTime.split(':');
        const startTimeStr = `${hours}:${minutes}:00`;
        const endTime = new Date();
        endTime.setHours(parseInt(hours), parseInt(minutes) + student.minutes_per_session, 0);
        const endTimeStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}:00`;
        
        const validation = await sessionUpdateService.validateSessionMove({
          session: session as any,
          targetDay,
          targetStartTime: startTimeStr,
          targetEndTime: endTimeStr,
          studentMinutes: student.minutes_per_session,
        });
        
        onConflictDetected(!validation.valid, conflictKey);
      } catch (error) {
        console.error('Error during drag validation:', error);
        onConflictDetected(false, conflictKey);
      }
    }, 150); // 150ms debounce
  }, []);

  // Cleanup function for drag validation
  const clearDragValidation = useCallback(() => {
    if (conflictCheckTimeoutRef.current) {
      clearTimeout(conflictCheckTimeoutRef.current);
      conflictCheckTimeoutRef.current = null;
    }
  }, []);

  return {
    isUpdating,
    validateSessionMove,
    handleSessionDrop,
    deleteSession,
    updateSessionAssignment,
    batchUpdateSessions,
    validateDragOver,
    clearDragValidation,
  };
}