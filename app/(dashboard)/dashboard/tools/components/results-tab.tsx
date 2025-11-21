'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { loadStudentsForUser, getUserRole } from '@/lib/supabase/queries/sea-students';

interface Student {
  id: string;
  initials: string;
  grade_level: string | number;
}

interface ExitTicketResult {
  id: string;
  student_id: string;
  iep_goal_index: number;
  iep_goal_text: string;
  content: any;
  created_at: string;
  discarded_at: string | null;
  is_graded: boolean;
  result: {
    id: string;
    rating: number;
    notes: string | null;
    graded_at: string;
    graded_by: string;
  } | null;
}

export default function ResultsTab() {
  const { currentSchool } = useSchool();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [tickets, setTickets] = useState<ExitTicketResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // Stores ticket ID being saved
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_grading' | 'graded' | 'discarded'>('needs_grading');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch students on mount and when school changes
  useEffect(() => {
    fetchStudents();
  }, [currentSchool]);

  // Fetch tickets when student or filter changes
  useEffect(() => {
    if (selectedStudentId) {
      fetchTickets();
    } else {
      setTickets([]);
    }
  }, [selectedStudentId, statusFilter]);

  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.error('No authenticated user');
        setStudents([]);
        return;
      }

      // Get user role to determine how to filter students
      const userRole = await getUserRole(user.id);

      if (!userRole) {
        console.error('Failed to get user role');
        setStudents([]);
        return;
      }

      // Load students based on role (SEAs see only assigned students)
      const { data, error } = await loadStudentsForUser(user.id, userRole, {
        currentSchool,
        includeIEPGoals: false
      });

      if (error) {
        console.error('Error loading students:', error);
        setStudents([]);
        return;
      }

      if (data) {
        console.log('Fetched students:', data.length);
        setStudents(data);
        if (data.length > 0 && !selectedStudentId) {
          setSelectedStudentId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error in fetchStudents:', error);
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchTickets = async () => {
    if (!selectedStudentId) return;

    setLoading(true);
    try {
      const filterParam = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const studentParam = selectedStudentId === 'all' ? '' : `student_id=${selectedStudentId}&`;
      const schoolParam = selectedStudentId === 'all' && currentSchool ? `school_id=${currentSchool}&` : '';
      const response = await fetch(`/api/exit-tickets/results?${studentParam}${schoolParam}${filterParam.replace('&', '')}`);
      const data = await response.json();

      if (data.success && data.tickets) {
        setTickets(data.tickets);

        // Initialize ratings and notes from existing results
        const initialRatings: Record<string, number> = {};
        const initialNotes: Record<string, string> = {};

        data.tickets.forEach((ticket: ExitTicketResult) => {
          if (ticket.result) {
            initialRatings[ticket.id] = ticket.result.rating;
            initialNotes[ticket.id] = ticket.result.notes || '';
          }
        });

        setRatings(initialRatings);
        setNotes(initialNotes);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRating = async (ticketId: string) => {
    const rating = ratings[ticketId];

    if (!rating || rating < 1 || rating > 10) {
      alert('Please enter a rating between 1 and 10');
      return;
    }

    setSaving(ticketId);
    try {
      const response = await fetch('/api/exit-tickets/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exit_ticket_id: ticketId,
          rating,
          notes: notes[ticketId] || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage('Result saved successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
        // Refresh tickets to show updated status
        await fetchTickets();
      } else {
        alert('Failed to save result: ' + data.error);
      }
    } catch (error) {
      console.error('Error saving result:', error);
      alert('Failed to save result');
    } finally {
      setSaving(null);
    }
  };

  const handleDiscard = async (ticketId: string, isDiscarded: boolean) => {
    try {
      const response = await fetch(`/api/exit-tickets/${ticketId}/discard`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
        setTimeout(() => setSuccessMessage(null), 3000);
        // Refresh tickets to show updated status
        await fetchTickets();
      } else {
        alert('Failed to update ticket: ' + data.error);
      }
    } catch (error) {
      console.error('Error updating ticket:', error);
      alert('Failed to update ticket');
    }
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const filteredTickets = tickets;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Exit Ticket Results</h2>
        <p className="mt-1 text-sm text-gray-600">
          Record and track student performance on exit tickets
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Student Selector */}
          <div>
            <label htmlFor="student-select" className="block text-sm font-medium text-gray-700 mb-2">
              Select Student
            </label>
            <select
              id="student-select"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={loadingStudents}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              {loadingStudents ? (
                <option value="">Loading students...</option>
              ) : students.length === 0 ? (
                <option value="">No students found</option>
              ) : (
                <>
                  <option value="">Choose a student...</option>
                  <option value="all">All Students</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.initials}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Status Filter
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'needs_grading' | 'graded' | 'discarded')}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="needs_grading">Needs Grading</option>
              <option value="graded">Graded</option>
              <option value="discarded">Discarded</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      </div>

      {/* Exit Tickets List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-500">Loading exit tickets...</p>
        </div>
      ) : !selectedStudentId ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">Select a student to view their exit tickets</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">
            No exit tickets found for {selectedStudent?.initials}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {statusFilter === 'needs_grading' && 'Try changing the filter to see graded tickets'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((ticket) => {
            const ticketStudent = students.find(s => s.id === ticket.student_id);
            return (
            <div
              key={ticket.id}
              className={`bg-white border rounded-lg p-6 hover:shadow-md transition-shadow ${
                ticket.discarded_at ? 'border-gray-300 bg-gray-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {ticketStudent?.initials || 'Unknown'} - Exit Ticket
                    </h3>
                    {ticket.discarded_at ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Discarded
                      </span>
                    ) : ticket.is_graded ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Graded
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Needs Grading
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-500">
                      Generated: {new Date(ticket.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    <button
                      onClick={() => handleDiscard(ticket.id, !!ticket.discarded_at)}
                      className={`text-xs font-medium ${
                        ticket.discarded_at
                          ? 'text-blue-600 hover:text-blue-800'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {ticket.discarded_at ? 'Restore' : 'Discard'}
                    </button>
                  </div>
                </div>
              </div>

              {/* IEP Goal */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <h4 className="text-xs font-medium text-blue-900 mb-1">IEP Goal #{ticket.iep_goal_index + 1}</h4>
                <p className="text-sm text-blue-800 line-clamp-2" title={ticket.iep_goal_text}>
                  {ticket.iep_goal_text}
                </p>
              </div>

              {/* Rating Section */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Rating Input */}
                  <div>
                    <label htmlFor={`rating-${ticket.id}`} className="block text-sm font-medium text-gray-700 mb-2">
                      Rating (1-10)
                    </label>
                    <input
                      id={`rating-${ticket.id}`}
                      type="number"
                      min="1"
                      max="10"
                      value={ratings[ticket.id] || ''}
                      onChange={(e) => setRatings({ ...ratings, [ticket.id]: parseInt(e.target.value) || 0 })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="1-10"
                      disabled={saving === ticket.id}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      How well did this work meet the goal standard?
                    </p>
                  </div>

                  {/* Notes */}
                  <div>
                    <label htmlFor={`notes-${ticket.id}`} className="block text-sm font-medium text-gray-700 mb-2">
                      Notes (Optional)
                    </label>
                    <textarea
                      id={`notes-${ticket.id}`}
                      rows={2}
                      value={notes[ticket.id] || ''}
                      onChange={(e) => setNotes({ ...notes, [ticket.id]: e.target.value })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="Optional observations..."
                      disabled={saving === ticket.id}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => handleSubmitRating(ticket.id)}
                    disabled={saving === ticket.id || !ratings[ticket.id]}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {saving === ticket.id ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : ticket.is_graded ? (
                      'Update Result'
                    ) : (
                      'Submit Result'
                    )}
                  </button>

                  {ticket.is_graded && ticket.result && (
                    <div className="text-sm text-gray-500">
                      Last updated: {new Date(ticket.result.graded_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
