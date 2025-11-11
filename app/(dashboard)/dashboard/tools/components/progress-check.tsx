'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import ProgressCheckWorksheet from './progress-check-worksheet';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { loadStudentsForUser, getUserRole, type StudentData } from '@/lib/supabase/queries/sea-students';

interface AssessmentItem {
  type: 'multiple_choice' | 'short_answer' | 'problem';
  prompt: string;
  options?: string[];
}

interface IEPGoalAssessment {
  goal: string;
  assessmentItems: AssessmentItem[];
}

interface Worksheet {
  studentId: string;
  studentInitials: string;
  gradeLevel?: number;
  iepGoals: IEPGoalAssessment[];
}

export default function ProgressCheck() {
  const { showToast } = useToast();
  const { currentSchool } = useSchool();
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorksheets, setGeneratedWorksheets] = useState<Worksheet[]>([]);
  const [showWorksheets, setShowWorksheets] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentSchool) {
      loadStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSchool]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadStudents() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user && currentSchool) {
      // Get user role to determine how to filter students
      const userRole = await getUserRole(user.id);

      if (!userRole) {
        console.error('[Progress Check] Failed to get user role');
        showToast('Failed to load user information', 'error');
        return;
      }

      // Load students based on role (SEAs see only assigned students)
      const { data, error } = await loadStudentsForUser(user.id, userRole, {
        currentSchool,
        includeIEPGoals: true
      });

      if (error) {
        console.error('[Progress Check] Error loading students:', error);
        showToast('Failed to load students', 'error');
        return;
      }

      if (data) {
        // Filter to only show students with IEP goals
        const studentsWithGoals = data.filter(student => {
          // Handle both formats: nested student_details or direct iep_goals
          const studentDetails = Array.isArray(student.student_details)
            ? student.student_details[0]
            : student.student_details;
          const iepGoals = student.iep_goals || studentDetails?.iep_goals || [];
          return Array.isArray(iepGoals) && iepGoals.length > 0;
        });

        console.log(`[Progress Check] Found ${studentsWithGoals.length} students with IEP goals out of ${data.length} total students`);
        setStudents(studentsWithGoals);
      }
    }
  }

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : prev.length < 10
        ? [...prev, studentId]
        : prev
    );
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
  };

  const handleGenerate = async () => {
    if (selectedStudentIds.length === 0) {
      showToast('Please select at least one student', 'error');
      return;
    }

    setIsGenerating(true);
    setProgressMessage('Preparing to generate progress checks...');

    try {
      const response = await fetch('/api/progress-check/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: selectedStudentIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Failed to generate progress checks');
      }

      const data = await response.json();

      // Debug logging
      console.log('[Progress Check] API response:', {
        success: data.success,
        worksheetCount: data.worksheets?.length || 0,
        errorCount: data.errors?.length || 0,
        errors: data.errors
      });

      if (data.worksheets && data.worksheets.length > 0) {
        setGeneratedWorksheets(data.worksheets);
        setShowWorksheets(true);

        const successCount = data.worksheets.length;
        const errorCount = data.errors?.length || 0;

        if (errorCount > 0) {
          showToast(
            `Generated ${successCount} worksheet${successCount > 1 ? 's' : ''}. Failed for ${errorCount} student${errorCount > 1 ? 's' : ''}.`,
            'warning'
          );
        } else {
          showToast(`Successfully generated ${successCount} progress check${successCount > 1 ? 's' : ''}!`, 'success');
        }
      } else {
        // Show detailed error information
        const errorDetails = data.errors?.map((e: any) => e.error).join(', ') || 'Unknown error';
        console.error('[Progress Check] No worksheets generated. Errors:', data.errors);
        throw new Error(`No worksheets were generated. Errors: ${errorDetails}`);
      }
    } catch (error: any) {
      console.error('Error generating progress checks:', error);
      showToast(error.message || 'Failed to generate progress checks. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
      setProgressMessage('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-2">Progress Check Generator</h2>
        <p className="text-gray-600 mb-6">
          Generate IEP goal assessment worksheets for your students. Select up to 10 students to create individual progress checks.
          <br />
          <span className="text-sm text-gray-500">
            Note: Only students with IEP goals will appear in the list.
          </span>
        </p>

        {students.length === 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-800">
              <strong>No students available:</strong> To use Progress Check, students must have IEP goals entered in their details.
              Please add IEP goals to your students first.
            </p>
          </div>
        )}

        {/* Student Multi-Select Dropdown */}
        <div className="mb-6" ref={dropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Students * (Maximum 10)
          </label>

          {/* Selected Students Tags */}
          {selectedStudentIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedStudentIds.map(id => {
                const student = students.find(s => s.id === id);
                if (!student) return null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {student.initials} (Grade {student.grade_level})
                    <button
                      type="button"
                      onClick={() => removeStudent(id)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Dropdown Button */}
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isGenerating}
          >
            <span className="text-gray-700">
              {selectedStudentIds.length === 0
                ? 'Select students...'
                : `${selectedStudentIds.length} student${selectedStudentIds.length > 1 ? 's' : ''} selected`
              }
            </span>
            <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute z-10 mt-1 w-full max-w-lg bg-white shadow-lg rounded-md border border-gray-200">
              <div className="max-h-60 overflow-auto py-1">
                {students.length === 0 ? (
                  <div className="px-3 py-2 text-gray-500 text-sm">
                    No students with IEP goals found. Please add IEP goals to your students.
                  </div>
                ) : (
                  students.map(student => (
                    <label
                      key={student.id}
                      className={`flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                        selectedStudentIds.length >= 10 && !selectedStudentIds.includes(student.id)
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => handleStudentToggle(student.id)}
                        disabled={selectedStudentIds.length >= 10 && !selectedStudentIds.includes(student.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-3 text-sm">
                        {student.initials} (Grade {student.grade_level})
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedStudentIds.length >= 10 && (
                <div className="px-3 py-2 text-xs text-amber-600 bg-amber-50 border-t border-gray-200">
                  Maximum of 10 students reached
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progress Message */}
        {isGenerating && progressMessage && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-md text-sm">
            {progressMessage}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || selectedStudentIds.length === 0 || students.length === 0}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isGenerating || selectedStudentIds.length === 0 || students.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating Progress Checks...
            </span>
          ) : (
            `Generate Progress Checks for ${selectedStudentIds.length} Student${selectedStudentIds.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>

      {/* Worksheets Display */}
      {showWorksheets && generatedWorksheets.length > 0 && (
        <ProgressCheckWorksheet
          worksheets={generatedWorksheets}
          onClose={() => setShowWorksheets(false)}
        />
      )}
    </div>
  );
}
