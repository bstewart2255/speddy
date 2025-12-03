'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import { LessonControl } from '@/app/components/lesson-control';
import type { Database } from '../../../src/types/database';

type Lesson = Database['public']['Tables']['lessons']['Row'];

interface CurriculumTracking {
  id: string;
  group_id: string | null;
  session_id: string | null;
  curriculum_type: string;
  curriculum_level: string;
  current_lesson: number;
  created_at: string;
  updated_at: string;
}

interface GroupLessonPanelProps {
  groupId: string;
  groupName: string;
}

// Curriculum options
const CURRICULUM_OPTIONS = [
  { value: 'SPIRE', label: 'S.P.I.R.E.' },
  { value: 'Reveal Math', label: 'Reveal Math' }
];

const SPIRE_LEVELS = ['Foundations', '1', '2', '3', '4', '5', '6', '7', '8'];
const REVEAL_MATH_GRADES = ['K', '1', '2', '3', '4', '5'];

export function GroupLessonPanel({
  groupId,
  groupName
}: GroupLessonPanelProps) {
  const { showToast } = useToast();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Form state for manual lesson creation/editing
  const [notes, setNotes] = useState('');

  // Curriculum tracking state
  const [curriculumTracking, setCurriculumTracking] = useState<CurriculumTracking | null>(null);
  const [curriculumType, setCurriculumType] = useState('');
  const [curriculumLevel, setCurriculumLevel] = useState('');
  const [currentLesson, setCurrentLesson] = useState<number>(1);

  const fetchLesson = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/lesson`, { signal });
      if (!response.ok) throw new Error('Failed to fetch lesson');

      const data = await response.json();
      setLesson(data.lesson);

      if (data.lesson) {
        setNotes(data.lesson.notes || '');
      }
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching lesson:', error);
      showToast('Failed to load lesson', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, showToast]);

  const fetchCurriculumTracking = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/curriculum-tracking?groupId=${groupId}`, { signal });
      if (!response.ok) {
        if (response.status === 404) {
          // No curriculum tracking exists yet, which is fine
          return;
        }
        throw new Error('Failed to fetch curriculum tracking');
      }

      const { data } = await response.json();
      if (data) {
        setCurriculumTracking(data);
        setCurriculumType(data.curriculum_type);
        setCurriculumLevel(data.curriculum_level);
        setCurrentLesson(data.current_lesson);
      }
    } catch (error) {
      // Ignore abort errors - expected during cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Silently fail for curriculum tracking - it's optional
      console.error('Error fetching curriculum tracking:', error);
    }
  }, [groupId]);

  // Fetch lesson and curriculum tracking on mount
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchLesson(controller.signal),
      fetchCurriculumTracking(controller.signal)
    ]);
    return () => controller.abort();
  }, [fetchLesson, fetchCurriculumTracking]);

  const saveCurriculumTracking = async () => {
    // Only save if all curriculum fields are provided
    if (!curriculumType || !curriculumLevel || !currentLesson) {
      return;
    }

    try {
      const response = await fetch('/api/curriculum-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          curriculumType,
          curriculumLevel,
          currentLesson
        })
      });

      if (!response.ok) throw new Error('Failed to save curriculum tracking');

      const { data } = await response.json();
      setCurriculumTracking(data);
    } catch (error) {
      console.error('Error saving curriculum tracking:', error);
      throw error;
    }
  };

  const handleSaveLesson = async () => {
    try {
      const body: any = {
        title: null,
        content: null,
        lesson_source: 'manual',
        subject: null,
        notes: notes.trim() || null
      };

      const response = await fetch(`/api/groups/${groupId}/lesson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to save lesson');

      const data = await response.json();
      setLesson(data.lesson);

      // Save curriculum tracking if provided
      if (curriculumType && curriculumLevel && currentLesson) {
        try {
          await saveCurriculumTracking();
        } catch (currError) {
          // Lesson saved but curriculum failed - warn user
          showToast('Lesson saved, but curriculum tracking failed', 'warning');
          setEditing(false);
          return;
        }
      }

      setEditing(false);
      showToast('Lesson saved successfully', 'success');
    } catch (error) {
      console.error('Error saving lesson:', error);
      showToast('Failed to save lesson', 'error');
    }
  };


  const handleDeleteLesson = async () => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;

    try {
      const response = await fetch(`/api/groups/${groupId}/lesson`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete lesson');

      setLesson(null);
      setNotes('');
      setEditing(false);

      showToast('Lesson deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting lesson:', error);
      showToast('Failed to delete lesson', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Loading lesson...</div>
      </div>
    );
  }

  // No lesson exists and not editing - show create button
  if (!lesson && !editing) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <p className="text-gray-600 mb-6">
            No notes created for this group yet
          </p>
          <button
            onClick={() => setEditing(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Create Notes
          </button>
        </div>
      </div>
    );
  }

  // Editing or creating new lesson
  if (editing) {
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">
          {lesson ? 'Edit Notes' : 'Create Notes'}
        </h4>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter your notes..."
              rows={10}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
            />
          </div>

          {/* Curriculum Tracking Section */}
          <div className="border-t border-gray-200 pt-4">
            <h5 className="text-sm font-medium text-gray-900 mb-3">
              Curriculum Tracking (Optional)
            </h5>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Curriculum
                </label>
                <select
                  value={curriculumType}
                  onChange={(e) => {
                    setCurriculumType(e.target.value);
                    // Reset level when curriculum changes
                    setCurriculumLevel('');
                  }}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select curriculum...</option>
                  {CURRICULUM_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {curriculumType && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {curriculumType === 'SPIRE' ? 'Level/Foundations' : 'Grade'}
                    </label>
                    <select
                      value={curriculumLevel}
                      onChange={(e) => setCurriculumLevel(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select {curriculumType === 'SPIRE' ? 'level' : 'grade'}...</option>
                      {(curriculumType === 'SPIRE' ? SPIRE_LEVELS : REVEAL_MATH_GRADES).map(level => (
                        <option key={level} value={level}>
                          {curriculumType === 'SPIRE' && level !== 'Foundations' ? `Level ${level}` : level}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Lesson Number
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={currentLesson}
                      onChange={(e) => setCurrentLesson(parseInt(e.target.value) || 1)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false);
              if (lesson) {
                // Reset to saved values
                setNotes(lesson.notes || '');
              }
            }}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveLesson}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  // Viewing existing lesson
  if (!lesson) {
    return null;
  }

  // Get level/grade label
  const getLevelLabel = () => {
    if (!curriculumTracking) return '';
    if (curriculumTracking.curriculum_type === 'SPIRE') {
      return curriculumTracking.curriculum_level === 'Foundations' ? '' : 'Level';
    }
    return 'Grade';
  };

  return (
    <div className="space-y-4">
      {/* Curriculum Context Section */}
      {curriculumTracking && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📚</span>
              <div>
                <h5 className="font-medium text-gray-900">
                  {curriculumTracking.curriculum_type === 'SPIRE' ? 'S.P.I.R.E.' : 'Reveal Math'}{' '}
                  {getLevelLabel()} {curriculumTracking.curriculum_level}
                </h5>
              </div>
            </div>
            <LessonControl
              currentLesson={currentLesson}
              setCurrentLesson={setCurrentLesson}
              curriculumType={curriculumType}
              curriculumLevel={curriculumLevel}
              getIdentifier={() => groupId}
              identifierKey="groupId"
              onError={(message) => showToast(message, 'error')}
              size="medium"
            />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-gray-900 text-lg">Notes</h4>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDeleteLesson}
            className="px-3 py-1 text-sm text-red-600 hover:text-red-800 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {lesson.notes ? (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">{lesson.notes}</pre>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
          <p className="text-sm text-gray-500">No notes yet</p>
        </div>
      )}
    </div>
  );
}
