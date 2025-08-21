// lib/ai-lessons/assessment-registry.ts
import { createClient } from '@/lib/supabase/server';

export interface AssessmentType {
  id: string;
  name: string;
  category: 'academic' | 'cognitive' | 'behavioral' | 'iep';
  dataSchema: any;
  interpretationRules: {
    useFor: string[];
    weight: 'high' | 'medium' | 'low';
  };
  promptFragments: {
    pacing?: string;
    complexity?: string;
    supports?: string;
  };
  confidenceWeight: number;
}

export interface StudentAssessmentData {
  studentId: string;
  assessmentType: string;
  data: any;
  collectedAt: Date;
  confidence?: number;
}

export class AssessmentRegistry {
  private supabase: any;
  private assessmentCache: Map<string, AssessmentType> = new Map();

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.supabase = await createClient();
    await this.loadAssessmentTypes();
  }

  private async loadAssessmentTypes() {
    const { data: types, error } = await this.supabase
      .from('assessment_types')
      .select('*');

    if (!error && types) {
      types.forEach((type: any) => {
        this.assessmentCache.set(type.name, {
          id: type.id,
          name: type.name,
          category: type.category,
          dataSchema: type.data_schema,
          interpretationRules: type.interpretation_rules,
          promptFragments: type.prompt_fragments,
          confidenceWeight: type.confidence_weight
        });
      });
    }
  }

  async getAssessmentType(name: string): Promise<AssessmentType | null> {
    if (!this.assessmentCache.has(name)) {
      await this.loadAssessmentTypes();
    }
    return this.assessmentCache.get(name) || null;
  }

  async getAllAssessmentTypes(): Promise<AssessmentType[]> {
    if (this.assessmentCache.size === 0) {
      await this.loadAssessmentTypes();
    }
    return Array.from(this.assessmentCache.values());
  }

  async registerNewAssessmentType(assessment: Omit<AssessmentType, 'id'>): Promise<AssessmentType> {
    const { data, error } = await this.supabase
      .from('assessment_types')
      .insert({
        name: assessment.name,
        category: assessment.category,
        data_schema: assessment.dataSchema,
        interpretation_rules: assessment.interpretationRules,
        prompt_fragments: assessment.promptFragments,
        confidence_weight: assessment.confidenceWeight
      })
      .select()
      .single();

    if (error) throw error;

    const newType: AssessmentType = {
      id: data.id,
      name: data.name,
      category: data.category,
      dataSchema: data.data_schema,
      interpretationRules: data.interpretation_rules,
      promptFragments: data.prompt_fragments,
      confidenceWeight: data.confidence_weight
    };

    this.assessmentCache.set(newType.name, newType);
    return newType;
  }

  async getStudentAssessments(studentId: string): Promise<StudentAssessmentData[]> {
    // Fetch all available assessment data for a student
    const assessments: StudentAssessmentData[] = [];

    // Get student details (contains IEP goals, reading level, etc.)
    const { data: studentDetails } = await this.supabase
      .from('student_details')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (studentDetails) {
      // Extract reading level
      if (studentDetails.grade_month_reading_level !== undefined) {
        assessments.push({
          studentId,
          assessmentType: 'reading_level',
          data: {
            grade_level: studentDetails.grade_month_reading_level,
            wpm: studentDetails.reading_wpm,
            comprehension: studentDetails.reading_comprehension
          },
          collectedAt: new Date(studentDetails.updated_at),
          confidence: 0.9
        });
      }

      // Extract IEP goals
      if (studentDetails.iep_goals && studentDetails.iep_goals.length > 0) {
        assessments.push({
          studentId,
          assessmentType: 'iep_goals',
          data: studentDetails.iep_goals,
          collectedAt: new Date(studentDetails.updated_at),
          confidence: 1.0
        });
      }

      // Extract cognitive assessments if available
      if (studentDetails.cognitive_assessments) {
        const cogData = studentDetails.cognitive_assessments;
        
        if (cogData.processing_speed) {
          assessments.push({
            studentId,
            assessmentType: 'processing_speed',
            data: cogData.processing_speed,
            collectedAt: new Date(studentDetails.updated_at),
            confidence: 0.85
          });
        }

        if (cogData.working_memory) {
          assessments.push({
            studentId,
            assessmentType: 'working_memory',
            data: cogData.working_memory,
            collectedAt: new Date(studentDetails.updated_at),
            confidence: 0.85
          });
        }
      }
    }

    // Get performance metrics
    const { data: metrics } = await this.supabase
      .from('student_performance_metrics')
      .select('*')
      .eq('student_id', studentId);

    if (metrics) {
      metrics.forEach((metric: any) => {
        if (metric.subject === 'math' && metric.current_level) {
          assessments.push({
            studentId,
            assessmentType: 'math_computation',
            data: {
              grade_level: metric.current_level,
              accuracy: metric.accuracy_trend?.[0] || 70,
              fluency: 'developing'
            },
            collectedAt: new Date(metric.last_assessment_date || metric.updated_at),
            confidence: metric.confidence_score
          });
        }
      });
    }

    return assessments;
  }

  validateAssessmentData(assessmentType: string, data: any): boolean {
    const type = this.assessmentCache.get(assessmentType);
    if (!type) return false;

    // Simple validation - in production, use a JSON schema validator
    try {
      const schema = type.dataSchema;
      if (schema.type === 'object' && schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties as any)) {
          if ((prop as any).required && !(key in data)) {
            return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  interpretAssessmentForPrompt(
    assessmentType: string, 
    data: any
  ): { pacing?: string; complexity?: string; supports?: string } {
    const type = this.assessmentCache.get(assessmentType);
    if (!type) return {};

    const fragments = { ...type.promptFragments };
    
    // Replace placeholders with actual data
    Object.keys(fragments).forEach(key => {
      let fragment = fragments[key as keyof typeof fragments];
      if (fragment) {
        // Replace {key} with data[key]
        fragment = fragment.replace(/\{(\w+)\}/g, (match, p1) => {
          return data[p1] !== undefined ? data[p1] : match;
        });
        fragments[key as keyof typeof fragments] = fragment;
      }
    });

    return fragments;
  }

  calculateDataConfidence(assessments: StudentAssessmentData[]): number {
    if (assessments.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const assessment of assessments) {
      const type = this.assessmentCache.get(assessment.assessmentType);
      if (type) {
        const weight = type.confidenceWeight * (assessment.confidence || 0.5);
        totalWeight += type.confidenceWeight;
        weightedSum += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }
}

export const assessmentRegistry = new AssessmentRegistry();