'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { loadStudentsForUser, getUserRole } from '@/lib/supabase/queries/sea-students';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/app/contexts/toast-context';

// Constants moved outside component to avoid unnecessary re-renders
const ITEMS_PER_PAGE = 50;

interface Student {
  id: string;
  initials: string;
  grade_level: string | number;
}

interface Problem {
  type: 'multiple_choice' | 'short_answer' | 'problem';
  prompt?: string;
  question?: string;
  options?: string[];
}

interface ExitTicketContent {
  passage?: string;
  problems: Problem[];
}

interface ProblemResult {
  problem_index: number;
  status?: 'correct' | 'incorrect' | 'excluded';
  notes?: string;
}

interface ExitTicket {
  id: string;
  student_id: string;
  iep_goal_index: number;
  iep_goal_text: string;
  content: ExitTicketContent;
  created_at: string;
  completed_at: string | null;
  discarded_at: string | null;
  is_graded: boolean;
  results: any[];
}

export default function ResultsTab() {
  const { currentSchool } = useSchool();
  const { showToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [tickets, setTickets] = useState<ExitTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_grading' | 'graded' | 'discarded'>('needs_grading');
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({});
  const [problemStates, setProblemStates] = useState<Record<string, Record<string, ProblemResult>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

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
        console.log('[Exit Ticket Results] No current school selected');
        return;
      }

      const userRole = await getUserRole(user.id);
      if (!userRole) {
        console.error('[Exit Ticket Results] Failed to get user role');
        return;
      }

      const { data: studentsData, error } = await loadStudentsForUser(user.id, userRole, {
        currentSchool,
        includeIEPGoals: true
      });

      if (error) {
        console.error('[Exit Ticket Results] Error loading students:', error);
        return;
      }

      if (!studentsData) return;

      // Filter to only show students with IEP goals
      const studentsWithGoals = studentsData.filter((student: any) => {
        const studentDetails = Array.isArray(student.student_details)
          ? student.student_details[0]
          : student.student_details;
        const iepGoals = student.iep_goals || studentDetails?.iep_goals || [];
        return Array.isArray(iepGoals) && iepGoals.length > 0;
      });

      console.log(`[Exit Ticket Results] Found ${studentsWithGoals.length} students with IEP goals`);
      setStudents(studentsWithGoals);
    } catch (error) {
      console.error('[Exit Ticket Results] Error fetching students:', error);
    } finally {
      setLoadingStudents(false);
    }
  }, [currentSchool]);

  useEffect(() => {
    if (currentSchool) {
      fetchStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSchool]);

  const fetchTickets = useCallback(async (reset = false, pageNumber = 0) => {
    if (!selectedStudentId) return;

    setLoading(true);
    try {
      const offset = pageNumber * ITEMS_PER_PAGE;

      const params = new URLSearchParams();
      if (selectedStudentId !== 'all') {
        params.append('student_id', selectedStudentId);
      }
      if (selectedStudentId === 'all' && currentSchool?.school_id) {
        params.append('school_id', currentSchool.school_id);
      }
      params.append('status', statusFilter);
      params.append('limit', ITEMS_PER_PAGE.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`/api/exit-tickets/results?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch exit tickets');

      const data = await response.json();
      const newTickets = data.tickets || [];

      setTickets(prevTickets => reset ? newTickets : [...prevTickets, ...newTickets]);
      setHasMore(newTickets.length === ITEMS_PER_PAGE);

      // Initialize problem states from existing results
      setProblemStates(prevStates => {
        const initialStates: Record<string, Record<string, ProblemResult>> = reset ? {} : { ...prevStates };
        newTickets.forEach((ticket: ExitTicket) => {
          const ticketStates: Record<string, ProblemResult> = {};
          ticket.results.forEach((result: any) => {
            const key = `${result.problem_index}`;
            ticketStates[key] = {
              problem_index: result.problem_index,
              status: result.status,
              notes: result.notes || undefined,
            };
          });
          initialStates[ticket.id] = ticketStates;
        });
        return initialStates;
      });

    } catch (error) {
      console.error('Error fetching exit tickets:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId, statusFilter, currentSchool]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTickets(false, nextPage);
  }, [page, fetchTickets]);

  useEffect(() => {
    setPage(0);
    if (selectedStudentId) {
      fetchTickets(true, 0);
    }
    // fetchTickets is intentionally omitted to avoid circular dependency
    // The effect should only re-run when these filter values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, statusFilter, currentSchool]);

  const toggleTicket = (ticketId: string) => {
    setExpandedTickets(prev => ({
      ...prev,
      [ticketId]: !prev[ticketId]
    }));
  };

  const updateProblemState = (
    ticketId: string,
    problemIndex: number,
    updates: Partial<ProblemResult>
  ) => {
    const key = `${problemIndex}`;
    setProblemStates(prev => ({
      ...prev,
      [ticketId]: {
        ...prev[ticketId],
        [key]: {
          problem_index: problemIndex,
          status: updates.status !== undefined ? updates.status : prev[ticketId]?.[key]?.status,
          notes: updates.notes !== undefined ? updates.notes : prev[ticketId]?.[key]?.notes,
        }
      }
    }));
  };

  const isCompleteProblemResult = (r: ProblemResult): r is Required<ProblemResult> =>
    r &&
    typeof r.status === 'string' &&
    typeof r.problem_index !== 'undefined';

  const saveResults = async (ticketId: string) => {
    setSaving(ticketId);
    setSuccessMessage(null);

    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;

      const totalProblems = ticket.content.problems?.length || 0;
      const ticketStates = problemStates[ticketId] || {};
      const results = Object.values(ticketStates);

      // Validate: ensure all problems have a status selected
      if (results.length < totalProblems) {
        showToast(`Please grade all ${totalProblems} problems before saving. You've only graded ${results.length}.`, 'error');
        return;
      }

      const unansweredResults = results.filter(r => !r.status);
      if (unansweredResults.length > 0) {
        showToast('Please select a status (Correct/Incorrect/Excluded) for all problems before saving.', 'error');
        return;
      }

      // Validate: ensure notes are provided for incorrect answers
      const invalidResults = results.filter(
        r => r.status === 'incorrect' && (!r.notes || r.notes.trim() === '')
      );

      if (invalidResults.length > 0) {
        showToast('Please provide notes for all problems marked as incorrect.', 'error');
        return;
      }

      const validResults = results.filter(isCompleteProblemResult);

      const response = await fetch('/api/exit-tickets/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exit_ticket_id: ticketId,
          results: validResults,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save results');
      }

      setSuccessMessage('Results saved successfully!');

      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }

      successTimeoutRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successTimeoutRef.current = null;
      }, 3000);

      await fetchTickets(true, 0);
    } catch (error) {
      console.error('Error saving results:', error);
      showToast(error instanceof Error ? error.message : 'Failed to save results', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleDiscard = async (ticketId: string) => {
    try {
      const response = await fetch(`/api/exit-tickets/${ticketId}/discard`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (data.success) {
        showToast(data.message, 'success');
        await fetchTickets(true, 0);
      } else {
        showToast('Failed to update ticket: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Error updating ticket:', error);
      showToast('Failed to update ticket', 'error');
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Exit Ticket Results</h2>
        <p className="text-gray-600">Grade exit ticket problems and track student performance</p>
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
            <option value="all">All Students</option>
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
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'needs_grading' | 'graded' | 'discarded')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="needs_grading">Needs Grading</option>
            <option value="graded">Graded</option>
            <option value="discarded">Discarded</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Loading exit tickets...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && selectedStudentId && tickets.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">No exit tickets found for this student.</p>
        </div>
      )}

      {/* Exit Tickets List */}
      {!loading && selectedStudentId && tickets.length > 0 && (
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const isExpanded = expandedTickets[ticket.id];
            const ticketStates = problemStates[ticket.id] || {};
            const ticketStudent = students.find(s => s.id === ticket.student_id);

            return (
              <div
                key={ticket.id}
                className={`border rounded-lg overflow-hidden ${
                  ticket.discarded_at ? 'border-gray-300 bg-gray-50' : 'border-gray-200'
                }`}
              >
                {/* Ticket Header */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left ${
                    ticket.discarded_at ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-50 hover:bg-gray-100'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset`}
                  onClick={() => toggleTicket(ticket.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {ticketStudent?.initials || 'Unknown'} - Exit Ticket - {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                      {ticket.discarded_at ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-800">
                          Discarded
                        </span>
                      ) : ticket.is_graded ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Graded
                        </span>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiscard(ticket.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDiscard(ticket.id);
                          }
                        }}
                        className={`ml-2 text-xs font-medium ${
                          ticket.discarded_at
                            ? 'text-blue-600 hover:text-blue-800'
                            : 'text-gray-600 hover:text-gray-800'
                        }`}
                      >
                        {ticket.discarded_at ? 'Restore' : 'Discard'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {ticket.content.problems?.length || 0} problem(s)
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Ticket Content */}
                {isExpanded && (
                  <div className="p-4 space-y-6">
                    {/* IEP Goal */}
                    <div className="bg-blue-50 px-4 py-2 rounded-md">
                      <h4 className="text-sm font-semibold text-blue-900">
                        IEP Goal #{ticket.iep_goal_index + 1}: {ticket.iep_goal_text}
                      </h4>
                    </div>

                    {/* Passage (if any) */}
                    {ticket.content.passage && (
                      <div className="bg-gray-50 p-3 rounded-md">
                        <h5 className="text-xs font-medium text-gray-700 mb-1">Reading Passage:</h5>
                        <p className="text-sm text-gray-600">{ticket.content.passage}</p>
                      </div>
                    )}

                    {/* Problems */}
                    {ticket.content.problems?.map((problem, problemIndex) => {
                      const key = `${problemIndex}`;
                      const state = ticketStates[key] || { notes: '' };

                      return (
                        <div key={problemIndex} className="space-y-2 pb-4 border-b border-gray-200 last:border-b-0">
                          <p className="text-sm text-gray-700 font-medium">
                            Problem {problemIndex + 1}: {problem.prompt || problem.question}
                          </p>

                          {problem.options && (
                            <div className="text-xs text-gray-600 ml-2">
                              {problem.options.map((opt, idx) => (
                                <div key={idx}>• {opt}</div>
                              ))}
                            </div>
                          )}

                          {/* Status Selection */}
                          <div className="flex gap-3 mt-2">
                            <label className="inline-flex items-center">
                              <input
                                type="radio"
                                name={`${ticket.id}-${key}`}
                                value="correct"
                                checked={state.status === 'correct'}
                                onChange={() => updateProblemState(ticket.id, problemIndex, { status: 'correct', notes: '' })}
                                className="form-radio text-green-600"
                              />
                              <span className="ml-2 text-sm text-gray-700">Correct</span>
                            </label>

                            <label className="inline-flex items-center">
                              <input
                                type="radio"
                                name={`${ticket.id}-${key}`}
                                value="incorrect"
                                checked={state.status === 'incorrect'}
                                onChange={() => updateProblemState(ticket.id, problemIndex, { status: 'incorrect' })}
                                className="form-radio text-red-600"
                              />
                              <span className="ml-2 text-sm text-gray-700">Incorrect</span>
                            </label>

                            <label className="inline-flex items-center">
                              <input
                                type="radio"
                                name={`${ticket.id}-${key}`}
                                value="excluded"
                                checked={state.status === 'excluded'}
                                onChange={() => updateProblemState(ticket.id, problemIndex, { status: 'excluded', notes: '' })}
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
                                onChange={(e) => updateProblemState(ticket.id, problemIndex, { notes: e.target.value })}
                                placeholder="Explain what the student did/didn't do..."
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Save Button */}
                    <div className="flex justify-end pt-4 border-t">
                      <button
                        onClick={() => saveResults(ticket.id)}
                        disabled={saving === ticket.id}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {saving === ticket.id ? 'Saving...' : 'Save Results'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Load More Button */}
          {hasMore && !loading && (
            <div className="flex justify-center pt-6">
              <button
                onClick={loadMore}
                className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Load More Results
              </button>
            </div>
          )}
        </div>
      )}

      {/* No Student Selected */}
      {!selectedStudentId && !loading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">Please select a student to view their exit tickets.</p>
        </div>
      )}
    </div>
  );
}
