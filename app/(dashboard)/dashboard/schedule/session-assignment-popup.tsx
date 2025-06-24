"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface SessionAssignmentPopupProps {
  session: any;
  student: any;
  position: { x: number; y: number };
  seaProfiles: Array<{ id: string; full_name: string }>;
  onClose: () => void;
  onUpdate: () => void;
}

export function SessionAssignmentPopup({
  session,
  student,
  position,
  seaProfiles,
  onClose,
  onUpdate,
}: SessionAssignmentPopupProps) {
  const [loading, setLoading] = useState(false);
  const [selectedSeaId, setSelectedSeaId] = useState<string>(
    session.assigned_to_sea_id || "",
  );
  const supabase = createClientComponentClient();

  // Format time for display (12-hour format)
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleAssignmentChange = async () => {
    setLoading(true);
    try {
      const updateData: any = {
        delivered_by: selectedSeaId ? "sea" : "provider",
      };

      // Set or clear the assigned_to_sea_id
      if (selectedSeaId) {
        updateData.assigned_to_sea_id = selectedSeaId;
      } else {
        updateData.assigned_to_sea_id = null;
      }

      const { error } = await supabase
        .from("schedule_sessions")
        .update(updateData)
        .eq("id", session.id);

      if (error) throw error;

      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating session:", error);
      alert("Failed to update session assignment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
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
          value={selectedSeaId}
          onChange={(e) => setSelectedSeaId(e.target.value)}
          className="w-full p-2 border rounded-md text-sm"
          disabled={loading}
        >
          <option value="">Me (Resource Specialist)</option>
          {seaProfiles.map((sea) => (
            <option key={sea.id} value={sea.id}>
              {sea.full_name} (SEA)
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          onClick={handleAssignmentChange}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={
            loading || selectedSeaId === (session.assigned_to_sea_id || "")
          }
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
