'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { loadStudentsForUser, getUserRole } from '@/lib/supabase/queries/sea-students';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/app/contexts/toast-context';

interface Student {
  id: string;
  initials: string;
  grade_level: string | number;
}

interface AssessmentItem {
  type: 'multiple_choice' | 'short_answer' | 'problem';
  prompt: string;
  passage?: string;
  options?: string[];
}

interface IEPGoalAssessment {
  goal: string;
  assessmentItems: AssessmentItem[];
}

interface ProgressCheckContent {
  studentId: string;
  studentInitials: string;
  gradeLevel?: number;
  iepGoals: IEPGoalAssessment[];
}

interface QuestionResult {
  iep_goal_index: number;
  question_index: number;
  status?: 'correct' | 'incorrect' | 'excluded';
  notes?: string;
}

interface ProgressCheck {
  id: string;
  student_id: string;
  content: ProgressCheckContent;
  created_at: string;
  completed_at: string | null;
  is_graded: boolean;
  results: any[];
}

export default function ProgressCheckResultsTab() {
  const { currentSchool } = useSchool();
  const { showToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [checks, setChecks] = useState<ProgressCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_grading' | 'graded'>('needs_grading');
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
  const [questionStates, setQuestionStates] = useState<Record<string, Record<string, QuestionResult>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup success message timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!currentSchool) {
        console.log('[Progress Check Results] No current school selected');
        return;
      }

      const userRole = await getUserRole(user.id);
      if (!userRole) {
        console.error('[Progress Check Results] Failed to get user role');
        return;
      }

      // Load students based on role with school context
      const { data: studentsData, error } = await loadStudentsForUser(user.id, userRole, {
        currentSchool,
        includeIEPGoals: true
      });

      if (error) {
        console.error('[Progress Check Results] Error loading students:', error);
        return;
      }

      if (!studentsData) return;

      // Filter to only show students with IEP goals
      const studentsWithGoals = studentsData.filter((student: any) => {
        // Handle both formats: nested student_details or direct iep_goals
        const studentDetails = Array.isArray(student.student_details)
          ? student.student_details[0]
          : student.student_details;
        const iepGoals = student.iep_goals || studentDetails?.iep_goals || [];
        return Array.isArray(iepGoals) && iepGoals.length > 0;
      });

      console.log(`[Progress Check Results] Found ${studentsWithGoals.length} students with IEP goals out of ${studentsData.length} total students`);
      setStudents(studentsWithGoals);
    } catch (error) {
      console.error('[Progress Check Results] Error fetching students:', error);
    } finally {
      setLoadingStudents(false);
    }
  }, [currentSchool]);

  // Fetch students on mount and when school changes
  useEffect(() => {
    if (currentSchool) {
      fetchStudents();
    }
  }, [currentSchool, fetchStudents]);

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/progress-check/results?student_id=${selectedStudentId}&status=${statusFilter}`
      );

      if (!response.ok) throw new Error('Failed to fetch progress checks');

      const data = await response.json();
      setChecks(data.checks || []);

      // Initialize question states from existing results
      const initialStates: Record<string, Record<string, QuestionResult>> = {};
      data.checks.forEach((check: ProgressCheck) => {
        const checkStates: Record<string, QuestionResult> = {};
        check.results.forEach((result: any) => {
          const key = `${result.iep_goal_index}-${result.question_index}`;
          checkStates[key] = {
            iep_goal_index: result.iep_goal_index,
            question_index: result.question_index,
            status: result.status,
            notes: result.notes || undefined,
          };
        });
        initialStates[check.id] = checkStates;
      });
      setQuestionStates(initialStates);

    } catch (error) {
      console.error('Error fetching progress checks:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId, statusFilter]);

  // Fetch checks when student or filter changes
  useEffect(() => {
    if (selectedStudentId) {
      fetchChecks();
    }
  }, [selectedStudentId, fetchChecks]);

  const toggleCheck = (checkId: string) => {
    setExpandedChecks(prev => ({
      ...prev,
      [checkId]: !prev[checkId]
    }));
  };

  const updateQuestionState = (
    checkId: string,
    goalIndex: number,
    questionIndex: number,
    updates: Partial<QuestionResult>
  ) => {
    const key = `${goalIndex}-${questionIndex}`;
    setQuestionStates(prev => ({
      ...prev,
      [checkId]: {
        ...prev[checkId],
        [key]: {
          iep_goal_index: goalIndex,
          question_index: questionIndex,
          status: updates.status !== undefined ? updates.status : prev[checkId]?.[key]?.status,
          notes: updates.notes !== undefined ? updates.notes : prev[checkId]?.[key]?.notes,
        }
      }
    }));
  };

  // Type guard for complete question results
  const isCompleteQuestionResult = (r: QuestionResult): r is Required<QuestionResult> =>
    r &&
    typeof r.status === 'string' &&
    typeof r.iep_goal_index !== 'undefined' &&
    typeof r.question_index !== 'undefined';

  const saveResults = async (checkId: string) => {
    setSaving(checkId);
    setSuccessMessage(null);

    try {
      const check = checks.find(c => c.id === checkId);
      if (!check) return;

      // Count total questions
      const totalQuestions = check.content.iepGoals.reduce((sum, goal) => sum + goal.assessmentItems.length, 0);

      const checkStates = questionStates[checkId] || {};
      const results = Object.values(checkStates);

      // Validate: ensure all questions have a status selected
      if (results.length < totalQuestions) {
        showToast(`Please grade all ${totalQuestions} questions before saving. You've only graded ${results.length}.`, 'error');
        return;
      }

      const unansweredResults = results.filter(r => !r.status);
      if (unansweredResults.length > 0) {
        showToast('Please select a status (Correct/Incorrect/Excluded) for all questions before saving.', 'error');
        return;
      }

      // Validate: ensure notes are provided for incorrect answers
      const invalidResults = results.filter(
        r => r.status === 'incorrect' && (!r.notes || r.notes.trim() === '')
      );

      if (invalidResults.length > 0) {
        showToast('Please provide notes for all questions marked as incorrect.', 'error');
        return;
      }

      // Filter out any results without a status (safety check with type guard)
      const validResults = results.filter(isCompleteQuestionResult);

      const response = await fetch('/api/progress-check/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progress_check_id: checkId,
          results: validResults,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save results');
      }

      setSuccessMessage('Results saved successfully!');

      // Clear existing timeout if any
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }

      // Set new timeout and store reference
      successTimeoutRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successTimeoutRef.current = null;
      }, 3000);

      // Refresh checks
      await fetchChecks();
    } catch (error) {
      console.error('Error saving results:', error);
      showToast(error instanceof Error ? error.message : 'Failed to save results', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loadingStudents) {
    return (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-2 text-gray-600">Loading students...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Progress Check Results</h2>
        <p className="text-gray-600">Grade progress check questions and track student performance</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <p className="text-green-800 text-sm font-medium">{successMessage}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="student-select" className="block text-sm font-medium text-gray-700 mb-1">
            Select Student
          </label>
          <select
            id="student-select"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select a student --</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.initials} (Grade {student.grade_level})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Status Filter
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="needs_grading">Needs Grading</option>
            <option value="graded">Graded</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Loading progress checks...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && selectedStudentId && checks.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">No progress checks found for this student.</p>
        </div>
      )}

      {/* Progress Checks List */}
      {!loading && selectedStudentId && checks.length > 0 && (
        <div className="space-y-4">
          {checks.map((check) => {
            const isExpanded = expandedChecks[check.id];
            const checkStates = questionStates[check.id] || {};

            return (
              <div key={check.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Check Header */}
                <div
                  className="bg-gray-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCheck(check.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        Progress Check - {new Date(check.created_at).toLocaleDateString()}
                      </span>
                      {check.is_graded && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Graded
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {check.content.iepGoals.length} goal(s), {check.content.iepGoals.reduce((sum, g) => sum + g.assessmentItems.length, 0)} question(s)
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {/* Check Content */}
                {isExpanded && (
                  <div className="p-4 space-y-6">
                    {check.content.iepGoals.map((goal, goalIndex) => (
                      <div key={goalIndex} className="space-y-4">
                        <div className="bg-blue-50 px-4 py-2 rounded-md">
                          <h4 className="text-sm font-semibold text-blue-900">
                            Goal {goalIndex + 1}: {goal.goal}
                          </h4>
                        </div>

                        {goal.assessmentItems.map((item, questionIndex) => {
                          const key = `${goalIndex}-${questionIndex}`;
                          const state = checkStates[key] || { notes: '' };

                          return (
                            <div key={questionIndex} className="ml-4 space-y-2 pb-4 border-b border-gray-200 last:border-b-0">
                              <p className="text-sm text-gray-700 font-medium">
                                Question {questionIndex + 1}: {item.prompt}
                              </p>

                              {item.passage && (
                                <div className="bg-gray-50 p-2 rounded text-xs text-gray-600">
                                  <strong>Passage:</strong> {item.passage}
                                </div>
                              )}

                              {item.options && (
                                <div className="text-xs text-gray-600 ml-2">
                                  {item.options.map((opt, idx) => (
                                    <div key={idx}>• {opt}</div>
                                  ))}
                                </div>
                              )}

                              {/* Status Selection */}
                              <div className="flex gap-3 mt-2">
                                <label className="inline-flex items-center">
                                  <input
                                    type="radio"
                                    name={`${check.id}-${key}`}
                                    value="correct"
                                    checked={state.status === 'correct'}
                                    onChange={() => updateQuestionState(check.id, goalIndex, questionIndex, { status: 'correct', notes: '' })}
                                    className="form-radio text-green-600"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">Correct</span>
                                </label>

                                <label className="inline-flex items-center">
                                  <input
                                    type="radio"
                                    name={`${check.id}-${key}`}
                                    value="incorrect"
                                    checked={state.status === 'incorrect'}
                                    onChange={() => updateQuestionState(check.id, goalIndex, questionIndex, { status: 'incorrect' })}
                                    className="form-radio text-red-600"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">Incorrect</span>
                                </label>

                                <label className="inline-flex items-center">
                                  <input
                                    type="radio"
                                    name={`${check.id}-${key}`}
                                    value="excluded"
                                    checked={state.status === 'excluded'}
                                    onChange={() => updateQuestionState(check.id, goalIndex, questionIndex, { status: 'excluded', notes: '' })}
                                    className="form-radio text-gray-600"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">Excluded</span>
                                </label>
                              </div>

                              {/* Notes field (only for incorrect) */}
                              {state.status === 'incorrect' && (
                                <div className="mt-2">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Notes (required for incorrect answers)
                                  </label>
                                  <textarea
                                    value={state.notes || ''}
                                    onChange={(e) => updateQuestionState(check.id, goalIndex, questionIndex, { notes: e.target.value })}
                                    placeholder="Explain what the student did/didn't do..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {/* Save Button */}
                    <div className="flex justify-end pt-4 border-t">
                      <button
                        onClick={() => saveResults(check.id)}
                        disabled={saving === check.id}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {saving === check.id ? 'Saving...' : 'Save Results'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No Student Selected */}
      {!selectedStudentId && !loading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">Please select a student to view their progress checks.</p>
        </div>
      )}
    </div>
  );
}
