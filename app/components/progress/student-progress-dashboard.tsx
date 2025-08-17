// app/components/progress/student-progress-dashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProgressChart } from './progress-chart';
import { Download } from 'lucide-react';
import { Database } from '../../../src/types/database';
import { TrendingUp, TrendingDown, Minus, FileText, Target, Calendar } from 'lucide-react';

interface ProgressData {
  student: {
    id: string;
    initials: string;
    grade_level: string;
  };
  iepGoals: Array<{
    goal: string;
    target: number;
    current: number;
    trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
    lastAssessed: string;
  }>;
  recentSubmissions: Array<{
    date: string;
    worksheetType: string;
    accuracy: number;
    skillsAssessed: Array<{
      skill: string;
      percentage: number;
    }>;
  }>;
  overallProgress: {
    averageAccuracy: number;
    totalWorksheets: number;
    strongestSkill: string | null;
    needsWork: string | null;
  };
}

export function StudentProgressDashboard({ studentId }: { studentId: string }) {
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'week' | 'month' | 'all'>('month');
  const supabase = createClient<Database>();

  useEffect(() => {
    loadProgressData();
  }, [studentId, selectedTimeRange]);

  const loadProgressData = async () => {
    try {
      setLoading(true);

      // Get student info
      const { data: student } = await supabase
        .from('students')
        .select('id, initials, grade_level')
        .eq('id', studentId)
        .single();

      if (!student) return;

      // Get IEP goal progress
      const { data: goalProgress } = await supabase
        .from('iep_goal_progress')
        .select('*')
        .eq('student_id', studentId);

      // Get worksheet submissions with time filter
      const timeFilter = getTimeRangeFilter();
      let submissionsQuery = supabase
        .from('worksheet_submissions')
        .select(`
          *,
          worksheets!inner(
            id,
            worksheet_type,
            student_id
          )
        `)
        .eq('worksheets.student_id', studentId)
        .order('submitted_at', { ascending: false });

      if (timeFilter) {
        submissionsQuery = submissionsQuery.gte('submitted_at', timeFilter);
      }

      const { data: submissions } = await submissionsQuery;

      // Process the data
      const iepGoals = goalProgress?.map(goal => ({
        goal: goal.iep_goal,
        target: (goal.target_metric as any)?.value || 0,
        current: goal.current_performance || 0,
        trend: goal.trend || 'insufficient_data',
        lastAssessed: goal.last_assessed || ''
      })) || [];

      const recentSubmissions = submissions?.map(sub => ({
        date: sub.submitted_at,
        worksheetType: sub.worksheets.worksheet_type,
        accuracy: sub.accuracy_percentage || 0,
        skillsAssessed: (sub.skills_assessed as any) || []
      })) || [];

      // Calculate overall progress
      const accuracies = recentSubmissions.map(s => s.accuracy);
      const averageAccuracy = accuracies.length > 0 
        ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length 
        : 0;

      // Find strongest and weakest skills
      const allSkills: Record<string, number[]> = {};
      recentSubmissions.forEach(sub => {
        sub.skillsAssessed.forEach((skill: any) => {
          if (!allSkills[skill.skill]) allSkills[skill.skill] = [];
          allSkills[skill.skill].push(skill.percentage);
        });
      });

      const skillAverages = Object.entries(allSkills).map(([skill, percentages]) => ({
        skill,
        average: percentages.reduce((a, b) => a + b, 0) / percentages.length
      }));

      const strongestSkill = skillAverages.length > 0 
        ? skillAverages.reduce((a, b) => a.average > b.average ? a : b).skill 
        : null;

      const needsWork = skillAverages.length > 0 
        ? skillAverages.reduce((a, b) => a.average < b.average ? a : b).skill 
        : null;

      setProgressData({
        student,
        iepGoals,
        recentSubmissions,
        overallProgress: {
          averageAccuracy,
          totalWorksheets: recentSubmissions.length,
          strongestSkill,
          needsWork
        }
      });
    } catch (error) {
      console.error('Error loading progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgressTrend = (submissions: any[]) => {
    if (submissions.length < 2) return 'insufficient_data';

    const recentSubmissions = submissions.slice(0, 5);
    const olderSubmissions = submissions.slice(5, 10);

    if (olderSubmissions.length === 0) return 'insufficient_data';

    const recentAvg = recentSubmissions.reduce((sum, sub) => sum + sub.accuracy, 0) / recentSubmissions.length;
    const olderAvg = olderSubmissions.reduce((sum, sub) => sum + sub.accuracy, 0) / olderSubmissions.length;

    const difference = recentAvg - olderAvg;

    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  };

  const getTimeRangeFilter = () => {
    const now = new Date();
    switch (selectedTimeRange) {
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return weekAgo.toISOString();
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return monthAgo.toISOString();
      default:
        return null;
    }
  };

  const handleExportReport = () => {
    if (!progressData) return;

    // Create a simple text report for now (since jsPDF might not be installed)
    const report = `
  STUDENT PROGRESS REPORT
  =======================
  Student: ${progressData.student.initials}
  Grade: ${progressData.student.grade_level}
  Report Date: ${new Date().toLocaleDateString()}
  Time Period: ${selectedTimeRange === 'week' ? 'Last 7 days' : selectedTimeRange === 'month' ? 'Last 30 days' : 'All time'}

  OVERALL PERFORMANCE
  -------------------
  Average Accuracy: ${progressData.overallProgress.averageAccuracy.toFixed(1)}%
  Worksheets Completed: ${progressData.overallProgress.totalWorksheets}
  Strongest Area: ${progressData.overallProgress.strongestSkill || 'N/A'}
  Needs Practice: ${progressData.overallProgress.needsWork || 'N/A'}

  IEP GOALS PROGRESS
  ------------------
  ${progressData.iepGoals.map((goal, i) => 
  `${i + 1}. ${goal.goal}
   Current: ${goal.current}% | Target: ${goal.target}% | Trend: ${goal.trend}`
  ).join('\n\n')}
  `;

    // Create and download text file
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progress-report-${progressData.student.initials}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!progressData) {
    return <div className="text-center p-8 text-gray-500">No progress data found</div>;
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Progress Report: {progressData.student.initials}
            </h2>
            <p className="text-gray-600 mt-1">Grade {progressData.student.grade_level}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTimeRange('week')}
                className={`px-3 py-1 rounded ${
                  selectedTimeRange === 'week' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setSelectedTimeRange('month')}
                className={`px-3 py-1 rounded ${
                  selectedTimeRange === 'month' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setSelectedTimeRange('all')}
                className={`px-3 py-1 rounded ${
                  selectedTimeRange === 'all' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                All Time
              </button>
            </div>
            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedTimeRange('week')}
              className={`px-3 py-1 rounded ${
                selectedTimeRange === 'week' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setSelectedTimeRange('month')}
              className={`px-3 py-1 rounded ${
                selectedTimeRange === 'month' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setSelectedTimeRange('all')}
              className={`px-3 py-1 rounded ${
                selectedTimeRange === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Average Accuracy</p>
              <p className="text-2xl font-bold text-gray-900">
                {progressData.overallProgress.averageAccuracy.toFixed(1)}%
              </p>
            </div>
            <Target className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Worksheets Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {progressData.overallProgress.totalWorksheets}
              </p>
            </div>
            <FileText className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-sm text-gray-600">Strongest Area</p>
            <p className="text-lg font-semibold text-green-600">
              {progressData.overallProgress.strongestSkill || 'N/A'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-sm text-gray-600">Needs Practice</p>
            <p className="text-lg font-semibold text-orange-600">
              {progressData.overallProgress.needsWork || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* IEP Goals Progress */}
      {progressData.iepGoals.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">IEP Goal Progress</h3>
          <div className="space-y-4">
            {progressData.iepGoals.map((goal, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-gray-700 flex-1">{goal.goal}</p>
                  <div className="flex items-center gap-2 ml-4">
                    {getTrendIcon(goal.trend)}
                    <span className="text-sm text-gray-600">
                      {goal.trend.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Current: {goal.current}%</span>
                    <span>Target: {goal.target}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        goal.current >= goal.target 
                          ? 'bg-green-600' 
                          : goal.current >= goal.target * 0.8 
                          ? 'bg-yellow-600' 
                          : 'bg-red-600'
                      }`}
                      style={{ width: `${Math.min(100, (goal.current / goal.target) * 100)}%` }}
                    ></div>
                  </div>
                  {goal.lastAssessed && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last assessed: {new Date(goal.lastAssessed).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Worksheet Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Worksheet Performance</h3>
        {progressData.recentSubmissions.length > 0 ? (
          <div className="space-y-3">
            {progressData.recentSubmissions.slice(0, 5).map((submission, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="font-medium">{submission.worksheetType}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(submission.date + "T00:00:00").toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${
                    submission.accuracy >= 80 ? 'text-green-600' :
                    submission.accuracy >= 70 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {submission.accuracy}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {submission.skillsAssessed.map(s => s.skill).join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No worksheets completed yet</p>
        )}
      </div>
      {/* Progress Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Progress Over Time</h3>
        <ProgressChart data={progressData.recentSubmissions} />
      </div>
    </div>
  );
}