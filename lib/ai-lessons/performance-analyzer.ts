// lib/ai-lessons/performance-analyzer.ts
import { createClient } from '@/lib/supabase/server';

export interface PerformanceData {
  studentId: string;
  subject: string;
  recentAccuracy: number[];
  errorPatterns: ErrorPattern[];
  currentLevel: number;
  trajectory: 'improving' | 'stable' | 'declining';
  confidenceScore: number;
}

export interface ErrorPattern {
  type: string;
  frequency: number;
  examples: string[];
  lastOccurrence: Date;
}

export interface AdjustmentRecommendation {
  type: 'advance' | 'maintain' | 'reteach' | 'prerequisite';
  reason: string;
  specificChanges: {
    difficulty?: string;
    scaffolding?: string;
    focusAreas?: string[];
    practiceType?: string;
  };
  priority: number;
}

export class PerformanceAnalyzer {
  private supabase: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.supabase = await createClient();
  }

  async analyzeStudentPerformance(
    studentId: string,
    subject?: string
  ): Promise<PerformanceData[]> {
    // Get performance metrics
    const query = this.supabase
      .from('student_performance_metrics')
      .select('*')
      .eq('student_id', studentId);
    
    if (subject) {
      query.eq('subject', subject);
    }

    const { data: metrics, error } = await query;
    if (error || !metrics) return [];

    // Get recent worksheet submissions for detailed analysis
    const { data: submissions } = await this.supabase
      .from('worksheet_submissions')
      .select(`
        *,
        worksheets!inner(
          worksheet_type,
          content
        )
      `)
      .eq('worksheets.student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10);

    const performanceData: PerformanceData[] = [];

    for (const metric of metrics) {
      const subjectSubmissions = submissions?.filter((s: any) => 
        this.mapWorksheetTypeToSubject(s.worksheets.worksheet_type) === metric.subject
      ) || [];

      const errorPatterns = this.extractErrorPatterns(subjectSubmissions);
      const trajectory = this.calculateTrajectory(metric.accuracy_trend || []);
      
      performanceData.push({
        studentId,
        subject: metric.subject,
        recentAccuracy: metric.accuracy_trend || [],
        errorPatterns,
        currentLevel: metric.current_level || 0,
        trajectory,
        confidenceScore: metric.confidence_score || 0.5
      });
    }

    return performanceData;
  }

  async getAdjustmentRecommendation(
    studentId: string,
    subject: string
  ): Promise<AdjustmentRecommendation | null> {
    const [performance] = await this.analyzeStudentPerformance(studentId, subject);
    if (!performance) return null;

    const latestAccuracy = performance.recentAccuracy[0] || 0;
    
    // Check adjustment queue for any pending adjustments
    const { data: pendingAdjustments } = await this.supabase
      .from('lesson_adjustment_queue')
      .select('*')
      .eq('student_id', studentId)
      .eq('subject', subject)
      .eq('processed', false)
      .order('priority', { ascending: false })
      .limit(1);

    if (pendingAdjustments && pendingAdjustments.length > 0) {
      const adjustment = pendingAdjustments[0];
      return {
        type: adjustment.adjustment_type,
        reason: this.generateAdjustmentReason(adjustment.adjustment_type, latestAccuracy, performance),
        specificChanges: this.generateSpecificChanges(adjustment.adjustment_type, performance),
        priority: adjustment.priority
      };
    }

    // Generate recommendation based on performance
    let adjustmentType: AdjustmentRecommendation['type'];
    let priority: number;

    if (latestAccuracy >= 90) {
      adjustmentType = 'advance';
      priority = 4;
    } else if (latestAccuracy >= 70) {
      adjustmentType = 'maintain';
      priority = 5;
    } else if (latestAccuracy >= 50) {
      adjustmentType = 'reteach';
      priority = 7;
    } else {
      adjustmentType = 'prerequisite';
      priority = 9;
    }

    return {
      type: adjustmentType,
      reason: this.generateAdjustmentReason(adjustmentType, latestAccuracy, performance),
      specificChanges: this.generateSpecificChanges(adjustmentType, performance),
      priority
    };
  }

  private extractErrorPatterns(submissions: any[]): ErrorPattern[] {
    const patternMap = new Map<string, ErrorPattern>();

    for (const submission of submissions) {
      if (!submission.student_responses) continue;

      for (const response of submission.student_responses) {
        if (!response.isCorrect && response.errorType) {
          const key = response.errorType;
          const existing = patternMap.get(key);
          
          if (existing) {
            existing.frequency++;
            existing.examples.push(response.studentAnswer);
            existing.lastOccurrence = new Date(submission.created_at);
          } else {
            patternMap.set(key, {
              type: response.errorType,
              frequency: 1,
              examples: [response.studentAnswer],
              lastOccurrence: new Date(submission.created_at)
            });
          }
        }
      }
    }

    // Sort by frequency and limit examples
    return Array.from(patternMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .map(pattern => ({
        ...pattern,
        examples: pattern.examples.slice(0, 3)
      }));
  }

  private calculateTrajectory(accuracyTrend: number[]): 'improving' | 'stable' | 'declining' {
    if (accuracyTrend.length < 3) return 'stable';

    const recent = accuracyTrend.slice(0, 3);
    const older = accuracyTrend.slice(3, 6);
    
    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const difference = recentAvg - olderAvg;
    
    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  }

  private generateAdjustmentReason(
    type: AdjustmentRecommendation['type'],
    accuracy: number,
    performance: PerformanceData
  ): string {
    const trajectory = performance.trajectory;
    const mainError = performance.errorPatterns[0];

    switch (type) {
      case 'advance':
        return `Student achieved ${accuracy}% accuracy and shows ${trajectory} performance. Ready for more challenging content.`;
      
      case 'maintain':
        return `Student at ${accuracy}% accuracy with ${trajectory} trajectory. Continuing at current level with variation.`;
      
      case 'reteach':
        return `Student at ${accuracy}% accuracy${mainError ? `, struggling with ${mainError.type} errors` : ''}. Reteaching with increased scaffolding.`;
      
      case 'prerequisite':
        return `Student at ${accuracy}% accuracy. Stepping back to prerequisite skills${mainError ? ` to address ${mainError.type} issues` : ''}.`;
    }
  }

  private generateSpecificChanges(
    type: AdjustmentRecommendation['type'],
    performance: PerformanceData
  ): AdjustmentRecommendation['specificChanges'] {
    const changes: AdjustmentRecommendation['specificChanges'] = {};

    switch (type) {
      case 'advance':
        changes.difficulty = 'Increase by 0.5 grade levels';
        changes.scaffolding = 'Reduce visual supports';
        changes.practiceType = 'Introduce new concepts';
        break;
      
      case 'maintain':
        changes.difficulty = 'Same level, different contexts';
        changes.scaffolding = 'Maintain current supports';
        changes.practiceType = 'Mixed review and application';
        break;
      
      case 'reteach':
        changes.difficulty = 'Simplify by breaking into steps';
        changes.scaffolding = 'Add visual models and examples';
        changes.focusAreas = performance.errorPatterns.slice(0, 2).map(e => e.type);
        changes.practiceType = 'Guided practice with immediate feedback';
        break;
      
      case 'prerequisite':
        changes.difficulty = 'Reduce by 1 grade level';
        changes.scaffolding = 'Maximum supports with step-by-step guides';
        changes.focusAreas = ['foundational skills'];
        changes.practiceType = 'Basic skill building';
        break;
    }

    return changes;
  }

  private mapWorksheetTypeToSubject(worksheetType: string): string {
    const mapping: Record<string, string> = {
      'spelling': 'spelling',
      'math': 'math',
      'math_computation': 'math',
      'reading_comprehension': 'reading',
      'phonics': 'phonics',
      'writing': 'writing',
      'written_expression': 'writing'
    };
    
    return mapping[worksheetType] || 'reading';
  }

  async markAdjustmentProcessed(adjustmentId: string): Promise<void> {
    await this.supabase
      .from('lesson_adjustment_queue')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', adjustmentId);
  }

  async getGroupCompatibility(studentIds: string[]): Promise<{
    compatible: boolean;
    reason: string;
    groupingStrategy: string;
  }> {
    if (studentIds.length < 2 || studentIds.length > 6) {
      return {
        compatible: false,
        reason: 'Groups must have 2-6 students',
        groupingStrategy: ''
      };
    }

    const performances = await Promise.all(
      studentIds.map(id => this.analyzeStudentPerformance(id))
    );

    // Find common subjects
    const subjectMap = new Map<string, number[]>();
    
    for (const studentPerf of performances) {
      for (const perf of studentPerf) {
        if (!subjectMap.has(perf.subject)) {
          subjectMap.set(perf.subject, []);
        }
        const latest = perf.recentAccuracy[0] || 0;
        subjectMap.get(perf.subject)!.push(latest);
      }
    }

    // Find subject with most similar performance levels
    let bestSubject = '';
    let lowestVariance = Infinity;
    
    for (const [subject, accuracies] of subjectMap.entries()) {
      if (accuracies.length === studentIds.length) {
        const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
        const variance = accuracies.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / accuracies.length;
        
        if (variance < lowestVariance) {
          lowestVariance = variance;
          bestSubject = subject;
        }
      }
    }

    if (!bestSubject) {
      return {
        compatible: false,
        reason: 'No common subject data for all students',
        groupingStrategy: ''
      };
    }

    // Check if variance is acceptable (within 20% range)
    const acceptable = lowestVariance < 400; // sqrt(400) = 20% difference
    
    return {
      compatible: acceptable,
      reason: acceptable 
        ? `Students have similar ${bestSubject} performance levels`
        : `Performance levels too varied in ${bestSubject}`,
      groupingStrategy: acceptable
        ? `Group by ${bestSubject} with differentiated materials`
        : ''
    };
  }
}

export const performanceAnalyzer = new PerformanceAnalyzer();