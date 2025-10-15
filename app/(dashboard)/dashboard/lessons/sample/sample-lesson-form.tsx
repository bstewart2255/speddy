'use client';

import { useState, useEffect } from 'react';
import { getTopicOptionsForSubject } from '@/lib/templates/template-registry';
import type { SubjectType, TemplateTopic } from '@/lib/templates/types';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { loadStudentsForUser, getUserRole, type StudentData } from '@/lib/supabase/queries/sea-students';

interface SampleLessonFormProps {
  onGenerate: (result: any) => void;
}

export default function SampleLessonForm({ onGenerate }: SampleLessonFormProps) {
  const { currentSchool } = useSchool();
  const [subjectType, setSubjectType] = useState<SubjectType>('ela');
  const [topic, setTopic] = useState<TemplateTopic>('reading-comprehension');
  const [grade, setGrade] = useState('');  // Start empty so user can choose students-only mode
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [generateLessonPlan, setGenerateLessonPlan] = useState(false);  // Default to unchecked
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student selection state
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Get topic options based on selected subject
  const topicOptions = getTopicOptionsForSubject(subjectType);

  // Fetch students when school context is ready
  useEffect(() => {
    if (currentSchool) {
      loadStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSchool]);

  async function loadStudents() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !currentSchool) {
      setLoadingStudents(false);
      return;
    }

    try {
      // Get user role to determine how to filter students
      const userRole = await getUserRole(user.id);

      if (!userRole) {
        console.error('[Sample Lessons] Failed to get user role');
        setLoadingStudents(false);
        return;
      }

      // Load students based on role (SEAs see only assigned students)
      // Filtered by current school
      const { data, error } = await loadStudentsForUser(user.id, userRole, {
        currentSchool,
        includeIEPGoals: true  // Need IEP goals to filter
      });

      if (error) {
        console.error('[Sample Lessons] Error loading students:', error);
        setStudents([]);
      } else if (data) {
        // Filter to only show students with IEP goals
        const studentsWithIEP = data.filter(
          (student) => student.iep_goals && student.iep_goals.length > 0
        );
        console.log(`[Sample Lessons] Fetched ${studentsWithIEP.length} students with IEP goals (out of ${data.length} total)`);
        setStudents(studentsWithIEP);
      }
    } catch (err) {
      console.error('[Sample Lessons] Error fetching students:', err);
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

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

    // Client-side validation
    if (!grade && selectedStudentIds.length === 0) {
      setError('Please select either a grade level or students with IEP goals');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/lessons/v2/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          subjectType,
          grade: grade || undefined,  // Send undefined instead of empty string
          duration,
          studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : undefined,
          generateLessonPlan,
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
      {/* Grade Level */}
      <div>
        <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
          Grade Level (Optional if students selected)
        </label>
        <select
          id="grade"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">None (use student IEP goals only)</option>
          <option value="K">Kindergarten</option>
          <option value="1">1st Grade</option>
          <option value="2">2nd Grade</option>
          <option value="3">3rd Grade</option>
          <option value="4">4th Grade</option>
          <option value="5">5th Grade</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Select a grade level, or choose "None" to generate content based solely on selected students' IEP goals.
        </p>
      </div>

      {/* Student Selection (Optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Students (Optional - for IEP-aware content)
        </label>
        {loadingStudents ? (
          <div className="text-sm text-gray-500">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="text-sm text-gray-500">
            No students with IEP goals found
          </div>
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
                  {student.initials} (Grade {student.grade_level})
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
          Select students to generate content based on their IEP goals. Only students with saved IEP goals are shown. Leave empty to use grade level only.
        </p>
      </div>

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

      {/* Lesson Plan Toggle */}
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id="generateLessonPlan"
            type="checkbox"
            checked={generateLessonPlan}
            onChange={(e) => setGenerateLessonPlan(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
        </div>
        <div className="ml-3">
          <label htmlFor="generateLessonPlan" className="text-sm font-medium text-gray-700">
            Generate Lesson Plan for Teacher
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Include objectives, teaching steps, and guided practice alongside the worksheet
          </p>
        </div>
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
