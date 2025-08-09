'use client';

import { useState, useCallback } from 'react';
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

      // First attempt update without forcing (to check for conflicts)
      let result = await sessionUpdateService.updateSessionTime(
        session.id,
        targetDay,
        newStartTimeWithSeconds,
        newEndTime,
        false // Don't force update yet
      );

      // If there are conflicts, ask for confirmation
      if (result.requiresConfirmation && result.conflicts) {
        const conflictMessages = result.conflicts.map(c => `- ${c.description}`).join('\n');
        const confirmMessage = `Warning: This placement has conflicts:\n\n${conflictMessages}\n\nDo you want to proceed anyway?`;
        
        if (confirm(confirmMessage)) {
          // User confirmed, force the update
          result = await sessionUpdateService.updateSessionTime(
            session.id,
            targetDay,
            newStartTimeWithSeconds,
            newEndTime,
            true // Force update after confirmation
          );
        } else {
          // User cancelled, return without updating
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
        return false;
      }

      return true;
    } catch (error) {
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
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }, [supabase]);

  // Simplified drag validation - no longer needed with pre-calculated conflicts
  const validateDragOver = useCallback(() => {
    // This function is kept for compatibility but no longer performs validation
    // Conflicts are now pre-calculated when drag starts
  }, []);

  // Cleanup function for compatibility
  const clearDragValidation = useCallback(() => {
    // No cleanup needed anymore
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