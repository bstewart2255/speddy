'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

interface ScheduleData {
  sessionsPerWeek: number;
  minutesPerSession: number;
  weeklyMinutes: number;
  frequency: string;
}

interface TeacherMatch {
  teacherId: string | null;
  teacherName: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

interface GoalChange {
  added: string[];
  removed: string[];
  unchanged: string[];
}

interface StudentChanges {
  goals?: GoalChange;
  schedule?: {
    old: { sessionsPerWeek?: number; minutesPerSession?: number } | null;
    new: { sessionsPerWeek: number; minutesPerSession: number } | null;
  };
  teacher?: {
    old: { teacherId?: string; teacherName?: string } | null;
    new: { teacherId: string | null; teacherName: string | null } | null;
  };
}

interface StudentPreview {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  goals?: Array<{
    scrubbed: string;
    piiDetected: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  // UPSERT action
  action?: 'insert' | 'update' | 'skip';
  // Legacy field for backward compatibility
  matchStatus?: 'new' | 'duplicate';
  // Student ID - used in Deliveries-only mode (studentId) or normal mode (matchedStudentId)
  studentId?: string;
  matchedStudentId?: string;
  matchedStudentInitials?: string;
  matchConfidence?: 'high' | 'medium' | 'low';
  matchReason?: string;
  // Changes tracking for updates
  changes?: StudentChanges;
  // Warning if goals are being removed
  goalsRemoved?: string[];
  // New fields from multi-file upload
  schedule?: ScheduleData;
  teacher?: TeacherMatch;
}

interface UnmatchedStudent {
  name: string;
  source: 'deliveries' | 'classList';
}

interface ImportData {
  students: StudentPreview[];
  summary: {
    total: number;
    // Legacy fields
    new: number;
    duplicates: number;
    // UPSERT counts
    inserts?: number;
    updates?: number;
    skips?: number;
    withGoalsRemoved?: number;
    // Enrichment counts
    withSchedule?: number;
    withTeacher?: number;
    // School filtering (for multi-school users)
    filteredOutBySchool?: number;
    filteredOutSchools?: string[];
  };
  unmatchedStudents?: UnmatchedStudent[];
  parseErrors?: Array<{ row: number; message: string }>;
  parseWarnings?: Array<{ row: number; message: string; source?: string }>;
  scrubErrors?: string[];
}

interface StudentImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ImportData;
  onImportComplete?: () => void;
  currentSchool?: any; // Current school context for assignment
}

export function StudentImportPreviewModal({
  isOpen,
  onClose,
  data,
  onImportComplete,
  currentSchool
}: StudentImportPreviewModalProps) {
  // Track edited initials for each student
  const [editedInitials, setEditedInitials] = useState<{ [index: number]: string }>({});

  // Track which students are selected for import
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(() => {
    // By default, select all students with insert or update actions (not skips)
    const selected = new Set<number>();
    data.students.forEach((student, idx) => {
      // Use action field if available, otherwise fall back to matchStatus
      const action = student.action || (student.matchStatus === 'new' ? 'insert' : 'skip');
      if (action === 'insert' || action === 'update') {
        selected.add(idx);
      }
    });
    return selected;
  });

  // Track which goals are selected for each student
  const [selectedGoals, setSelectedGoals] = useState<{ [studentIndex: number]: Set<number> }>(() => {
    // By default, select all goals for all students
    const goalSelections: { [studentIndex: number]: Set<number> } = {};
    data.students.forEach((student, idx) => {
      // Goals may not exist in update mode (deliveries/classList only)
      const goals = student.goals || [];
      goalSelections[idx] = new Set(goals.map((_, goalIdx) => goalIdx));
    });
    return goalSelections;
  });

  // Track expanded students to show goals
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);

  // Track collapsed state for info sections (collapsed by default)
  const [unmatchedExpanded, setUnmatchedExpanded] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getInitials = (index: number) => {
    return editedInitials[index] || data.students[index].initials;
  };

  const handleInitialsChange = (index: number, value: string) => {
    // Only allow 2-4 uppercase letters
    const cleaned = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    setEditedInitials(prev => ({ ...prev, [index]: cleaned }));
  };

