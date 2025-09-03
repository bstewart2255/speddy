// lib/ai-lessons/prompt-assembler.ts
import { assessmentRegistry, StudentAssessmentData } from './assessment-registry';
import { performanceAnalyzer, PerformanceData, AdjustmentRecommendation } from './performance-analyzer';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PromptContext {
  studentIds: string[];
  lessonType: 'individual' | 'group';
  subject: string;
  duration: number; // minutes
  focusSkills?: string[];
  assessments: Map<string, StudentAssessmentData[]>;
  performance: Map<string, PerformanceData[]>;
  adjustments: Map<string, AdjustmentRecommendation>;
}

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  confidence: number;
  dataUsed: string[];
}

export class PromptAssembler {
  private materialConstraints: string[] = [];
  private supabase: SupabaseClient | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    const { createClient } = await import('@/lib/supabase/server');
    this.supabase = await createClient() as unknown as SupabaseClient;
    await this.loadMaterialConstraints();
  }

  private async loadMaterialConstraints() {
    const { data: constraints } = await this.supabase!
      .from('material_constraints')
      .select('description, constraint_type')
      .eq('active', true)
      .order('constraint_type');

    if (constraints && constraints.length > 0) {
      this.materialConstraints = constraints.map((c: any) => c.description);
    } else {
      // Fallback constraints if database is empty
      this.materialConstraints = [
        'NEVER require cutting, laminating, or advance preparation',
        'NEVER require apps, websites, or technology beyond printing',
        'NEVER require physical manipulatives, dice, spinners, or cards',
        'NEVER require movement around the room or special setup',
        'ALL materials must be included directly on the worksheet',
        'ONLY assume access to: printer, paper, pencils, crayons, student desks'
      ];
    }
  }

  async assemblePrompt(context: PromptContext): Promise<AssembledPrompt> {
    // Ensure constraints are loaded
    if (this.materialConstraints.length === 0) {
      await this.loadMaterialConstraints();
    }
    const dataUsed: string[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    // Build system prompt with constraints and subject-specific guidance
    const systemPrompt = this.buildSystemPrompt(context.lessonType, context.subject);
    
    // Build user prompt with dynamic data
    let userPrompt = '';
    
    if (context.lessonType === 'group') {
      userPrompt = await this.buildGroupLessonPrompt(context, dataUsed);
    } else {
      userPrompt = await this.buildIndividualLessonPrompt(context, dataUsed);
    }

    // Calculate overall confidence
    for (const studentId of context.studentIds) {
      const assessments = context.assessments.get(studentId) || [];
      const confidence = assessmentRegistry.calculateDataConfidence(assessments);
      totalConfidence += confidence;
      confidenceCount++;
    }

    const overallConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.3;

    return {
      systemPrompt,
      userPrompt,
      confidence: overallConfidence,
      dataUsed
    };
  }

  private buildSystemPrompt(lessonType: 'individual' | 'group', subject?: string): string {
    let subjectGuidance = '';
    
    if (subject) {
      const subjectLower = subject.toLowerCase();
      if (subjectLower === 'math' || subjectLower === 'mathematics') {
        subjectGuidance = `
MATH-SPECIFIC REQUIREMENTS:
- Include number lines, hundreds charts, or visual models for every problem
- Progress from concrete to abstract representations
- Include computation practice appropriate for grade level
- Incorporate word problems with visual supports
- Use visual representations of concrete materials (drawn on worksheet)
- Include step-by-step examples for new concepts
`;
      } else if (subjectLower === 'ela' || subjectLower === 'reading' || subjectLower === 'english' || subjectLower === 'phonics') {
        subjectGuidance = `
ELA/READING-SPECIFIC REQUIREMENTS:
- Match text complexity to student's actual reading level (not just grade level)
- Include phonics patterns appropriate for developmental level
- Incorporate sight word practice for younger grades
- Use picture supports for vocabulary
- Include comprehension questions at multiple levels (literal, inferential)
- Provide word banks when appropriate
- Use larger fonts for younger students
`;
      } else if (subjectLower === 'writing') {
        subjectGuidance = `
WRITING-SPECIFIC REQUIREMENTS:
- Provide sentence starters and frames
- Include word banks with topic-specific vocabulary
- Use graphic organizers (printed on worksheet)
- Include lined spaces appropriate for grade level
- Provide examples of target writing skill
- Break complex tasks into steps
`;
      }
    }
    
    return `You are an expert special education teacher creating ${lessonType} lessons with these STRICT requirements:

MATERIAL CONSTRAINTS (ABSOLUTELY REQUIRED):
${this.materialConstraints.map(c => `- ${c}`).join('\n')}
${subjectGuidance}
OUTPUT FORMAT:
1. Lesson Overview
   - Title
   - Duration
   - Learning objectives
   - Materials needed (must say "All materials included on worksheets - just print!")

2. ${lessonType === 'group' ? 'Differentiated Materials for Each Student' : 'Student Materials'}
   - Complete, print-ready worksheets
   - All visual supports embedded in worksheet
   - Clear instructions at student's reading level
   - Answer spaces provided

3. Teacher Guidance
   - Plain language notes about differentiation
   - Expected completion times per student
   - Support level indicators
   - Check-in priorities

4. Assessment
   - Built-in exit tickets on worksheet
   - Success criteria clearly defined

CRITICAL RULES:
- Every problem must have visual supports when needed (number lines, charts, etc.) PRINTED ON THE WORKSHEET
- Games must be paper-based (word searches, crosswords, color-by-number)
- Reading passages must be included in full, not referenced
- All worksheets must include student name line and date
- Include QR code space (will be added programmatically)`;
  }

  private async buildGroupLessonPrompt(
    context: PromptContext,
    dataUsed: string[]
  ): Promise<string> {
    let prompt = `Create a ${context.duration}-minute ${context.subject} lesson for a group of ${context.studentIds.length} students.\n\n`;
    
    // Batch fetch all student grade levels to avoid N+1 queries
    const { data: students } = await this.supabase!
      .from('students')
      .select('id, grade_level')
      .in('id', context.studentIds);
    
    const studentGradeMap = new Map(
      students?.map(s => [s.id, s.grade_level]) || []
    );
    
    // Add each student's profile
    prompt += 'STUDENT PROFILES:\n\n';
    
    for (let i = 0; i < context.studentIds.length; i++) {
      const studentId = context.studentIds[i];
      const studentPrompt = await this.buildStudentProfile(
        studentId,
        i + 1,
        context,
        dataUsed,
        studentGradeMap.get(studentId)
      );
      prompt += studentPrompt + '\n';
    }

    // Add grouping rationale
    const compatibility = await performanceAnalyzer.getGroupCompatibility(context.studentIds);
    prompt += `\nGROUPING STRATEGY: ${compatibility.groupingStrategy || 'Mixed-ability grouping with peer support'}\n`;

    // Calculate individual work minutes (ensure non-negative)
    const individualWorkMinutes = Math.max(0, Math.round(context.duration - 10));

    // Add shared components guidance
    prompt += `\nSHARED COMPONENTS:
- Opening: Whole group introduction (2-3 minutes) that naturally accommodates all levels
- Individual Work: Each student works on their differentiated worksheet (${individualWorkMinutes} minutes)
- Closing: Share out where each student can participate at their level (5 minutes)\n`;

    // Add differentiation requirements
    prompt += `\nDIFFERENTIATION REQUIREMENTS:
- Each student receives a worksheet at their exact level
- Common theme/topic but different complexity
- Visual supports vary by student need
- Problem count adjusted for processing speed
- Clear visual distinction between student materials\n`;

    if (context.focusSkills && context.focusSkills.length > 0) {
      prompt += `\nFOCUS SKILLS: ${context.focusSkills.join(', ')}\n`;
    }

    prompt += '\nGenerate the complete lesson with all differentiated materials.';
    
    return prompt;
  }

  private async buildIndividualLessonPrompt(
    context: PromptContext,
    dataUsed: string[]
  ): Promise<string> {
    const studentId = context.studentIds[0];
    let prompt = `Create a ${context.duration}-minute individual ${context.subject} lesson.\n\n`;
    
    const studentPrompt = await this.buildStudentProfile(
      studentId,
      1,
      context,
      dataUsed
    );
    prompt += studentPrompt;

    // Add progression structure
    prompt += `\n\nLESSON PROGRESSION:
1. Warm-up (${Math.floor(context.duration * 0.15)} minutes) - Review/confidence building
2. Guided Practice (${Math.floor(context.duration * 0.3)} minutes) - New skill with supports
3. Independent Practice (${Math.floor(context.duration * 0.4)} minutes) - Apply skill
4. Assessment (${Math.floor(context.duration * 0.15)} minutes) - Quick check for understanding\n`;

    // Add adjustment recommendations
    const adjustment = context.adjustments.get(studentId);
    if (adjustment) {
      prompt += `\nPERFORMANCE-BASED ADJUSTMENTS:
- Adjustment Type: ${adjustment.type}
- Reason: ${adjustment.reason}
- Specific Changes: ${JSON.stringify(adjustment.specificChanges, null, 2)}\n`;
      dataUsed.push(`Performance adjustment: ${adjustment.type}`);
    }

    if (context.focusSkills && context.focusSkills.length > 0) {
      prompt += `\nFOCUS SKILLS: ${context.focusSkills.join(', ')}\n`;
    }

    prompt += '\nGenerate the complete lesson with all materials embedded in the worksheet.';
    
    return prompt;
  }

  private async buildStudentProfile(
    studentId: string,
    studentNumber: number,
    context: PromptContext,
    dataUsed: string[],
    gradeLevel?: string
  ): Promise<string> {
    let profile = `STUDENT ${studentNumber}:\n`;
    
    // Get assessments for this student
    const assessments = context.assessments.get(studentId) || [];
    const performance = context.performance.get(studentId) || [];
    
    // Use provided grade level or fetch if not provided (for individual lessons)
    let studentGradeLevel = gradeLevel;
    if (!studentGradeLevel) {
      const { data: student } = await this.supabase!
        .from('students')
        .select('grade_level')
        .eq('id', studentId)
        .single();
      studentGradeLevel = student?.grade_level;
    }
    
    // Add basic info
    profile += `- ID Reference: Student${studentNumber}\n`;
    if (studentGradeLevel) {
      profile += `- Grade Level: ${studentGradeLevel}\n`;
      dataUsed.push('grade_level');
    }

    // Add assessment-based information
    if (assessments.length > 0) {
      profile += '\nAvailable Data:\n';
      
      for (const assessment of assessments) {
        const interpreted = assessmentRegistry.interpretAssessmentForPrompt(
          assessment.assessmentType,
          assessment.data
        );
        
        if (interpreted.pacing) {
          profile += `- Pacing: ${interpreted.pacing}\n`;
          dataUsed.push(`${assessment.assessmentType}: pacing`);
        }
        if (interpreted.complexity) {
          profile += `- Complexity: ${interpreted.complexity}\n`;
          dataUsed.push(`${assessment.assessmentType}: complexity`);
        }
        if (interpreted.supports) {
          profile += `- Supports: ${interpreted.supports}\n`;
          dataUsed.push(`${assessment.assessmentType}: supports`);
        }
      }
    } else {
      profile += '- Using grade-level baseline (no assessment data available)\n';
      profile += '- Include multiple difficulty options for teacher selection\n';
      dataUsed.push('grade-level baseline');
    }

    // Add performance data
    const subjectPerf = performance.find(p => p.subject === context.subject);
    if (subjectPerf) {
      profile += `\nRecent Performance:\n`;
      profile += `- Accuracy Trend: ${subjectPerf.recentAccuracy.slice(0, 3).join('%, ')}%\n`;
      profile += `- Trajectory: ${subjectPerf.trajectory}\n`;
      
      if (subjectPerf.errorPatterns.length > 0) {
        profile += `- Common Errors: ${subjectPerf.errorPatterns.slice(0, 2).map(e => e.type).join(', ')}\n`;
        dataUsed.push('error patterns');
      }
      
      dataUsed.push('performance history');
    }

    // Add IEP goals if available
    const iepAssessment = assessments.find(a => a.assessmentType === 'iep_goals');
    if (iepAssessment && Array.isArray(iepAssessment.data)) {
      const relevantGoals = iepAssessment.data.filter((goal: string) => 
        goal.toLowerCase().includes(context.subject.toLowerCase())
      );
      
      if (relevantGoals.length > 0) {
        profile += `\nIEP Goals:\n`;
        relevantGoals.forEach((goal: string) => {
          profile += `- ${goal}\n`;
        });
        dataUsed.push('IEP goals');
      }
    }

    return profile;
  }

  validatePromptOutput(output: string): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    
    // Check for forbidden materials
    const forbidden = [
      /cut\s+out/gi,
      /scissors/gi,
      /laminate/gi,
      /dice/gi,
      /spinner/gi,
      /manipulatives/gi,
      /app/gi,
      /website/gi,
      /stand\s+up/gi,
      /walk\s+around/gi,
      /move\s+to/gi
    ];

    for (const pattern of forbidden) {
      if (pattern.test(output)) {
        violations.push(`Contains forbidden material: ${pattern.source}`);
      }
    }

    // Check for required elements
    const required = [
      /worksheet/gi,
      /print/gi,
      /included/gi
    ];

    for (const pattern of required) {
      if (!pattern.test(output)) {
        violations.push(`Missing required element: ${pattern.source}`);
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  async generateDataConfidenceReport(context: PromptContext): Promise<{
    overall: number;
    byStudent: Map<string, number>;
    missingData: Map<string, string[]>;
    recommendations: string[];
  }> {
    const byStudent = new Map<string, number>();
    const missingData = new Map<string, string[]>();
    const recommendations: string[] = [];
    let totalConfidence = 0;

    for (const studentId of context.studentIds) {
      const assessments = context.assessments.get(studentId) || [];
      const confidence = assessmentRegistry.calculateDataConfidence(assessments);
      byStudent.set(studentId, confidence);
      totalConfidence += confidence;

      // Check what's missing
      const missing: string[] = [];
      const hasTypes = new Set(assessments.map(a => a.assessmentType));
      
      if (!hasTypes.has('reading_level')) missing.push('Reading level assessment');
      if (!hasTypes.has('iep_goals')) missing.push('IEP goals');
      if (context.subject === 'math' && !hasTypes.has('math_computation')) {
        missing.push('Math computation assessment');
      }
      
      if (missing.length > 0) {
        missingData.set(studentId, missing);
      }
    }

    const overall = context.studentIds.length > 0 
      ? totalConfidence / context.studentIds.length 
      : 0;

    // Generate recommendations
    if (overall < 0.3) {
      recommendations.push('Minimal data available - using grade-level baselines');
      recommendations.push('Collect assessment data to improve personalization');
    } else if (overall < 0.7) {
      recommendations.push('Partial data available - some personalization applied');
      recommendations.push('Additional assessments would improve accuracy');
    } else {
      recommendations.push('Good data coverage - high confidence in personalization');
    }

    return {
      overall,
      byStudent,
      missingData,
      recommendations
    };
  }
}

export const promptAssembler = new PromptAssembler();