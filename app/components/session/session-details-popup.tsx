'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScheduleSession } from '@/src/types/database';
import { format } from 'date-fns';

interface SessionDetailsPopupProps {
  session: ScheduleSession & {
    session_date?: string;
  };
  student: {
    initials: string;
    grade_level: string;
    id: string;
    teacher_name?: string;
  };
  assignedTo?: {
    full_name: string;
    role: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function SessionDetailsPopup({
  session,
  student,
  assignedTo,
  isOpen,
  onClose,
  onUpdate
}: SessionDetailsPopupProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    is_completed: session.is_completed || false,
    student_absent: session.student_absent || false,
    outside_schedule_conflict: session.outside_schedule_conflict || false,
    session_notes: session.session_notes || ''
  });

  useEffect(() => {
    setFormData({
      is_completed: session.is_completed || false,
      student_absent: session.student_absent || false,
      outside_schedule_conflict: session.outside_schedule_conflict || false,
      session_notes: session.session_notes || ''
    });
  }, [session]);

  const handleSave = async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      const updateData: any = {
        ...formData,
        updated_at: new Date().toISOString()
      };

      // If marking as completed, set completed_at and completed_by
      if (formData.is_completed && !session.is_completed) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          updateData.completed_at = new Date().toISOString();
          updateData.completed_by = user.id;
        }
      } else if (!formData.is_completed && session.is_completed) {
        // If unchecking completed, clear the timestamps
        updateData.completed_at = null;
        updateData.completed_by = null;
      }

      const { error } = await supabase
        .from('schedule_sessions')
        .update(updateData)
        .eq('id', session.id);

      if (error) throw error;

      if (onUpdate) {
        onUpdate();
      }
      onClose();
    } catch (error) {
      console.error('Error updating session details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Format session date if available
  const sessionDate = session.session_date 
    ? format(new Date(session.session_date), 'EEEE, MMMM d, yyyy')
    : 'Today';

  // Format times
  const startTime = session.start_time ? 
    format(new Date(`2000-01-01T${session.start_time}`), 'h:mm a') : '';
  const endTime = session.end_time ? 
    format(new Date(`2000-01-01T${session.end_time}`), 'h:mm a') : '';

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Popup */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">Session Details</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {student.initials} - {session.service_type}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Session Information */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Date:</span>
                <span className="font-medium">{sessionDate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Time:</span>
                <span className="font-medium">{startTime} - {endTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Student:</span>
                <span className="font-medium">{student.initials} (Grade {student.grade_level})</span>
              </div>
              {student.teacher_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Teacher:</span>
                  <span className="font-medium">{student.teacher_name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Assigned to:</span>
                <span className="font-medium">
                  {assignedTo ? `${assignedTo.full_name} (${assignedTo.role})` : 'Not assigned'}
                </span>
              </div>
            </div>

            <hr className="my-4" />

            {/* Checkboxes */}
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_completed}
                  onChange={(e) => setFormData({ ...formData, is_completed: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <span className="text-sm">Session completed</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.student_absent}
                  onChange={(e) => setFormData({ ...formData, student_absent: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <span className="text-sm">Student was absent</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.outside_schedule_conflict}
                  onChange={(e) => setFormData({ ...formData, outside_schedule_conflict: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <span className="text-sm">Outside schedule conflict</span>
              </label>
            </div>

            <hr className="my-4" />

            {/* Notes Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Notes
              </label>
              <textarea
                value={formData.session_notes}
                onChange={(e) => setFormData({ ...formData, session_notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                rows={3}
                placeholder="Add any notes about this session..."
                disabled={loading}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}