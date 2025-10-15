'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { createClient } from '@/lib/supabase/client';

interface Goal {
  original: string;
  scrubbed: string;
  piiDetected: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface Match {
  studentId: string;
  studentInitials: string;
  studentGrade: string;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;
  goals: Goal[];
}

interface ImportData {
  matches: Match[];
  summary: {
    totalParsed: number;
    matched: number;
    unmatched: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  parseErrors?: Array<{ row: number; message: string }>;
  scrubErrors?: string[];
  unmatchedStudents?: Array<{
    firstName: string;
    lastName: string;
    initials: string;
    grade: string;
    reason: string;
  }>;
}

interface IEPGoalsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ImportData;
  onImportComplete?: () => void;
}

export function IEPGoalsPreviewModal({
  isOpen,
  onClose,
  data,
  onImportComplete
}: IEPGoalsPreviewModalProps) {
  const [selectedGoals, setSelectedGoals] = useState<{ [studentId: string]: number[] }>({});
  const [importing, setImporting] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // Initialize all goals as selected
  useState(() => {
    const initial: { [studentId: string]: number[] } = {};
    data.matches.forEach(match => {
      initial[match.studentId] = match.goals.map((_, idx) => idx);
    });
    setSelectedGoals(initial);
  });

  const toggleGoalSelection = (studentId: string, goalIndex: number) => {
    setSelectedGoals(prev => {
      const current = prev[studentId] || [];
      if (current.includes(goalIndex)) {
        return { ...prev, [studentId]: current.filter(i => i !== goalIndex) };
      } else {
        return { ...prev, [studentId]: [...current, goalIndex] };
      }
    });
  };

  const toggleAllForStudent = (studentId: string) => {
    const match = data.matches.find(m => m.studentId === studentId);
    if (!match) return;

    setSelectedGoals(prev => {
      const current = prev[studentId] || [];
      if (current.length === match.goals.length) {
        // Deselect all
        return { ...prev, [studentId]: [] };
      } else {
        // Select all
        return { ...prev, [studentId]: match.goals.map((_, idx) => idx) };
      }
    });
  };

  const handleImport = async () => {
    setImporting(true);

    try {
      const supabase = createClient();

      // Process each student
      for (const match of data.matches) {
        const selectedIndices = selectedGoals[match.studentId] || [];
        if (selectedIndices.length === 0) continue;

        // Get selected goals
        const goalsToImport = selectedIndices.map(idx => match.goals[idx].scrubbed);

        // Get current student details
        const { data: currentDetails } = await supabase
          .from('student_details')
          .select('iep_goals')
          .eq('student_id', match.studentId)
          .single();

        // Merge with existing goals (avoid duplicates)
        const existingGoals = currentDetails?.iep_goals || [];
        const newGoals = [...existingGoals];

        for (const goal of goalsToImport) {
          // Check for duplicates (simple text comparison)
          if (!newGoals.some(existing => existing.trim().toLowerCase() === goal.trim().toLowerCase())) {
            newGoals.push(goal);
          }
        }

        // Update student details
        const { error } = await supabase
          .from('student_details')
          .upsert({
            student_id: match.studentId,
            iep_goals: newGoals,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'student_id'
          });

        if (error) {
          console.error('Error updating student goals:', error);
          throw error;
        }
      }

      // Success! Close modal and refresh
      if (onImportComplete) {
        onImportComplete();
      }
      onClose();
    } catch (error: any) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const totalSelectedGoals = Object.values(selectedGoals).reduce(
    (sum, indices) => sum + indices.length,
    0
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Review IEP Goals Import
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {data.summary.matched} student{data.summary.matched !== 1 ? 's' : ''} matched •{' '}
                {totalSelectedGoals} goal{totalSelectedGoals !== 1 ? 's' : ''} selected
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
            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="font-medium text-blue-900 mb-2">Import Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-700">Students parsed: {data.summary.totalParsed}</p>
                  <p className="text-green-700">✓ Matched: {data.summary.matched}</p>
                  {data.summary.unmatched > 0 && (
                    <p className="text-orange-700">⚠ Not matched: {data.summary.unmatched}</p>
                  )}
                </div>
                <div>
                  <p className="text-green-700">High confidence: {data.summary.highConfidence}</p>
                  {data.summary.mediumConfidence > 0 && (
                    <p className="text-yellow-700">Medium confidence: {data.summary.mediumConfidence}</p>
                  )}
                  {data.summary.lowConfidence > 0 && (
                    <p className="text-orange-700">Low confidence: {data.summary.lowConfidence}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Unmatched Students Warning */}
            {data.unmatchedStudents && data.unmatchedStudents.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                <h3 className="font-medium text-orange-900 mb-2">
                  ⚠ Students Not Matched ({data.unmatchedStudents.length})
                </h3>
                <div className="space-y-1 text-sm text-orange-800">
                  {data.unmatchedStudents.map((student, idx) => (
                    <p key={idx}>
                      {student.firstName} {student.lastName} ({student.initials}, Grade {student.grade}) - {student.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Matched Students and Goals */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Matched Students & Goals</h3>

              {data.matches.map((match) => {
                const selectedCount = (selectedGoals[match.studentId] || []).length;
                const isExpanded = expandedStudent === match.studentId;

                return (
                  <div
                    key={match.studentId}
                    className="border border-gray-200 rounded-md overflow-hidden"
                  >
                    {/* Student Header */}
                    <div
                      className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => setExpandedStudent(isExpanded ? null : match.studentId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">
                            {match.studentInitials} - Grade {match.studentGrade}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {match.matchReason} • {selectedCount} of {match.goals.length} goals selected
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              match.matchConfidence === 'high'
                                ? 'bg-green-100 text-green-800'
                                : match.matchConfidence === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {match.matchConfidence} confidence
                          </span>
                          <span className="text-gray-400">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Goals List */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-white">
                        <div className="flex justify-between items-center mb-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => toggleAllForStudent(match.studentId)}
                          >
                            {selectedCount === match.goals.length ? 'Deselect All' : 'Select All'}
                          </Button>
                        </div>

                        {match.goals.map((goal, goalIdx) => {
                          const isSelected = (selectedGoals[match.studentId] || []).includes(goalIdx);

                          return (
                            <div
                              key={goalIdx}
                              className={`border rounded-md p-3 ${
                                isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleGoalSelection(match.studentId, goalIdx)}
                                  className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300"
                                />
                                <div className="flex-1 space-y-2">
                                  <div>
                                    <p className="text-sm font-medium text-gray-700">Scrubbed Goal:</p>
                                    <p className="text-sm text-gray-900">{goal.scrubbed}</p>
                                  </div>

                                  {goal.piiDetected.length > 0 && (
                                    <div className="text-xs text-orange-700 bg-orange-50 p-2 rounded">
                                      <p className="font-medium">PII Removed:</p>
                                      <p>{goal.piiDetected.join(', ')}</p>
                                    </div>
                                  )}

                                  {goal.confidence !== 'high' && (
                                    <p className="text-xs text-yellow-700">
                                      ⚠ {goal.confidence} confidence - please review
                                    </p>
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
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center gap-3 px-6 py-4 border-t bg-gray-50">
            <p className="text-sm text-gray-600">
              {totalSelectedGoals} goal{totalSelectedGoals !== 1 ? 's' : ''} will be added
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={importing}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleImport}
                disabled={importing || totalSelectedGoals === 0}
              >
                {importing ? 'Importing...' : `Import ${totalSelectedGoals} Goal${totalSelectedGoals !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
