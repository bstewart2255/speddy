'use client';

import { useState, useEffect } from 'react';
import { getTopicOptionsForSubject } from '@/lib/templates/template-registry';
import type { SubjectType, TemplateTopic } from '@/lib/templates/types';
import { createClient } from '@/lib/supabase/client';

interface SampleLessonFormProps {
  onGenerate: (result: any) => void;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

export default function SampleLessonForm({ onGenerate }: SampleLessonFormProps) {
  const [subjectType, setSubjectType] = useState<SubjectType>('ela');
  const [topic, setTopic] = useState<TemplateTopic>('reading-comprehension');
  const [grade, setGrade] = useState('3');
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student selection state
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Get topic options based on selected subject
  const topicOptions = getTopicOptionsForSubject(subjectType);

  // Fetch students on mount
  useEffect(() => {
    async function fetchStudents() {
      try {
        const supabase = createClient();

        // First get the current user's profile to get school context
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('No authenticated user');
          setLoadingStudents(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('school_id')
          .eq('id', user.id)
          .single();

        if (!profile?.school_id) {
          console.error('No school_id found for user');
          setLoadingStudents(false);
          return;
        }

        // Now fetch students for this school
        const { data, error } = await supabase
          .from('students')
          .select('id, first_name, last_name, grade_level')
          .eq('school_id', profile.school_id)
          .order('last_name', { ascending: true });

        if (error) {
          console.error('Error fetching students:', error);
          throw error;
        }

        console.log(`[Sample Lessons] Fetched ${data?.length || 0} students`);
        setStudents(data || []);
      } catch (err) {
        console.error('Error fetching students:', err);
      } finally {
        setLoadingStudents(false);
      }
    }

    fetchStudents();
  }, []);

  // Handle subject change - reset topic to first option of new subject
  const handleSubjectChange = (newSubject: SubjectType) => {
    setSubjectType(newSubject);
    const options = getTopicOptionsForSubject(newSubject);
    if (options.length > 0) {
      setTopic(options[0].id);
    }
  };

  // Handle student selection
  const handleStudentToggle = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/lessons/v2/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          subjectType,
          grade,
          duration,
          studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const result = await response.json();
      onGenerate(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Subject Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Subject
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="ela"
              checked={subjectType === 'ela'}
              onChange={(e) => handleSubjectChange(e.target.value as SubjectType)}
              className="mr-2"
            />
            <span className="text-sm">ELA</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="math"
              checked={subjectType === 'math'}
              onChange={(e) => handleSubjectChange(e.target.value as SubjectType)}
              className="mr-2"
            />
            <span className="text-sm">Math</span>
          </label>
        </div>
      </div>

      {/* Topic Dropdown */}
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-2">
          Topic
        </label>
        <select
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value as TemplateTopic)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          {topicOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {topicOptions.find((opt) => opt.id === topic)?.description && (
          <p className="mt-1 text-xs text-gray-500">
            {topicOptions.find((opt) => opt.id === topic)?.description}
          </p>
        )}
      </div>

      {/* Grade */}
      <div>
        <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
          Grade Level
        </label>
        <select
          id="grade"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="K">Kindergarten</option>
          <option value="1">1st Grade</option>
          <option value="2">2nd Grade</option>
          <option value="3">3rd Grade</option>
          <option value="4">4th Grade</option>
          <option value="5">5th Grade</option>
        </select>
      </div>

      {/* Duration */}
      <div>
        <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-2">
          Duration
        </label>
        <select
          id="duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) as 15 | 30 | 45 | 60)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">60 minutes</option>
        </select>
      </div>

      {/* Student Selection (Optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Students (Optional - for IEP-aware content)
        </label>
        {loadingStudents ? (
          <div className="text-sm text-gray-500">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="text-sm text-gray-500">No students found</div>
        ) : (
          <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
            {students.map((student) => (
              <label key={student.id} className="flex items-center py-1 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(student.id)}
                  onChange={() => handleStudentToggle(student.id)}
                  className="mr-2"
                />
                <span className="text-sm">
                  {student.last_name}, {student.first_name} (Grade {student.grade_level})
                </span>
              </label>
            ))}
          </div>
        )}
        {selectedStudentIds.length > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            {selectedStudentIds.length} student{selectedStudentIds.length > 1 ? 's' : ''} selected
          </div>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Select students to generate content based on their IEP goals. Leave empty to use grade level only.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Generating...' : 'Generate Sample Lesson'}
      </button>

      {/* Info Text */}
      <p className="text-xs text-gray-500">
        This will use the v2 template-based generation system with simplified prompts.
      </p>
    </form>
  );
}
