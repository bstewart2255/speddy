import { SupabaseClient } from '@supabase/supabase-js';
import { SchedulingDataManager } from '../scheduling/scheduling-data-manager';
import { sessionUpdateService } from './session-update-service';

interface TimeSlot {
  day: number;
  startTime: string;
  endTime: string;
}

interface Student {
  id: string;
  session_duration?: number;
}

interface PlacementResult {
  sessionId?: string;
  studentId: string;
  status: 'success' | 'failed';
  conflicts?: any[];
  error?: string;
  timeSlot?: TimeSlot;
}

interface ManualPlacementOptions {
  ignoreConflicts?: boolean;
  preferEarliestSlot?: boolean;
  maxConflictsPerSession?: number;
}

export class ManualPlacementService {
  constructor(
    private supabase: SupabaseClient,
    private dataManager: SchedulingDataManager
  ) {}

  async findAvailableSlots(
    studentIds: string[],
    providerId: string,
    options: ManualPlacementOptions = {}
  ): Promise<TimeSlot[]> {
    const availableSlots: TimeSlot[] = [];
    
    if (studentIds.length === 0) {
      return [];
    }

    // Get data from supabase directly since DataManager doesn't expose these methods
    const { data: students } = await this.supabase
      .from('students')
      .select('*')
      .in('id', studentIds);
    
    if (!students || students.length === 0) {
      return [];
    }

    const existingSessions = this.dataManager.getExistingSessions();
    
    // Generate time slots for each day (Monday to Friday, 8am to 3pm)
    const days = [1, 2, 3, 4, 5];
    const sessionDuration = students[0].minutes_per_session || 30;
    
    for (const day of days) {
      // Generate slots every 30 minutes from 8am to 2:30pm
      for (let hour = 8; hour <= 14; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          if (hour === 14 && minute > 30) break; // Don't go past 2:30pm
          
          const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          const endHour = Math.floor((hour * 60 + minute + sessionDuration) / 60);
          const endMinute = (hour * 60 + minute + sessionDuration) % 60;
          const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
          
          const slot: TimeSlot = {
            day,
            startTime,
            endTime
          };
          
          if (options.ignoreConflicts) {
            availableSlots.push(slot);
          } else {
            const conflicts = this.detectConflicts(slot, existingSessions, providerId);
            if (conflicts.length === 0) {
              availableSlots.push(slot);
            }
          }
          
          if (options.preferEarliestSlot && availableSlots.length >= studentIds.length) {
            return availableSlots;
          }
        }
      }
    }

    return availableSlots;
  }

  async placeSessionsWithConflicts(
    studentIds: string[],
    providerId: string,
    options: ManualPlacementOptions = { ignoreConflicts: true }
  ): Promise<PlacementResult[]> {
    const results: PlacementResult[] = [];
    const availableSlots = await this.findAvailableSlots(studentIds, providerId, options);
    
    if (availableSlots.length === 0) {
      return studentIds.map(id => ({
        studentId: id,
        status: 'failed' as const,
        error: 'No available time slots found'
      }));
    }

    let slotIndex = 0;
    for (const studentId of studentIds) {
      if (slotIndex >= availableSlots.length) {
        results.push({
          studentId,
          status: 'failed',
          error: 'Insufficient time slots available'
        });
        continue;
      }

      const slot = availableSlots[slotIndex];
      const placementResult = await this.placeSession(studentId, providerId, slot, options);
      results.push(placementResult);
      
      if (placementResult.status === 'success') {
        slotIndex++;
      }
    }

    return results;
  }

  async validateManualPlacement(
    studentId: string,
    providerId: string,
    timeSlot: TimeSlot
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // For now, do basic validation
    // Check if time is within reasonable school hours (8am - 3pm)
    const [startHour] = timeSlot.startTime.split(':').map(Number);
    const [endHour, endMinute] = timeSlot.endTime.split(':').map(Number);
    const endTotalMinutes = endHour * 60 + endMinute;
    
    if (startHour < 8 || endTotalMinutes > 15 * 60) {
      errors.push('Session falls outside school hours (8am - 3pm)');
    }
    
    // Check if day is a weekday
    if (timeSlot.day < 1 || timeSlot.day > 5) {
      errors.push('Session must be on a weekday');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private detectConflicts(
    slot: TimeSlot,
    existingSessions: any[],
    providerId: string
  ): any[] {
    return existingSessions.filter(session => {
      if (session.provider_id !== providerId) return false;
      if (session.day_of_week !== slot.day) return false;
      
      const sessionStart = new Date(`2000-01-01T${session.start_time}`);
      const sessionEnd = new Date(`2000-01-01T${session.end_time}`);
      const slotStart = new Date(`2000-01-01T${slot.startTime}`);
      const slotEnd = new Date(`2000-01-01T${slot.endTime}`);
      
      return (
        (slotStart >= sessionStart && slotStart < sessionEnd) ||
        (slotEnd > sessionStart && slotEnd <= sessionEnd) ||
        (slotStart <= sessionStart && slotEnd >= sessionEnd)
      );
    });
  }

  private async placeSession(
    studentId: string,
    providerId: string,
    timeSlot: TimeSlot,
    options: ManualPlacementOptions
  ): Promise<PlacementResult> {
    try {
      const validation = await this.validateManualPlacement(studentId, providerId, timeSlot);
      
      if (!validation.valid && !options.ignoreConflicts) {
        return {
          studentId,
          status: 'failed',
          error: validation.errors.join(', ')
        };
      }

      const { data, error } = await this.supabase
        .from('schedule_sessions')
        .insert({
          student_id: studentId,
          provider_id: providerId,
          day_of_week: timeSlot.day,
          start_time: timeSlot.startTime,
          end_time: timeSlot.endTime,
          service_type: 'provider',
          delivered_by: 'provider',
          manually_placed: true,
          group_id: null,
          group_name: null
        })
        .select()
        .single();

      if (error) {
        return {
          studentId,
          status: 'failed',
          error: error.message
        };
      }

      const existingSessions = this.dataManager.getExistingSessions();
      const conflicts = this.detectConflicts(timeSlot, existingSessions, providerId);

      return {
        sessionId: data.id,
        studentId,
        status: 'success',
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        timeSlot
      };
    } catch (error) {
      return {
        studentId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}