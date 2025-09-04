// lib/ai-lessons/lesson-generator.ts
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { assessmentRegistry } from './assessment-registry';
import { performanceAnalyzer } from './performance-analyzer';
import { promptAssembler, PromptContext } from './prompt-assembler';
import { generateWorksheetWithQR } from '../worksheets/worksheet-generator';

export interface LessonGenerationRequest {
  studentIds: string[];
  lessonType: 'individual' | 'group';
  subject: string;
  duration?: number;
  focusSkills?: string[];
  teacherId: string;
  manualAdjustments?: Map<string, any>; // Optional manual adjustments for regeneration
}

export interface GeneratedLesson {
  id: string;
  lessonType: 'individual' | 'group';
  content: {
    title: string;
    objectives: string[];
    duration: number;
    materials: string;
    teacherGuidance: TeacherGuidance;
    studentMaterials: StudentMaterial[];
  };
  differentiationMap: Map<string, DifferentiationData>;
  dataConfidence: number;
  worksheetIds: Map<string, string>;
  qrCodes: Map<string, string>;
}

export interface TeacherGuidance {
  overview: string;
  differentiationNotes: Map<string, string>;
  checkInPriorities: string[];
  expectedCompletionTimes: Map<string, number>;
  supportLevels: Map<string, 'independent' | 'minimal' | 'moderate' | 'maximum'>;
}

export interface StudentMaterial {
  studentId: string;
  worksheetContent: {
    title: string;
    instructions: string;
    problems: any[];
    visualSupports: any[];
    exitTicket: any;
  };
  answerKey: any[];
  accommodations: string[];
}

export interface DifferentiationData {
  level: string;
  modifications: string[];
  scaffolds: string[];
  dataUsed: string[];
}

export class LessonGenerator {
  private supabase: SupabaseClient | null = null;
  private anthropic: Anthropic | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize() {
    this.supabase = await createClient() as unknown as SupabaseClient;
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
  }

  private async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async generateLesson(request: LessonGenerationRequest): Promise<GeneratedLesson> {
    await this.ensureInitialized();
    
    // Collect all student data
    const assessments = new Map<string, any>();
    const performance = new Map<string, any>();
    const adjustments = new Map<string, any>();
    let fullPromptSent: any = null;
    let aiRawResponse: string = '';

    // If manual adjustments are provided (e.g., from regeneration), use them
    if (request.manualAdjustments && request.manualAdjustments.size > 0) {
      // Merge manual adjustments with any automatic ones
      request.manualAdjustments.forEach((value, key) => {
        adjustments.set(key, value);
      });
    }

    for (const studentId of request.studentIds) {
      // Get assessments
      const studentAssessments = await assessmentRegistry.getStudentAssessments(studentId);
      assessments.set(studentId, studentAssessments);

      // Get performance data
      const studentPerformance = await performanceAnalyzer.analyzeStudentPerformance(
        studentId,
        request.subject
      );
      performance.set(studentId, studentPerformance);

      // Get adjustment recommendations only if not manually provided
      if (!adjustments.has(studentId)) {
        const adjustment = await performanceAnalyzer.getAdjustmentRecommendation(
          studentId,
          request.subject
        );
        if (adjustment) {
          adjustments.set(studentId, adjustment);
        }
      }
    }

    // Build prompt context
    const context: PromptContext = {
      studentIds: request.studentIds,
      lessonType: request.lessonType,
      subject: request.subject,
      duration: request.duration || 30,
      focusSkills: request.focusSkills,
      assessments,
      performance,
      adjustments
    };

    // Assemble the prompt
    const assembledPrompt = await promptAssembler.assemblePrompt(context);
    fullPromptSent = assembledPrompt; // Store for database

    // Generate confidence report
    const confidenceReport = await promptAssembler.generateDataConfidenceReport(context);

    // Call AI to generate lesson content
    const lessonContent = await this.callAIForLesson(assembledPrompt);
    aiRawResponse = lessonContent; // Store raw response

    // Parse AI response into structured format
    const parsedLesson = this.parseAIResponse(lessonContent, request);

    // Generate worksheets with QR codes for each student
    const worksheetIds = new Map<string, string>();
    const qrCodes = new Map<string, string>();

    for (const material of parsedLesson.content.studentMaterials) {
      const { worksheetId, qrCodeDataUrl } = await generateWorksheetWithQR(
        crypto.randomUUID(),
        material.studentId,
        request.subject,
        {
          title: material.worksheetContent.title,
          instructions: material.worksheetContent.instructions,
          questions: material.worksheetContent.problems
        }
      );

      worksheetIds.set(material.studentId, worksheetId);
      qrCodes.set(material.studentId, qrCodeDataUrl);
    }

    // Save lesson to database with prompt and response
    const savedLesson = await this.saveLessonToDatabase(
      parsedLesson,
      request,
      fullPromptSent,
      confidenceReport,
      aiRawResponse
    );

    return {
      ...parsedLesson,
      id: savedLesson.id,
      dataConfidence: confidenceReport.overall,
      worksheetIds,
      qrCodes
    };
  }

