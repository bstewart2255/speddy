"use client";

import { useEffect, useRef } from "react";
import { createClient } from '@/lib/supabase/client';

interface SessionAssignmentPopupProps {
  session: any;
  student: any;
  position: { x: number; y: number };
  seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }>;
  sessionTags: Record<string, string>;
  setSessionTags: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void;
  onUpdate: () => void;
}

export function SessionAssignmentPopup({
  session,
  student,
  position,
  seaProfiles,
  sessionTags,
  setSessionTags,
  onClose,
  onUpdate,
}: SessionAssignmentPopupProps) {
  const supabase = createClient();
  const popupRef = useRef<HTMLDivElement>(null);

  // Format time for display (12-hour format)
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Auto-save when assignment changes
  const handleAssignmentChange = async (newSeaId: string) => {
    // Skip if value hasn't changed
    if (newSeaId === (session.assigned_to_sea_id || "")) {
      return;
    }

    try {
      const updateData: any = {
        delivered_by: newSeaId ? "sea" : "provider",
      };

      // Set or clear the assigned_to_sea_id
      if (newSeaId) {
        updateData.assigned_to_sea_id = newSeaId;
      } else {
        updateData.assigned_to_sea_id = null;
      }

      const { error } = await supabase
        .from("schedule_sessions")
        .update(updateData)
        .eq("id", session.id);

      if (error) {
        // Check if it's a permission error
        if (error.message?.includes('can_assign_sea_to_session') || 
            error.message?.includes('policy')) {
          throw new Error('You do not have permission to assign sessions to this SEA. They may need to be shared at your school first.');
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
        left: position.x, 
        top: position.y,
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
          value={session.assigned_to_sea_id || ""}
          onChange={(e) => handleAssignmentChange(e.target.value)}
          className="w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Me (Resource Specialist)</option>
          {seaProfiles.map((sea) => (
            <option key={sea.id} value={sea.id}>
              {sea.full_name} ({sea.is_shared ? 'Shared SEA' : 'My SEA'})
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">TAG</p>
        <input
          type="text"
          value={sessionTags[session.id] || ''}
          onChange={(e) => {
            setSessionTags(prev => ({
              ...prev,
              [session.id]: e.target.value
            }));
          }}
          placeholder="Add tag..."
          className="w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}