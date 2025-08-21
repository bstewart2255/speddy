// lib/ai-lessons/adjustment-queue.ts
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueuedAdjustment {
  id: string;
  studentId: string;
  worksheetSubmissionId?: string;
  subject: string;
  adjustmentType: 'advance' | 'maintain' | 'reteach' | 'prerequisite';
  adjustmentDetails: {
    accuracy?: number;
    skillsAssessed?: any;
    aiAnalysis?: string;
    errorPatterns?: string[];
    specificNeeds?: string[];
  };
  priority: number;
  processed: boolean;
  processedAt?: Date;
  createdAt: Date;
}

export interface AdjustmentBatch {
  studentId: string;
  adjustments: QueuedAdjustment[];
  recommendedAction: string;
  nextLessonModifications: {
    subject: string;
    changes: string[];
  }[];
}

export class AdjustmentQueueManager {
  private supabase: SupabaseClient | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.supabase = await createClient() as unknown as SupabaseClient;
  }

  async getPendingAdjustments(
    studentId?: string,
    subject?: string,
    limit: number = 10
  ): Promise<QueuedAdjustment[]> {
    let query = this.supabase
      .from('lesson_adjustment_queue')
      .select('*')
      .eq('processed', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    if (subject) {
      query = query.eq('subject', subject);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching adjustments:', error);
      return [];
    }

    return data.map((adj: any) => ({
      id: adj.id,
      studentId: adj.student_id,
      worksheetSubmissionId: adj.worksheet_submission_id,
      subject: adj.subject,
      adjustmentType: adj.adjustment_type,
      adjustmentDetails: adj.adjustment_details,
      priority: adj.priority,
      processed: adj.processed,
      processedAt: adj.processed_at ? new Date(adj.processed_at) : undefined,
      createdAt: new Date(adj.created_at)
    }));
  }

  async processAdjustment(adjustmentId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('lesson_adjustment_queue')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', adjustmentId);

    return !error;
  }

  async processBatch(adjustmentIds: string[]): Promise<number> {
    const { data, error } = await this.supabase
      .from('lesson_adjustment_queue')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .in('id', adjustmentIds);

    if (error) {
      console.error('Error processing batch:', error);
      return 0;
    }

    return data?.length || 0;
  }

  async createAdjustment(
    studentId: string,
    subject: string,
    type: QueuedAdjustment['adjustmentType'],
    details: QueuedAdjustment['adjustmentDetails'],
    priority?: number,
    worksheetSubmissionId?: string
  ): Promise<QueuedAdjustment | null> {
    const { data, error } = await this.supabase
      .from('lesson_adjustment_queue')
      .insert({
        student_id: studentId,
        worksheet_submission_id: worksheetSubmissionId,
        subject,
        adjustment_type: type,
        adjustment_details: details,
        priority: priority || this.calculatePriority(type)
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating adjustment:', error);
      return null;
    }

    return {
      id: data.id,
      studentId: data.student_id,
      worksheetSubmissionId: data.worksheet_submission_id,
      subject: data.subject,
      adjustmentType: data.adjustment_type,
      adjustmentDetails: data.adjustment_details,
      priority: data.priority,
      processed: data.processed,
      createdAt: new Date(data.created_at)
    };
  }

  private calculatePriority(type: QueuedAdjustment['adjustmentType']): number {
    const priorityMap = {
      'prerequisite': 9,
      'reteach': 7,
      'maintain': 5,
      'advance': 3
    };
    return priorityMap[type] || 5;
  }

  async getStudentAdjustmentSummary(studentId: string): Promise<{
    pending: number;
    processed: number;
    bySubject: Map<string, {
      pending: QueuedAdjustment[];
      trend: 'improving' | 'stable' | 'struggling';
    }>;
    recommendations: string[];
  }> {
    // Get all adjustments for student
    const { data: allAdjustments } = await this.supabase
      .from('lesson_adjustment_queue')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    const pending = allAdjustments?.filter((a: any) => !a.processed) || [];
    const processed = allAdjustments?.filter((a: any) => a.processed) || [];

    // Group by subject
    const bySubject = new Map();
    const subjects = new Set(allAdjustments?.map((a: any) => a.subject) || []);

    for (const subject of subjects) {
      const subjectAdjustments = pending.filter((a: any) => a.subject === subject);
      const recentTypes = allAdjustments
        ?.filter((a: any) => a.subject === subject)
        .slice(0, 5)
        .map((a: any) => a.adjustment_type) || [];

      const trend = this.determineTrend(recentTypes);

      bySubject.set(subject, {
        pending: subjectAdjustments.map((a: any) => this.mapToQueuedAdjustment(a)),
        trend
      });
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(bySubject);

    return {
      pending: pending.length,
      processed: processed.length,
      bySubject,
      recommendations
    };
  }

  private determineTrend(recentTypes: string[]): 'improving' | 'stable' | 'struggling' {
    if (recentTypes.length === 0) return 'stable';

    const scores = recentTypes.map(type => {
      const scoreMap: Record<string, number> = {
        'advance': 3,
        'maintain': 2,
        'reteach': 1,
        'prerequisite': 0
      };
      return scoreMap[type] || 2;
    });

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avgScore >= 2.5) return 'improving';
    if (avgScore <= 1) return 'struggling';
    return 'stable';
  }

  private generateRecommendations(
    bySubject: Map<string, any>
  ): string[] {
    const recommendations: string[] = [];

    for (const [subject, data] of bySubject.entries()) {
      if (data.trend === 'struggling' && data.pending.length > 0) {
        recommendations.push(`Consider additional support for ${subject}`);
      } else if (data.trend === 'improving' && data.pending.some((a: any) => a.adjustmentType === 'advance')) {
        recommendations.push(`Student ready for enrichment in ${subject}`);
      }
    }

    return recommendations;
  }

  private mapToQueuedAdjustment(data: any): QueuedAdjustment {
    return {
      id: data.id,
      studentId: data.student_id,
      worksheetSubmissionId: data.worksheet_submission_id,
      subject: data.subject,
      adjustmentType: data.adjustment_type,
      adjustmentDetails: data.adjustment_details,
      priority: data.priority,
      processed: data.processed,
      processedAt: data.processed_at ? new Date(data.processed_at) : undefined,
      createdAt: new Date(data.created_at)
    };
  }

  async getHighPriorityAdjustments(limit: number = 5): Promise<AdjustmentBatch[]> {
    const adjustments = await this.getPendingAdjustments(undefined, undefined, limit * 3);
    
    // Group by student
    const studentMap = new Map<string, QueuedAdjustment[]>();
    
    for (const adj of adjustments) {
      if (!studentMap.has(adj.studentId)) {
        studentMap.set(adj.studentId, []);
      }
      studentMap.get(adj.studentId)!.push(adj);
    }

    // Create batches
    const batches: AdjustmentBatch[] = [];
    
    for (const [studentId, studentAdjustments] of studentMap.entries()) {
      // Group by subject for modifications
      const subjectMods = new Map<string, string[]>();
      
      for (const adj of studentAdjustments) {
        if (!subjectMods.has(adj.subject)) {
          subjectMods.set(adj.subject, []);
        }
        
        const changes = this.getModificationsForType(adj.adjustmentType);
        subjectMods.get(adj.subject)!.push(...changes);
      }

      const nextLessonModifications = Array.from(subjectMods.entries()).map(([subject, changes]) => ({
        subject,
        changes: [...new Set(changes)] // Remove duplicates
      }));

      batches.push({
        studentId,
        adjustments: studentAdjustments.slice(0, 5), // Limit per student
        recommendedAction: this.getRecommendedAction(studentAdjustments),
        nextLessonModifications
      });
    }

    return batches.slice(0, limit);
  }

  private getModificationsForType(type: QueuedAdjustment['adjustmentType']): string[] {
    const modifications: Record<string, string[]> = {
      'advance': [
        'Increase complexity',
        'Reduce scaffolding',
        'Add extension activities',
        'Introduce new concepts'
      ],
      'maintain': [
        'Continue current level',
        'Vary contexts',
        'Mix review and practice'
      ],
      'reteach': [
        'Break down concepts',
        'Add visual supports',
        'Increase guided practice',
        'Provide more examples'
      ],
      'prerequisite': [
        'Review foundational skills',
        'Maximum scaffolding',
        'Simplified instructions',
        'Focus on basics'
      ]
    };

    return modifications[type] || ['Maintain current approach'];
  }

  private getRecommendedAction(adjustments: QueuedAdjustment[]): string {
    if (adjustments.length === 0) return 'Continue current program';

    const types = adjustments.map(a => a.adjustmentType);
    const hasPrerequisite = types.includes('prerequisite');
    const hasReteach = types.includes('reteach');
    const hasAdvance = types.includes('advance');

    if (hasPrerequisite) {
      return 'Focus on foundational skills before advancing';
    } else if (hasReteach && !hasAdvance) {
      return 'Reteach current concepts with additional support';
    } else if (hasAdvance && !hasReteach) {
      return 'Student ready for more challenging content';
    } else {
      return 'Mixed performance - differentiate by topic';
    }
  }

  async cleanupOldProcessedAdjustments(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await this.supabase
      .from('lesson_adjustment_queue')
      .delete()
      .eq('processed', true)
      .lt('processed_at', cutoffDate.toISOString());

    if (error) {
      console.error('Error cleaning up old adjustments:', error);
      return 0;
    }

    return data?.length || 0;
  }
}

export const adjustmentQueue = new AdjustmentQueueManager();