  const toggleStudentSelection = (index: number) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === data.students.length) {
      // Deselect all
      setSelectedStudents(new Set());
    } else {
      // Select all
      setSelectedStudents(new Set(data.students.map((_, idx) => idx)));
    }
  };

  const toggleGoalSelection = (studentIndex: number, goalIndex: number) => {
    setSelectedGoals(prev => {
      const studentGoals = new Set(prev[studentIndex] || new Set());
      if (studentGoals.has(goalIndex)) {
        studentGoals.delete(goalIndex);
      } else {
        studentGoals.add(goalIndex);
      }
      return { ...prev, [studentIndex]: studentGoals };
    });
  };

  const toggleAllGoalsForStudent = (studentIndex: number) => {
    const student = data.students[studentIndex];
    const goals = student.goals || [];
    const currentlySelected = selectedGoals[studentIndex] || new Set();

    setSelectedGoals(prev => {
      if (currentlySelected.size === goals.length) {
        // Deselect all goals
        return { ...prev, [studentIndex]: new Set() };
      } else {
        // Select all goals
        return {
          ...prev,
          [studentIndex]: new Set(goals.map((_, idx) => idx))
        };
      }
    });
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      // Prepare students for import with UPSERT action
      const studentsToImport = Array.from(selectedStudents).map(idx => {
        const student = data.students[idx];
        const studentSelectedGoals = selectedGoals[idx] || new Set();

        // Only include selected goals (goals may not exist in update mode)
        const goals = student.goals || [];
        const goalsToImport = Array.from(studentSelectedGoals)
          .sort((a, b) => a - b) // Keep original order
          .filter(goalIdx => goalIdx < goals.length)
          .map(goalIdx => goals[goalIdx].scrubbed);

        // Determine action based on student.action or matchStatus
        // - 'new' students default to insert
        // - matched/duplicate students default to skip (not insert, to avoid duplicates)
        const action = student.action || (student.matchStatus === 'new' ? 'insert' : 'skip');

        return {
          firstName: student.firstName,
          lastName: student.lastName,
          initials: getInitials(idx),
          gradeLevel: student.gradeLevel,
          goals: goalsToImport,
          // UPSERT fields
          action,
          studentId: student.matchedStudentId || student.studentId, // For update actions (matchedStudentId for normal mode, studentId for Deliveries-only mode)
          // Include current school context for assignment
          schoolId: currentSchool?.school_id,
          schoolSite: currentSchool?.school_site,
          districtId: currentSchool?.district_id,
          stateId: currentSchool?.state_id,
          // Include schedule data from Deliveries file
          sessionsPerWeek: student.schedule?.sessionsPerWeek,
          minutesPerSession: student.schedule?.minutesPerSession,
          // Include teacher assignment from Class List file
          teacherId: student.teacher?.teacherId || undefined,
          teacherName: student.teacher?.teacherName || undefined
        };
      });

      // Call confirmation API
      const response = await fetch('/api/import-students/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: studentsToImport })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import students');
      }

      // Check for partial failures
      const failed = result.data.results.filter((r: any) => !r.success);
      if (failed.length > 0) {
        const errorMessages = failed.map((r: any) => `${r.initials}: ${r.error}`).join(', ');
        setError(`Some students failed to import: ${errorMessages}`);

        // Still close if some succeeded
        if (result.data.summary.succeeded > 0) {
          setTimeout(() => {
            if (onImportComplete) {
              onImportComplete();
            }
            onClose();
          }, 3000);
        }
      } else {
        // All succeeded
        if (onImportComplete) {
          onImportComplete();
        }
        onClose();
      }
    } catch (err: any) {
      console.error('Import failed:', err);
      setError(err.message || 'Failed to import students. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  const selectedCount = selectedStudents.size;
  const totalGoals = Array.from(selectedStudents).reduce(
    (sum, idx) => {
      const studentSelectedGoals = selectedGoals[idx] || new Set();
      return sum + studentSelectedGoals.size;
    },
    0
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Review Student Import
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {selectedCount} student{selectedCount !== 1 ? 's' : ''} selected •{' '}
                {totalGoals} total IEP goal{totalGoals !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 text-2xl font-light leading-none pb-1"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Summary - compact with better contrast */}
            <div className="border border-gray-200 rounded-md p-3 bg-white">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="text-gray-700 font-medium">{data.summary.total} students</span>
                <span className="text-gray-300">|</span>
                {data.summary.inserts !== undefined ? (
                  <>
                    <span className="text-green-600">+{data.summary.inserts} new</span>
                    <span className="text-blue-600">↻{data.summary.updates || 0} update</span>
                    {(data.summary.skips || 0) > 0 && (
                      <span className="text-gray-400">○{data.summary.skips} unchanged</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-green-600">✓ {data.summary.new} new</span>
                    {data.summary.duplicates > 0 && (
                      <span className="text-orange-600">⚠ {data.summary.duplicates} duplicates</span>
                    )}
                  </>
                )}
              </div>
              {/* Filtered out info */}
              {data.summary.filteredOutBySchool !== undefined && data.summary.filteredOutBySchool > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  ℹ️ {data.summary.filteredOutBySchool} student{data.summary.filteredOutBySchool !== 1 ? 's' : ''} from other school{data.summary.filteredOutSchools && data.summary.filteredOutSchools.length !== 1 ? 's' : ''} filtered out
                  {data.summary.filteredOutSchools && data.summary.filteredOutSchools.length > 0 && (
                    <span> ({data.summary.filteredOutSchools.join(', ')})</span>
                  )}
                </div>
              )}
            </div>

            {/* Unmatched Students Warning - Collapsible */}
            {data.unmatchedStudents && data.unmatchedStudents.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md">
                <button
                  type="button"
                  onClick={() => setUnmatchedExpanded(!unmatchedExpanded)}
                  aria-expanded={unmatchedExpanded}
                  aria-controls="unmatched-students-content"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-yellow-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {unmatchedExpanded ? (
                      <ChevronDown className="h-4 w-4 text-yellow-700" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-yellow-700" />
                    )}
                    <h3 className="font-medium text-yellow-900">Unmatched Students</h3>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                      {data.unmatchedStudents.length}
                    </span>
                  </div>
                  <span className="text-xs text-yellow-600">
                    {unmatchedExpanded ? 'Click to collapse' : 'Click to expand'}
                  </span>
                </button>
                {unmatchedExpanded && (
                  <div id="unmatched-students-content" className="px-4 pb-3 pt-0">
                    <p className="text-sm text-yellow-700 mb-2">
                      Found in Deliveries or Class List files but not in the Student Goals file:
                    </p>
                    <div className="max-h-32 overflow-y-auto">
                      <ul className="text-sm text-yellow-800 space-y-1">
                        {data.unmatchedStudents.map((s, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                              {s.source === 'deliveries' ? 'Deliveries' : 'Class List'}
                            </span>
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Errors/Warnings */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Warnings - Collapsible */}
            {data.parseWarnings && data.parseWarnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md">
                <button
                  type="button"
                  onClick={() => setWarningsExpanded(!warningsExpanded)}
                  aria-expanded={warningsExpanded}
                  aria-controls="warnings-content"
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-yellow-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {warningsExpanded ? (
                      <ChevronDown className="h-4 w-4 text-yellow-700" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-yellow-700" />
                    )}
                    <h3 className="font-medium text-yellow-900">Warnings</h3>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                      {data.parseWarnings.length}
                    </span>
                  </div>
                  <span className="text-xs text-yellow-600">
                    {warningsExpanded ? 'Click to collapse' : 'Click to expand'}
                  </span>
                </button>
                {warningsExpanded && (
                  <div id="warnings-content" className="px-4 pb-3 pt-0 max-h-48 overflow-y-auto">
                    <div className="space-y-1 text-sm text-yellow-800">
                      {data.parseWarnings.map((warning, idx) => (
                        <p key={idx}>Row {warning.row}: {warning.message}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Students List */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-gray-900">Students to Import</h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={toggleSelectAll}
                >
                  {selectedStudents.size === data.students.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div className="space-y-2">
                {data.students.map((student, idx) => {
                  const isSelected = selectedStudents.has(idx);
                  const isExpanded = expandedStudent === idx;
                  const currentInitials = getInitials(idx);

                  return (
                    <div
                      key={idx}
                      className={`border rounded-md overflow-hidden ${
                        student.action === 'skip'
                          ? 'border-gray-200 bg-gray-50 opacity-60'
                          : isSelected
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      {/* Student Row */}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStudentSelection(idx)}
                            disabled={student.action === 'skip'}
                            className={`mt-1 h-4 w-4 rounded border-gray-300 ${
                              student.action === 'skip' ? 'opacity-50 cursor-not-allowed' : 'text-blue-600'
                            }`}
                          />

                          <div className="flex-1 grid grid-cols-6 gap-3">
                            {/* Name */}
                            <div>
                              <p className="text-xs text-gray-500">Name</p>
                              <p className="text-sm font-medium text-gray-900">
                                {student.firstName} {student.lastName}
                              </p>
                            </div>

                            {/* Initials (Editable) */}
                            <div>
                              <p className="text-xs text-gray-500">Initials</p>
                              <input
                                type="text"
                                value={currentInitials}
                                onChange={(e) => handleInitialsChange(idx, e.target.value)}
                                className="text-sm font-medium border border-gray-300 rounded px-2 py-1 w-16"
                                maxLength={4}
                                placeholder="XX"
                              />
                            </div>

                            {/* Grade */}
                            <div>
                              <p className="text-xs text-gray-500">Grade</p>
                              <p className="text-sm font-medium text-gray-900">{student.gradeLevel}</p>
                            </div>

                            {/* Schedule */}
                            <div>
                              <p className="text-xs text-gray-500">Schedule</p>
                              {student.schedule ? (
                                <p className="text-sm font-medium text-gray-900">
                                  {student.schedule.sessionsPerWeek}x/{student.schedule.minutesPerSession}min
                                </p>
                              ) : (
                                <p className="text-sm text-gray-400 italic">Not set</p>
                              )}
                            </div>

                            {/* Teacher */}
                            <div>
                              <p className="text-xs text-gray-500">Teacher</p>
                              {student.teacher ? (
                                <div className="flex items-center gap-1">
                                  <p className="text-sm font-medium text-gray-900 truncate" title={student.teacher.teacherName || undefined}>
                                    {student.teacher.teacherName || 'Unknown'}
                                  </p>
                                  {student.teacher.confidence === 'none' && (
                                    <span className="text-yellow-600" title={student.teacher.reason}>⚠</span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-400 italic">Not set</p>
                              )}
                            </div>

                            {/* Goals Count - only show if student has goals */}
                            {(student.goals?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-xs text-gray-500">IEP Goals</p>
                                <button
                                  onClick={() => setExpandedStudent(isExpanded ? null : idx)}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <span>
                                    {(selectedGoals[idx] || new Set()).size}/{(student.goals || []).length}
                                  </span>
                                  {(selectedGoals[idx] || new Set()).size > 0 &&
                                    (selectedGoals[idx] || new Set()).size < (student.goals || []).length && (
                                      <span className="text-yellow-600" title="Some goals deselected">⚠</span>
                                    )}
                                  {isExpanded ? '▼' : '▶'}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Action Badge */}
                          <div className="flex flex-col items-end gap-1">
                            {/* Show action badge */}
                            {student.action === 'insert' ? (
                              <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                                New
                              </span>
                            ) : student.action === 'update' ? (
                              <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                                Update
                              </span>
                            ) : student.action === 'skip' ? (
                              <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                                No Changes
                              </span>
                            ) : student.matchStatus === 'duplicate' ? (
                              <span
                                className={`text-xs px-2 py-1 rounded ${
                                  student.matchConfidence === 'high'
                                    ? 'bg-red-100 text-red-800'
                                    : student.matchConfidence === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-orange-100 text-orange-800'
                                }`}
                                title={student.matchReason}
                              >
                                Possible Duplicate
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Update info - show what will change */}
                        {student.action === 'update' && student.matchedStudentInitials && (
                          <div className="mt-2 text-xs text-blue-700 bg-blue-50 p-2 rounded">
                            ↻ Updating existing student: {student.matchedStudentInitials}
                            {student.changes && (
                              <span className="ml-2">
                                ({[
                                  student.changes.goals && 'goals',
                                  student.changes.schedule && 'schedule',
                                  student.changes.teacher && 'teacher'
                                ].filter(Boolean).join(', ')})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Goal removal warning - show which goals will be removed */}
                        {student.goalsRemoved && student.goalsRemoved.length > 0 && (
                          <div className="mt-2 text-xs text-orange-700 bg-orange-50 p-2 rounded">
                            <p className="font-medium mb-1">⚠ The following goals will be removed:</p>
                            <ul className="list-disc list-inside space-y-0.5 max-h-20 overflow-y-auto">
                              {student.goalsRemoved.map((goal, gIdx) => (
                                <li key={gIdx} className="truncate" title={goal}>{goal}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Legacy duplicate warning (fallback) */}
                        {!student.action && student.matchStatus === 'duplicate' && (
                          <div className="mt-2 text-xs text-orange-700 bg-orange-50 p-2 rounded">
                            ⚠ Matches existing student: {student.matchedStudentInitials} ({student.matchReason})
                          </div>
                        )}

                        {/* No Goals Selected Warning - only show if student has goals */}
                        {isSelected && (student.goals?.length ?? 0) > 0 && (selectedGoals[idx] || new Set()).size === 0 && (
                          <div className="mt-2 text-xs text-red-700 bg-red-50 p-2 rounded">
                            ⚠ No IEP goals selected - student will be imported without any goals
                          </div>
                        )}
                      </div>

                      {/* Expanded Goals - only show if student has goals */}
                      {isExpanded && (student.goals?.length ?? 0) > 0 && (
                        <div className="px-4 pb-4 space-y-3 bg-white border-t">
                          <div className="flex justify-between items-center mt-3">
                            <p className="text-xs font-medium text-gray-700">IEP Goals:</p>
                            <button
                              onClick={() => toggleAllGoalsForStudent(idx)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {(selectedGoals[idx] || new Set()).size === student.goals!.length
                                ? 'Deselect All'
                                : 'Select All'}
                            </button>
                          </div>
                          {student.goals!.map((goal, goalIdx) => {
                            const isGoalSelected = (selectedGoals[idx] || new Set()).has(goalIdx);
                            return (
                              <div
                                key={goalIdx}
                                className={`flex items-start gap-3 p-3 rounded border ${
                                  isGoalSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isGoalSelected}
                                  onChange={() => toggleGoalSelection(idx, goalIdx)}
                                  className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 flex-shrink-0"
                                />
                                <div className="flex-1 text-sm">
                                  <p className="text-gray-900">{goal.scrubbed}</p>
                                  {goal.piiDetected.length > 0 && (
                                    <p className="text-xs text-orange-600 mt-1">
                                      PII removed: {goal.piiDetected.join(', ')}
                                    </p>
                                  )}
                                  {goal.confidence !== 'high' && (
                                    <p className="text-xs text-yellow-700 mt-1">
                                      ⚠ {goal.confidence} confidence - please review
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
              <p className="font-medium">What happens next?</p>
              <ul className="list-disc list-inside space-y-1 mt-1 ml-2">
                <li><span className="text-green-700 font-medium">New</span> students will be created with their data</li>
                <li><span className="text-blue-700 font-medium">Update</span> students will have their data synced from the import file</li>
                <li><span className="text-gray-500 font-medium">No Changes</span> students are already up to date</li>
                <li>Goals marked for removal (⚠) will be replaced by the import file</li>
                <li>You can edit all student details after import</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center gap-3 px-6 py-4 border-t bg-gray-50">
            <div className="text-sm text-gray-600">
              {(() => {
                // Calculate counts for selected students by action
                const selectedInserts = Array.from(selectedStudents).filter(idx => {
                  const s = data.students[idx];
                  return s.action === 'insert' || (!s.action && s.matchStatus === 'new');
                }).length;
                const selectedUpdates = Array.from(selectedStudents).filter(idx =>
                  data.students[idx].action === 'update'
                ).length;

                if (selectedInserts > 0 && selectedUpdates > 0) {
                  return `${selectedInserts} new + ${selectedUpdates} update${selectedUpdates !== 1 ? 's' : ''} • ${totalGoals} goal${totalGoals !== 1 ? 's' : ''}`;
                } else if (selectedUpdates > 0) {
                  return `${selectedUpdates} student${selectedUpdates !== 1 ? 's' : ''} to update • ${totalGoals} goal${totalGoals !== 1 ? 's' : ''}`;
                } else {
                  return `${selectedCount} student${selectedCount !== 1 ? 's' : ''} • ${totalGoals} goal${totalGoals !== 1 ? 's' : ''}`;
                }
              })()}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={importing}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
              >
                {importing ? 'Processing...' : `Confirm ${selectedCount} Student${selectedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
