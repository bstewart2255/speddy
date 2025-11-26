'use client';

import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, StatCard, CardGrid } from '../ui/card';
import { Badge } from '../ui/badge';
import { getStudentProgressData, StudentProgressData, GoalSummary, TimelineItem } from '../../../lib/supabase/queries/student-details';

interface StudentProgressTabProps {
  studentId: string;
  iepGoals: string[];
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

export function StudentProgressTab({ studentId, iepGoals }: StudentProgressTabProps) {
  const [progressData, setProgressData] = useState<StudentProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create stable key from iepGoals array to prevent unnecessary re-renders
  const iepGoalsKey = useMemo(() => iepGoals.join('|'), [iepGoals]);

  useEffect(() => {
    const loadProgressData = async () => {
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
    };

    loadProgressData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, iepGoalsKey]);

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
    g.progressCheckCount > 0 || g.exitTicketCount > 0
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
              <GoalBreakdownCard key={goal.goalIndex} goal={goal} />
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
              <TimelineItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalBreakdownCard({ goal }: { goal: GoalSummary }) {
  const hasAnyData = goal.progressCheckCount > 0 || goal.exitTicketCount > 0;

  return (
    <Card padding="sm" className="border border-gray-200">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-700">
              Goal #{goal.goalIndex + 1}
            </span>
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

            {/* Exit Ticket stats */}
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
          </div>
        )}

        {!hasAnyData && (
          <p className="text-sm text-gray-400 italic">No assessments yet</p>
        )}
      </div>
    </Card>
  );
}

function TimelineItemCard({ item }: { item: TimelineItem }) {
  const total = item.correct + item.incorrect;
  const accuracy = total > 0 ? Math.round((item.correct / total) * 100) : null;

  return (
    <Card padding="sm" className="border border-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.type === 'progress_check' ? (
              <Badge variant="default">Progress Check</Badge>
            ) : (
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">Exit Ticket</Badge>
            )}
            <span className="text-xs text-gray-500">
              {format(new Date(item.date), 'MMM d, yyyy')}
            </span>
          </div>

          <p className="text-sm text-gray-600 line-clamp-1">
            Goal #{item.goalIndex + 1}: {item.goalText}
          </p>

          <div className="flex items-center gap-3 mt-1 text-sm">
            <span className="text-green-600">{item.correct} correct</span>
            <span className="text-red-600">{item.incorrect} incorrect</span>
            {item.excluded > 0 && (
              <span className="text-gray-400">{item.excluded} excluded</span>
            )}
          </div>

          {item.notes && (
            <p className="text-sm text-gray-500 mt-1 italic line-clamp-2">
              "{item.notes}"
            </p>
          )}
        </div>

        <div className={`px-2 py-1 rounded ${getAccuracyBgColor(accuracy)}`}>
          <span className={`text-sm font-medium ${getAccuracyColor(accuracy)}`}>
            {accuracy !== null ? `${accuracy}%` : '--'}
          </span>
        </div>
      </div>
    </Card>
  );
}