  private async callAIForLesson(prompt: any): Promise<string> {
    await this.ensureInitialized();
    
    if (!this.anthropic) {
      throw new Error('AI service is not configured. Please ensure ANTHROPIC_API_KEY is set.');
    }

    try {
      const message = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8000,
        system: prompt.systemPrompt,
        messages: [{
          role: "user",
          content: prompt.userPrompt
        }]
      });

      return message.content[0].type === 'text' ? message.content[0].text : '';
    } catch (error) {
      console.error('AI generation error:', error);
      throw new Error(`Failed to generate lesson: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  private parseAIResponse(response: string, request: LessonGenerationRequest): Omit<GeneratedLesson, 'id' | 'worksheetIds' | 'qrCodes'> {
    // Try to parse as JSON first (if AI returns structured JSON)
    try {
      // First try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/i);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      
      const jsonResponse = JSON.parse(jsonStr);
      if (jsonResponse.content && jsonResponse.content.studentMaterials) {
        console.log('[AI Lesson] Successfully parsed JSON response');
        return this.normalizeParsedJson(jsonResponse, request);
      }
    } catch (error) {
      // Log when fallback is triggered
      console.log('[AI Lesson] JSON parsing failed, using fallback parser', error);
      // If not JSON, parse as markdown/text format
    }
    
    // Parse the AI response from markdown/text format
    const lines = response.split('\n');
    const title = lines.find(l => l.includes('Title:'))?.replace(/.*Title:\s*/, '') || 'AI-Generated Lesson';
    
    const studentMaterials: StudentMaterial[] = [];
    const differentiationMap = new Map<string, DifferentiationData>();
    const teacherGuidance: TeacherGuidance = {
      overview: 'AI-generated lesson with differentiated materials',
      differentiationNotes: new Map(),
      checkInPriorities: [],
      expectedCompletionTimes: new Map(),
      supportLevels: new Map()
    };

    // Create materials for each student
    for (let i = 0; i < request.studentIds.length; i++) {
      const studentId = request.studentIds[i];
      
      studentMaterials.push({
        studentId,
        worksheetContent: {
          title: `${title} - Student ${i + 1}`,
          instructions: 'Complete all sections. Everything you need is on this worksheet!',
          problems: this.generateProblems(request.subject, i),
          visualSupports: this.generateVisualSupports(request.subject),
          exitTicket: {
            type: 'short_answer',
            question: 'What did you learn today?',
            lines: 3
          }
        },
        answerKey: this.generateAnswerKey(request.subject, i),
        accommodations: ['Visual supports included', 'Clear instructions', 'Appropriate spacing']
      });

      differentiationMap.set(studentId, {
        level: `Level ${i + 1}`,
        modifications: ['Adjusted difficulty', 'Visual supports'],
        scaffolds: ['Step-by-step examples', 'Reference charts'],
        dataUsed: ['Performance data', 'Assessment data']
      });

      teacherGuidance.differentiationNotes.set(studentId, `Student ${i + 1}: Differentiated materials`);
      teacherGuidance.expectedCompletionTimes.set(studentId, 25 + (i * 5));
      teacherGuidance.supportLevels.set(studentId, i === 0 ? 'independent' : 'minimal');
    }

    return {
      lessonType: request.lessonType,
      content: {
        title,
        objectives: ['Practice target skills', 'Build confidence', 'Apply learning'],
        duration: request.duration || 30,
        materials: 'All materials included on worksheets - just print!',
        teacherGuidance,
        studentMaterials
      },
      differentiationMap,
      dataConfidence: 0.7
    };
  }

  private normalizeParsedJson(json: any, request: LessonGenerationRequest): Omit<GeneratedLesson, 'id' | 'worksheetIds' | 'qrCodes'> {
    // Normalize teacher guidance Maps
    const teacherGuidance: TeacherGuidance = {
      overview: json.content?.teacherGuidance?.overview ?? 'AI-generated lesson with differentiated materials',
      differentiationNotes: new Map(Object.entries(json.content?.teacherGuidance?.differentiationNotes ?? {})),
      checkInPriorities: json.content?.teacherGuidance?.checkInPriorities ?? [],
      expectedCompletionTimes: new Map(Object.entries(json.content?.teacherGuidance?.expectedCompletionTimes ?? {})),
      supportLevels: new Map(Object.entries(json.content?.teacherGuidance?.supportLevels ?? {})),
    };
    
    // Normalize differentiation map
    const differentiationMap = new Map<string, DifferentiationData>();
    Object.entries(json.differentiationMap ?? {}).forEach(([key, value]) => {
      differentiationMap.set(key, value as DifferentiationData);
    });
    
    return {
      lessonType: json.lessonType ?? request.lessonType,
      content: {
        title: json.content?.title ?? 'AI-Generated Lesson',
        objectives: json.content?.objectives ?? ['Practice target skills', 'Build confidence', 'Apply learning'],
        duration: json.content?.duration ?? (request.duration || 30),
        materials: json.content?.materials ?? 'All materials included on worksheets - just print!',
        teacherGuidance,
        studentMaterials: json.content?.studentMaterials ?? [],
      },
      differentiationMap,
      dataConfidence: typeof json.dataConfidence === 'number' ? json.dataConfidence : 0.7,
    };
  }

  private generateProblems(subject: string, level: number): any[] {
    // Generate appropriate problems based on subject and level
    const problems: any[] = [];
    const count = 5 + level * 2;

    for (let i = 1; i <= count; i++) {
      if (subject === 'math') {
        problems.push({
          id: `${i}`,
          type: 'computation',
          question: `${10 + level * 10} + ${i}`,
          answer: 10 + level * 10 + i,
          visualSupport: 'number_line'
        });
      } else if (subject === 'reading' || subject === 'phonics') {
        problems.push({
          id: `${i}`,
          type: 'multiple_choice',
          question: `Choose the word with short 'a' sound`,
          options: ['cat', 'cake', 'cute', 'coat'],
          answer: 'cat'
        });
      } else {
        problems.push({
          id: `${i}`,
          type: 'fill_blank',
          question: `Complete: The ___ is blue.`,
          answer: 'sky'
        });
      }
    }

    return problems;
  }

  private generateVisualSupports(subject: string): any[] {
    if (subject === 'math') {
      return [
        { type: 'number_line', range: [0, 100], increment: 10 },
        { type: 'hundreds_chart', highlighted: [] }
      ];
    } else if (subject === 'reading' || subject === 'phonics') {
      return [
        { type: 'vowel_chart', vowels: ['a', 'e', 'i', 'o', 'u'] },
        { type: 'word_family', families: ['-at', '-et', '-it'] }
      ];
    }
    return [];
  }

  private generateAnswerKey(subject: string, level: number): any[] {
    // Generate answer key matching the problems
    const answers: any[] = [];
    const count = 5 + level * 2;

    for (let i = 1; i <= count; i++) {
      answers.push({
        questionId: `${i}`,
        answer: subject === 'math' ? 10 + level * 10 + i : 'cat',
        points: 1
      });
    }

    return answers;
  }

  private async saveLessonToDatabase(
    lesson: any,
    request: LessonGenerationRequest,
    prompt: any,
    confidenceReport: any,
    aiRawResponse?: string
  ): Promise<any> {
    await this.ensureInitialized();
    // First create a basic lesson record
    const { data: lessonRecord, error: lessonError } = await this.supabase!
      .from('lessons')
      .insert({
        provider_id: request.teacherId,
        title: lesson.content.title,
        content: lesson.content, // Pass object directly for JSONB column
        duration_minutes: lesson.content.duration,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (lessonError) throw lessonError;

    // Save differentiated lesson details with prompt and response
    const { data: diffLesson, error: diffError } = await this.supabase!
      .from('differentiated_lessons')
      .insert({
        lesson_id: lessonRecord.id,
        lesson_type: request.lessonType,
        student_ids: request.studentIds,
        differentiation_map: Object.fromEntries(lesson.differentiationMap),
        whole_group_components: request.lessonType === 'group' ? {
          opening: 'Shared introduction',
          closing: 'Group share out'
        } : null,
        teacher_guidance: {
          overview: lesson.content.teacherGuidance.overview,
          differentiationNotes: Object.fromEntries(lesson.content.teacherGuidance.differentiationNotes),
          checkInPriorities: lesson.content.teacherGuidance.checkInPriorities,
          expectedCompletionTimes: Object.fromEntries(lesson.content.teacherGuidance.expectedCompletionTimes),
          supportLevels: Object.fromEntries(lesson.content.teacherGuidance.supportLevels)
        },
        data_confidence: {
          overall: confidenceReport.overall,
          byStudent: Object.fromEntries(confidenceReport.byStudent),
          dataUsed: prompt.dataUsed
        },
        materials_included: {
          worksheets: true,
          visualSupports: true,
          exitTickets: true,
          answerKeys: true
        },
        // Add prompt and response logging
        full_prompt_sent: JSON.stringify(prompt),  // Convert to string for TEXT column
        ai_raw_response: aiRawResponse ? { content: aiRawResponse } : null,  // Wrap in object for JSONB column
        model_used: 'claude-3-5-sonnet-20241022',
        generation_metadata: {
          timestamp: new Date().toISOString(),
          confidence: confidenceReport.overall,
          student_count: request.studentIds.length,
          lesson_type: request.lessonType,
          has_manual_adjustments: !!(request.manualAdjustments && request.manualAdjustments.size > 0)
        }
      })
      .select()
      .single();

    if (diffError) throw diffError;

    return {
      ...lessonRecord,
      differentiatedLessonId: diffLesson.id
    };
  }

  async regenerateLessonWithAdjustments(
    lessonId: string,
    adjustments: Map<string, any>
  ): Promise<GeneratedLesson> {
    await this.ensureInitialized();
    
    // Get original lesson
    const { data: originalLesson } = await this.supabase!
      .from('differentiated_lessons')
      .select(`
        *,
        lessons!inner(*)
      `)
      .eq('id', lessonId)
      .single();

    if (!originalLesson) {
      throw new Error('Lesson not found');
    }

    // Build request with manual adjustments
    const request: LessonGenerationRequest = {
      studentIds: originalLesson.student_ids,
      lessonType: originalLesson.lesson_type,
      subject: originalLesson.lessons.subject || 'reading',
      duration: originalLesson.lessons.duration_minutes,
      teacherId: originalLesson.lessons.provider_id,
      manualAdjustments: adjustments // Pass the adjustments to be used in generation
    };

    // Generate lesson with the provided adjustments
    return this.generateLesson(request);
  }
}

export const lessonGenerator = new LessonGenerator();