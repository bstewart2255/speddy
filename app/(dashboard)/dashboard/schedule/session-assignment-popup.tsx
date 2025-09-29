"use client";

import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { createClient } from '@/lib/supabase/client';
import { calculateOptimalModalPosition, getSessionModalDimensions, type ModalPosition } from '@/lib/utils/modal-positioning';
import type { Database, ScheduleSession, Student } from '@/src/types/database';

type ScheduleSessionUpdate = Database['public']['Tables']['schedule_sessions']['Update'];

interface SessionAssignmentPopupProps {
  session: ScheduleSession;
  student?: Student;
  triggerRect: DOMRect;
  seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }>;
  otherSpecialists: Array<{ id: string; full_name: string; role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' }>;
  sessionTags: Record<string, string>;
  setSessionTags: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void;
  onUpdate: () => void;
}

export function SessionAssignmentPopup({
  session,
  student,
  triggerRect,
  seaProfiles,
  otherSpecialists,
  sessionTags,
  setSessionTags,
  onClose,
  onUpdate,
}: SessionAssignmentPopupProps) {
  const supabase = createClient();
  const popupRef = useRef<HTMLDivElement>(null);
  const [calculatedPosition, setCalculatedPosition] = useState<ModalPosition>({ x: 0, y: 0 });
  
  // Calculate optimal position when component mounts or trigger rect changes
  useLayoutEffect(() => {
    const modalDimensions = getSessionModalDimensions();
    const optimalPosition = calculateOptimalModalPosition(triggerRect, modalDimensions);
    setCalculatedPosition(optimalPosition);
  }, [triggerRect]);

  // Log session info when popup opens
  useEffect(() => {
    console.log('[SessionPopup] Opened for session:', {
      sessionId: session.id,
      studentId: session.student_id,
      currentTag: sessionTags[session.id] || '(no tag)',
      allTags: sessionTags
    });
  }, [session.id, session.student_id, sessionTags]);

  // Format time for display (12-hour format)
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Auto-save when assignment changes
  const handleAssignmentChange = async (value: string) => {
    // Parse the value to determine assignment type
    const isSeaAssignment = value.startsWith('sea:');
    const isSpecialistAssignment = value.startsWith('specialist:');
    const assignmentId = isSeaAssignment || isSpecialistAssignment ? value.split(':')[1] : '';

    // Skip if value hasn't changed
    const currentAssignment = session.assigned_to_sea_id 
      ? `sea:${session.assigned_to_sea_id}`
      : session.assigned_to_specialist_id 
      ? `specialist:${session.assigned_to_specialist_id}`
      : '';
    
    if (value === currentAssignment) {
      return;
    }

    try {
      const updateData: ScheduleSessionUpdate = {};

      if (isSeaAssignment) {
        // Validate assignment ID
        if (!assignmentId) {
          alert('Invalid SEA selection.');
          return;
        }
        // Assigning to SEA
        updateData.delivered_by = 'sea';
        updateData.assigned_to_sea_id = assignmentId;
        updateData.assigned_to_specialist_id = null; // Clear specialist assignment
      } else if (isSpecialistAssignment) {
        // Validate assignment ID
        if (!assignmentId) {
          alert('Invalid specialist selection.');
          return;
        }
        // Assigning to another specialist
        updateData.delivered_by = 'specialist';
        updateData.assigned_to_specialist_id = assignmentId;
        updateData.assigned_to_sea_id = null; // Clear SEA assignment
      } else {
        // Assigning back to provider (self)
        updateData.delivered_by = 'provider';
        updateData.assigned_to_sea_id = null;
        updateData.assigned_to_specialist_id = null;
      }

      const { error } = await supabase
        .from("schedule_sessions")
        .update(updateData)
        .eq("id", session.id);

      if (error) {
        // Check if it's a permission error and provide specific message
        if (error.message?.includes('can_assign_sea_to_session')) {
          throw new Error('You do not have permission to assign sessions to this SEA. They may need to be shared at your school first.');
        } else if (error.message?.includes('can_assign_specialist_to_session')) {
          throw new Error('You do not have permission to assign sessions to this specialist. Only Resource Specialists can assign to other specialists at the same school.');
        } else if (error.message?.includes('policy')) {
          throw new Error('You do not have permission to make this assignment.');
        }
        throw error;
      }

      onUpdate();
      // Close popup after successful save
      setTimeout(() => onClose(), 100);
    } catch (error) {
      console.error("Error updating session:", error);
      alert(error instanceof Error ? error.message : "Failed to update session assignment");
    }
  };

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add delay to prevent immediate closing from the click that opened the popup
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div 
      ref={popupRef}
      id="session-assignment-popup"
      className="fixed bg-white rounded-lg shadow-lg border p-4 z-50 min-w-64"
      style={{ 
        left: calculatedPosition.x, 
        top: calculatedPosition.y,
        maxWidth: '300px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3">
        <h3 className="font-medium text-gray-900">Session Assignment</h3>
        <p className="text-sm text-gray-600">
          {student?.initials} - {formatTime(session.start_time.substring(0, 5))} to{" "}
          {formatTime(session.end_time.substring(0, 5))}
        </p>
      </div>

      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 mb-2">ASSIGN TO</p>
        <select
          value={
            session.assigned_to_sea_id 
              ? `sea:${session.assigned_to_sea_id}`
              : session.assigned_to_specialist_id 
              ? `specialist:${session.assigned_to_specialist_id}`
              : ''
          }
          onChange={(e) => handleAssignmentChange(e.target.value)}
          className="w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Me (Resource Specialist)</option>
          
          {/* SEAs Group */}
          {seaProfiles.length > 0 && (
            <optgroup label="Special Education Assistants">
              {seaProfiles.map((sea) => (
                <option key={`sea:${sea.id}`} value={`sea:${sea.id}`}>
                  {sea.full_name} ({sea.is_shared ? 'Shared SEA' : 'My SEA'})
                </option>
              ))}
            </optgroup>
          )}
          
          {/* Other Specialists Group */}
          {otherSpecialists.length > 0 && (
            <optgroup label="Other Specialists">
              {otherSpecialists.map((specialist) => {
                // Format role display
                const roleDisplay = {
                  'resource': 'Resource',
                  'speech': 'Speech',
                  'ot': 'OT',
                  'counseling': 'Counseling',
                  'specialist': 'Specialist'
                }[specialist.role] || specialist.role;
                
                return (
                  <option key={`specialist:${specialist.id}`} value={`specialist:${specialist.id}`}>
                    {specialist.full_name} ({roleDisplay})
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">TAG</p>
        <input
          type="text"
          value={sessionTags[session.id] || ''}
          onChange={(e) => {
            console.log('[SessionPopup] Setting tag for session:', {
              sessionId: session.id,
              newValue: e.target.value,
              currentTags: sessionTags
            });
            setSessionTags(prev => {
              const newTags = {
                ...prev,
                [session.id]: e.target.value
              };
              console.log('[SessionPopup] Updated tags state:', newTags);
              return newTags;
            });
          }}
          placeholder="Add tag..."
          className="w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}