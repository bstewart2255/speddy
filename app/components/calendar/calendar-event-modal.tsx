"use client";

import React, { useState, useEffect } from "react";
import { createClient } from '@/lib/supabase/client';
import type { CalendarEvent } from '../../../src/types/database';

interface CalendarEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (event: CalendarEvent) => void;
  selectedDate: Date;
  event?: CalendarEvent | null;
  providerId: string;
  schoolSiteId?: string;
  schoolDistrictId?: string;
}

export function CalendarEventModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
  event,
  providerId,
  schoolSiteId,
  schoolDistrictId
}: CalendarEventModalProps) {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startTime, setStartTime] = useState(event?.start_time || '');
  const [endTime, setEndTime] = useState(event?.end_time || '');
  const [allDay, setAllDay] = useState(event?.all_day || false);
  const [eventType, setEventType] = useState<'meeting' | 'assessment' | 'activity' | 'other'>(
    event?.event_type || 'other'
  );
  const [location, setLocation] = useState(event?.location || '');
  const [attendees, setAttendees] = useState<string>(
    event?.attendees?.join(', ') || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setStartTime(event.start_time || '');
      setEndTime(event.end_time || '');
      setAllDay(event.all_day);
      setEventType(event.event_type || 'other');
      setLocation(event.location || '');
      setAttendees(event.attendees?.join(', ') || '');
    } else {
      setTitle('');
      setDescription('');
      setStartTime('');
      setEndTime('');
      setAllDay(false);
      setEventType('other');
      setLocation('');
      setAttendees('');
    }
  }, [event]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!allDay && startTime && endTime && startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const eventData = {
        provider_id: providerId,
        title: title.trim(),
        description: description.trim() || null,
        date: selectedDate.toISOString().split('T')[0],
        start_time: allDay ? null : startTime || null,
        end_time: allDay ? null : endTime || null,
        all_day: allDay,
        event_type: eventType,
        location: location.trim() || null,
        attendees: attendees.trim() ? attendees.split(',').map(a => a.trim()) : null,
        school_site_id: schoolSiteId || null,
        school_district_id: schoolDistrictId || null,
      };

      let result;
      if (event?.id) {
        // Update existing event
        const { data, error: updateError } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', event.id)
          .select()
          .single();

        if (updateError) throw updateError;
        result = data;
      } else {
        // Create new event
        const { data, error: insertError } = await supabase
          .from('calendar_events')
          .insert(eventData)
          .select()
          .single();

        if (insertError) throw insertError;
        result = data;
      }

      if (onSave && result) {
        onSave(result);
      }
      handleClose();
    } catch (err) {
      console.error('Error saving calendar event:', err);
      setError('Failed to save event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id) return;

    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', event.id);

      if (deleteError) throw deleteError;

      handleClose();
    } catch (err) {
      console.error('Error deleting calendar event:', err);
      setError('Failed to delete event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setStartTime('');
    setEndTime('');
    setAllDay(false);
    setEventType('other');
    setLocation('');
    setAttendees('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {event ? 'Edit Event' : 'Add New Event'}
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <p className="text-sm text-gray-600">
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="eventType" className="block text-sm font-medium text-gray-700 mb-1">
              Event Type
            </label>
            <select
              id="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="meeting">Meeting</option>
              <option value="assessment">Assessment</option>
              <option value="activity">Activity</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              id="allDay"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="allDay" className="ml-2 block text-sm text-gray-700">
              All day event
            </label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time
                </label>
                <input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
                  End Time
                </label>
                <input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="attendees" className="block text-sm font-medium text-gray-700 mb-1">
              Attendees (comma-separated)
            </label>
            <input
              id="attendees"
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="e.g., John Doe, Jane Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-between">
          {event && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className={`px-4 py-2 rounded-md text-white ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Saving...' : event ? 'Update' : 'Add Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}