'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import type { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type Lesson = Database['public']['Tables']['lessons']['Row'];

interface GroupLessonPanelProps {
  groupId: string;
  groupName: string;
  sessions: ScheduleSession[];
  students: Map<string, { initials: string; grade_level?: string }>;
}

export function GroupLessonPanel({
  groupId,
  groupName,
  sessions,
  students
}: GroupLessonPanelProps) {
  const { showToast } = useToast();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form state for manual lesson creation/editing
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch lesson on mount
  useEffect(() => {
    fetchLesson();
  }, [groupId]);

  const fetchLesson = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/lesson`);
      if (!response.ok) throw new Error('Failed to fetch lesson');

      const data = await response.json();
      setLesson(data.lesson);

      if (data.lesson) {
        setTitle(data.lesson.title || '');
        setSubject(data.lesson.subject || '');
        setNotes(data.lesson.notes || '');

        // Handle content based on type (JSONB or text)
        if (typeof data.lesson.content === 'object') {
          setContent(JSON.stringify(data.lesson.content, null, 2));
        } else {
          setContent(data.lesson.content || '');
        }
      }
    } catch (error) {
      console.error('Error fetching lesson:', error);
      showToast('Failed to load lesson', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLesson = async () => {
    if (!content.trim()) {
      showToast('Please enter lesson content', 'error');
      return;
    }

    try {
      const body: any = {
        title: title.trim() || groupName,
        content: content.trim(),
        lesson_source: 'manual',
        subject: subject.trim() || null,
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
      setEditing(false);

      showToast('Lesson saved successfully', 'success');
    } catch (error) {
      console.error('Error saving lesson:', error);
      showToast('Failed to save lesson', 'error');
    }
  };

  const handleGenerateAILesson = async () => {
    setGenerating(true);
    try {
      // Get unique student data from sessions
      const studentData = sessions
        .map(session => {
          const student = students.get(session.student_id);
          return {
            id: session.student_id,
            initials: student?.initials || '?',
            grade_level: student?.grade_level || ''
          };
        })
        .filter((s, index, self) =>
          index === self.findIndex((t) => t.id === s.id)
        );

      // Calculate average duration
      const avgDuration = Math.round(
        sessions.reduce((sum, s) => {
          const start = s.start_time.split(':').map(Number);
          const end = s.end_time.split(':').map(Number);
          const duration = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
          return sum + duration;
        }, 0) / sessions.length
      );

      // Use existing lesson generation API
      const response = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: studentData.map(s => ({
            id: s.id,
            grade: s.grade_level
          })),
          subject: 'English Language Arts', // Default, could be made configurable
          subjectType: 'ela',
          duration: avgDuration,
          topic: `Lesson for ${groupName}`,
          teacherRole: 'resource', // Could be passed from user profile
          groupId: groupId
        })
      });

      if (!response.ok) throw new Error('Failed to generate AI lesson');

      const data = await response.json();

      if (data.lesson) {
        // Save the generated lesson to the group
        const saveResponse = await fetch(`/api/groups/${groupId}/lesson`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `AI-Generated Lesson for ${groupName}`,
            content: data.lesson,
            lesson_source: 'ai_generated',
            subject: 'English Language Arts',
            ai_prompt: data.prompt || '',
            duration_minutes: avgDuration
          })
        });

        if (!saveResponse.ok) throw new Error('Failed to save AI lesson');

        const savedData = await saveResponse.json();
        setLesson(savedData.lesson);

        showToast('AI lesson generated and saved successfully', 'success');
      }
    } catch (error) {
      console.error('Error generating AI lesson:', error);
      showToast('Failed to generate AI lesson', 'error');
    } finally {
      setGenerating(false);
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
      setTitle('');
      setContent('');
      setSubject('');
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

  // No lesson exists and not editing - show options
  if (!lesson && !editing) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <p className="text-gray-600 mb-6">
            No lesson plan created for this group yet
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleGenerateAILesson}
              disabled={generating}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Generate AI Lesson</span>
                </>
              )}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <span>📝</span>
              <span>Create Manual Lesson</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Editing or creating new lesson
  if (editing || (!lesson && editing)) {
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">
          {lesson ? 'Edit Lesson Plan' : 'Create Lesson Plan'}
        </h4>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Lesson for ${groupName}`}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Reading, Math, Writing"
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lesson Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your lesson plan content..."
              rows={10}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes or instructions..."
              rows={3}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false);
              if (lesson) {
                // Reset to saved values
                setTitle(lesson.title || '');
                setSubject(lesson.subject || '');
                setNotes(lesson.notes || '');
                if (typeof lesson.content === 'object') {
                  setContent(JSON.stringify(lesson.content, null, 2));
                } else {
                  setContent(lesson.content || '');
                }
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
            Save Lesson
          </button>
        </div>
      </div>
    );
  }

  // Viewing existing lesson
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-gray-900 text-lg">
            {lesson.title || groupName}
          </h4>
          {lesson.subject && (
            <p className="text-sm text-gray-600 mt-1">Subject: {lesson.subject}</p>
          )}
          {lesson.lesson_source && (
            <p className="text-xs text-gray-500 mt-1">
              {lesson.lesson_source === 'ai_generated' ? '✨ AI-Generated' : '📝 Manual'}
            </p>
          )}
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

      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
          {typeof lesson.content === 'object'
            ? JSON.stringify(lesson.content, null, 2)
            : lesson.content}
        </pre>
      </div>

      {lesson.notes && (
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <h5 className="text-sm font-medium text-gray-900 mb-1">Notes</h5>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{lesson.notes}</p>
        </div>
      )}
    </div>
  );
}
