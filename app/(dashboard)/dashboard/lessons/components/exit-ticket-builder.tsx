'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import ExitTicketDisplay from './exit-ticket-display';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface Student {
  id: string;
  initials: string;
  grade_level: number;
  school_id?: string;
}

interface ExitTicket {
  id: string;
  student_id: string;
  student_initials: string;
  student_grade: number;
  iep_goal_text: string;
  content: any;
  created_at: string;
}

export default function ExitTicketBuilder() {
  const { showToast } = useToast();
  const { currentSchool } = useSchool();
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [generatedTickets, setGeneratedTickets] = useState<ExitTicket[]>([]);
  const [showDisplay, setShowDisplay] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentSchool) {
      loadStudents();
    }
  }, [currentSchool]);

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
      let query = supabase
        .from('students')
        .select(`
          id,
          initials,
          grade_level,
          school_id,
          student_details(iep_goals)
        `)
        .eq('provider_id', user.id)
        .order('initials');

      if (currentSchool.school_id) {
        query = query.eq('school_id', currentSchool.school_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading students:', error);
        showToast('Failed to load students', 'error');
        return;
      }

      if (data) {
        // Filter to only show students with IEP goals
        const studentsWithGoals = data.filter(s => {
          const details = s.student_details as any;
          return details &&
            details.iep_goals &&
            Array.isArray(details.iep_goals) &&
            details.iep_goals.length > 0;
        });
        console.log(`Found ${studentsWithGoals.length} students with IEP goals out of ${data.length} total students`);
        setStudents(studentsWithGoals);
      }
    }
  }

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
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

    if (selectedStudentIds.length > 7) {
      showToast('Please select no more than 7 students for exit tickets', 'error');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('Preparing exit tickets...');

    try {
      setGenerationProgress('Generating AI-powered problems...');
      const response = await fetch('/api/exit-tickets/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentIds: selectedStudentIds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate exit tickets');
      }

      const data = await response.json();

      if (data.warning) {
        showToast(data.warning, 'warning');
      }

      setGenerationProgress('Finalizing exit tickets...');
      setGeneratedTickets(data.tickets);
      setShowDisplay(true);
      showToast(`${data.message || 'Exit tickets generated successfully!'}`, 'success');
    } catch (error: any) {
      console.error('Error generating exit tickets:', error);
      showToast(error.message || 'Failed to generate exit tickets', 'error');
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  if (showDisplay && generatedTickets.length > 0) {
    return (
      <ExitTicketDisplay
        tickets={generatedTickets}
        onBack={() => {
          setShowDisplay(false);
          setGeneratedTickets([]);
          setSelectedStudentIds([]);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Exit Ticket Generator</h2>
        <p className="text-gray-600">
          Generate quick 3-5 minute assessments targeting individual IEP goals for your students.
          Exit tickets automatically rotate through each student's goals.
        </p>
      </div>

      <div className="space-y-4">
        {/* Student Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Students (max 7)
          </label>

          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <span className="block truncate">
                {selectedStudentIds.length === 0
                  ? 'Select students...'
                  : `${selectedStudentIds.length} student${selectedStudentIds.length !== 1 ? 's' : ''} selected`}
              </span>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <ChevronDownIcon className="h-5 w-5 text-gray-400" />
              </span>
            </button>

            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-96 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                {students.length === 0 ? (
                  <div className="text-gray-500 px-3 py-2">
                    No students with IEP goals found
                  </div>
                ) : (
                  students.map((student) => (
                    <div
                      key={student.id}
                      onClick={() => handleStudentToggle(student.id)}
                      className={`cursor-pointer select-none relative py-2 pl-10 pr-4 hover:bg-gray-50 ${
                        selectedStudentIds.includes(student.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <span className="block truncate">
                        {student.initials} - Grade {student.grade_level}
                      </span>
                      {selectedStudentIds.includes(student.id) && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Students Display */}
          {selectedStudentIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedStudentIds.map((id) => {
                const student = students.find(s => s.id === id);
                if (!student) return null;

                return (
                  <span
                    key={id}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    {student.initials} (Grade {student.grade_level})
                    <button
                      type="button"
                      onClick={() => removeStudent(id)}
                      className="ml-2 inline-flex items-center justify-center w-4 h-4 text-blue-600 hover:text-blue-800"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">How it works:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Each student gets a personalized exit ticket targeting one of their IEP goals</li>
            <li>• Goals automatically rotate - each ticket targets the next goal in sequence</li>
            <li>• Tickets contain 2-4 problems designed for 3-5 minutes of independent work</li>
            <li>• Student initials and date are displayed, but the IEP goal remains hidden</li>
          </ul>
        </div>

        {/* Generate Button */}
        <div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || selectedStudentIds.length === 0}
            className={`
              w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white
              ${isGenerating || selectedStudentIds.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }
            `}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {generationProgress || 'Generating Exit Tickets...'}
              </>
            ) : (
              'Generate Exit Tickets'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}