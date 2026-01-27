'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Card, StatCard, CardGrid } from '../ui/card';
import { Badge } from '../ui/badge';
import { getStudentProgressData, StudentProgressData, GoalSummary, TimelineItem } from '../../../lib/supabase/queries/student-details';
import { AddManualProgressModal } from './add-manual-progress-modal';

interface ManualProgressEntry {
  id: string;
  student_id: string;
  iep_goal_index: number;
  score: number;
  observation_date: string;
  source?: string;
  notes?: string;
}

interface StudentProgressTabProps {
  studentId: string;
  iepGoals: string[];
  schoolId?: string;
  districtId?: string;
  stateId?: string;
  readOnly?: boolean;
}

function getAccuracyColor(accuracy: number | null): string {
  if (accuracy === null) return 'text-gray-500';
  if (accuracy >= 80) return 'text-green-600';
  if (accuracy >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getAccuracyBgColor(accuracy: number | null): string {
  if (accuracy === null) return 'bg-gray-100';
  if (accuracy >= 80) return 'bg-green-50';
  if (accuracy >= 60) return 'bg-yellow-50';
  return 'bg-red-50';
}

export function StudentProgressTab({ studentId, iepGoals, schoolId, districtId, stateId, readOnly = false }: StudentProgressTabProps) {
  const [progressData, setProgressData] = useState<StudentProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGoalIndex, setSelectedGoalIndex] = useState<number>(0);
  const [selectedEntry, setSelectedEntry] = useState<ManualProgressEntry | null>(null);

  // Create stable key from iepGoals array to prevent unnecessary re-renders
  const iepGoalsKey = useMemo(() => iepGoals.join('|'), [iepGoals]);

  const loadProgressData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStudentProgressData(studentId, iepGoals);
      setProgressData(data);
    } catch (err) {
      console.error('Error loading progress data:', err);
      setError('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  }, [studentId, iepGoals]);

  useEffect(() => {
    loadProgressData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, iepGoalsKey, refreshKey]);

  const handleAddProgress = (goalIndex: number) => {
    setSelectedGoalIndex(goalIndex);
    setSelectedEntry(null);
    setModalOpen(true);
  };

  const handleEditProgress = (item: TimelineItem) => {
    if (item.type !== 'manual') return;

    setSelectedGoalIndex(item.goalIndex);
    setSelectedEntry({
      id: item.id,
      student_id: studentId,
      iep_goal_index: item.goalIndex,
      score: item.score || 0,
      observation_date: item.date,
      source: item.source,
      notes: item.notes,
    });
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedEntry(null);
  };

  const handleSave = () => {
    // Refresh data after save
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading progress data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!progressData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No progress data available</p>
      </div>
    );
  }

  const { goalSummaries, totals, timeline } = progressData;
  const activeGoalsCount = goalSummaries.filter(g =>
    g.progressCheckCount > 0 || g.exitTicketCount > 0 || g.manualProgressCount > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div>
        <h3 className="font-medium text-gray-900 mb-3">Summary (All-Time)</h3>
        <CardGrid columns={3} gap="sm">
          <StatCard
            title="Total Assessments"
            value={totals.totalAssessments}
            description="Progress checks + exit tickets"
          />
          <StatCard
            title="Overall Accuracy"
            value={totals.overallAccuracy !== null ? `${totals.overallAccuracy}%` : '--'}
            description={totals.totalGraded > 0
              ? `${totals.totalCorrect}/${totals.totalGraded} correct`
              : 'No graded items'
            }
          />
          <StatCard
            title="Active Goals"
            value={`${activeGoalsCount}/${iepGoals.length}`}
            description="Goals with assessments"
          />
        </CardGrid>
      </div>

      {/* Per-Goal Breakdown */}
      {goalSummaries.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Per-Goal Breakdown</h3>
          <div className="space-y-3">
            {goalSummaries.map((goal) => (
              <GoalBreakdownCard
                key={goal.goalIndex}
                goal={goal}
                onAddProgress={() => handleAddProgress(goal.goalIndex)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}

      {/* No goals message */}
      {goalSummaries.length === 0 && (
        <div className="text-center py-4 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No IEP goals have been added yet</p>
        </div>
      )}

      {/* Timeline */}
      <div>
        <h3 className="font-medium text-gray-900 mb-3">Last 30 Days</h3>
        {timeline.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No assessments in the last 30 days</p>
          </div>
        ) : (
          <div className="space-y-2">
            {timeline.map((item) => (
              <TimelineItemCard
                key={item.id}
                item={item}
                onEdit={item.type === 'manual' && !readOnly ? () => handleEditProgress(item) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Manual Progress Modal */}
      {!readOnly && (
        <AddManualProgressModal
          isOpen={modalOpen}
          onClose={handleModalClose}
          onSave={handleSave}
          studentId={studentId}
          goalIndex={selectedGoalIndex}
          goalText={iepGoals[selectedGoalIndex] || `Goal ${selectedGoalIndex + 1}`}
          entry={selectedEntry}
          schoolId={schoolId}
          districtId={districtId}
          stateId={stateId}
        />
      )}
    </div>
  );
}

function GoalBreakdownCard({ goal, onAddProgress, readOnly = false }: { goal: GoalSummary; onAddProgress: () => void; readOnly?: boolean }) {
  const hasAnyData = goal.progressCheckCount > 0 || goal.exitTicketCount > 0 || goal.manualProgressCount > 0;

  return (
    <Card padding="sm" className="border border-gray-200">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                Goal #{goal.goalIndex + 1}
              </span>
              {!readOnly && (
                <button
                  onClick={onAddProgress}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                  title="Add manual progress"
                  aria-label="Add manual progress"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
              {goal.goalText}
            </p>
          </div>
          {hasAnyData && (
            <div className={`px-3 py-1 rounded-full ${getAccuracyBgColor(goal.combinedAccuracy)}`}>
              <span className={`text-lg font-semibold ${getAccuracyColor(goal.combinedAccuracy)}`}>
                {goal.combinedAccuracy !== null ? `${goal.combinedAccuracy}%` : '--'}
              </span>
            </div>
          )}
        </div>

        {hasAnyData && (
          <div className="flex flex-wrap gap-4 text-sm pt-1">
            {/* Progress Check stats */}
            {goal.progressCheckCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Badge variant="default">PC</Badge>
                <span className={getAccuracyColor(goal.progressCheckAccuracy)}>
                  {goal.progressCheckAccuracy !== null
                    ? `${goal.progressCheckAccuracy}%`
                    : '--'}
                </span>
                <span className="text-gray-400">
                  ({goal.progressCheckCorrect}/{goal.progressCheckTotal})
                </span>
              </div>
            )}

            {/* Exit Ticket stats */}
            {goal.exitTicketCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-purple-100 text-purple-800">ET</Badge>
                <span className={getAccuracyColor(goal.exitTicketAccuracy)}>
                  {goal.exitTicketAccuracy !== null
                    ? `${goal.exitTicketAccuracy}%`
                    : '--'}
                </span>
                <span className="text-gray-400">
                  ({goal.exitTicketCorrect}/{goal.exitTicketTotal})
                </span>
              </div>
            )}

            {/* Manual Progress stats */}
            {goal.manualProgressCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-gray-100 text-gray-700">Manual</Badge>
                <span className={getAccuracyColor(goal.manualProgressAverage)}>
                  {goal.manualProgressAverage !== null
                    ? `${goal.manualProgressAverage}%`
                    : '--'}
                </span>
                <span className="text-gray-400">
                  ({goal.manualProgressCount} {goal.manualProgressCount === 1 ? 'entry' : 'entries'})
                </span>
              </div>
            )}
          </div>
        )}

        {!hasAnyData && (
          <p className="text-sm text-gray-400 italic">No assessments yet</p>
        )}
      </div>
    </Card>
  );
}

function TimelineItemCard({ item, onEdit }: { item: TimelineItem; onEdit?: () => void }) {
  const isManual = item.type === 'manual';
  const total = item.correct + item.incorrect;
  const accuracy = isManual ? item.score : (total > 0 ? Math.round((item.correct / total) * 100) : null);

  const cardClasses = `border border-gray-200 ${isManual && onEdit ? 'cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all' : ''}`;

  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {item.type === 'progress_check' ? (
            <Badge variant="default">Progress Check</Badge>
          ) : item.type === 'exit_ticket' ? (
            <Badge variant="secondary" className="bg-purple-100 text-purple-800">Exit Ticket</Badge>
          ) : (
            <Badge variant="secondary" className="bg-gray-100 text-gray-700">Manual</Badge>
          )}
          <span className="text-xs text-gray-500">
            {format(new Date(item.date.includes('T') ? item.date : `${item.date}T00:00:00`), 'MMM d, yyyy')}
          </span>
          {isManual && item.source && (
            <span className="text-xs text-gray-400">
              ({item.source})
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 line-clamp-1">
          Goal #{item.goalIndex + 1}: {item.goalText}
        </p>

        {!isManual && (
          <div className="flex items-center gap-3 mt-1 text-sm">
            <span className="text-green-600">{item.correct} correct</span>
            <span className="text-red-600">{item.incorrect} incorrect</span>
            {item.excluded > 0 && (
              <span className="text-gray-400">{item.excluded} excluded</span>
            )}
          </div>
        )}

        {item.notes && (
          <p className="text-sm text-gray-500 mt-1 italic line-clamp-2">
            "{item.notes}"
          </p>
        )}

        {isManual && onEdit && (
          <p className="text-xs text-blue-500 mt-1">Click to edit</p>
        )}
      </div>

      <div className={`px-2 py-1 rounded ${getAccuracyBgColor(accuracy ?? null)}`}>
        <span className={`text-sm font-medium ${getAccuracyColor(accuracy ?? null)}`}>
          {accuracy !== null && accuracy !== undefined ? `${accuracy}%` : '--'}
        </span>
      </div>
    </div>
  );

  if (isManual && onEdit) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEdit();
      }
    };

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={handleKeyDown}
        className={`bg-white rounded-lg p-4 shadow-sm ${cardClasses} focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-label={`Edit manual progress for Goal ${item.goalIndex + 1}`}
      >
        {content}
      </div>
    );
  }

  return (
    <Card padding="sm" className={cardClasses}>
      {content}
    </Card>
  );
}
