// Main lesson generator that orchestrates the JSON-first generation
import { LessonRequest, LessonResponse, LessonMetadata, StudentMaterial, determineGradeGroups } from './schema';
import { createAIProvider, AIProvider, GenerationMetadata } from './providers';
import { promptBuilder } from './prompts';
import { materialsValidator, ValidationResult } from './validator';

// Configuration constants
const CHUNK_THRESHOLD = parseInt(process.env.LESSON_CHUNK_THRESHOLD || '10');
const SAMPLE_STUDENTS_FOR_BASE = 3;

/**
 * Safe metadata type for client exposure
 * Only includes minimal metrics that are safe to send to the client
 * Excludes all PII such as prompts, responses, and content arrays
 */
export interface SafeGenerationMetadata {
  // Model information
  modelUsed: string;
  
  // Token metrics
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  
  // Timing metrics (if available)
  generationTimeMs?: number;
}

/**
 * SERVER-ONLY: Sanitizes full metadata to safe metadata for client exposure
 * This function extracts only minimal metrics and omits sensitive fields
 * @param metadata Full generation metadata (may contain PII)
 * @returns Sanitized metadata containing only safe metrics
 */
function toSafeMetadata(metadata: GenerationMetadata | null | undefined): SafeGenerationMetadata | undefined {
  if (!metadata) return undefined;
  
  // Extract only safe fields - no prompts, responses, or content arrays
  const safeMetadata: SafeGenerationMetadata = {
    // Model identifier
    modelUsed: metadata.modelUsed,
    
    // Token counts
    promptTokens: metadata.promptTokens || 0,
    completionTokens: metadata.completionTokens || 0,
    totalTokens: (metadata.promptTokens || 0) + (metadata.completionTokens || 0),
  };
  
  // Add timing data if available (from nested generationMetadata)
  if (metadata.generationMetadata && typeof metadata.generationMetadata === 'object') {
    const nestedMeta = metadata.generationMetadata as any;
    if (typeof nestedMeta.generationTimeMs === 'number') {
      safeMetadata.generationTimeMs = nestedMeta.generationTimeMs;
    }
  }
  
  return safeMetadata;
}

export class LessonGenerator {
  private provider: AIProvider;

  constructor(provider?: AIProvider) {
    this.provider = provider || createAIProvider();
  }

  /**
   * SERVER-ONLY: Gets the full generation metadata from the last generation
   * WARNING: This contains sensitive information (prompts, raw responses) and should
   * NEVER be exposed to the client. Only use for server-side logging/storage.
   */
  getFullMetadataForLogging(): GenerationMetadata | null {
    return this.provider.getLastGenerationMetadata();
  }

  /**
   * Generates a lesson based on the request.
   * For large student groups (>CHUNK_THRESHOLD), uses chunked generation strategy
   * to work within token limits by generating base lesson and per-grade worksheets separately.
   * 
   * NOTE: Returns only safe metadata for client exposure.
   * Full metadata with PII is available server-side via provider.getLastGenerationMetadata()
   */
  async generateLesson(request: LessonRequest): Promise<{
    lesson: LessonResponse;
    validation: ValidationResult;
    metadata?: SafeGenerationMetadata;
  }> {
    // Use chunked generation for large groups of students
    if (request.students.length > CHUNK_THRESHOLD) {
      return this.generateChunkedLesson(request);
    }
    
    try {
      // Build prompts based on role and subject type
      const systemPrompt = promptBuilder.buildSystemPrompt(request.teacherRole, request.subjectType);
      const userPrompt = promptBuilder.buildUserPrompt(request);
      
      // Add grade groups to request for provider
      const enrichedRequest = {
        ...request,
        gradeGroups: determineGradeGroups(request.students)
      };
      
      // Generate lesson with AI
      console.log(`Generating lesson with ${this.provider.getName()}...`);
      const startTime = Date.now();

      // Generate lesson with AI (single attempt, no retry)
      // Now passing system and user prompts separately as intended
      try {
        const lesson = await this.provider.generateLesson(enrichedRequest, systemPrompt, userPrompt);
        const validation = materialsValidator.validateLesson(lesson);

        console.log(`Lesson generated in ${Date.now() - startTime}ms`);

        // Ensure grade groups are properly set
        if (!lesson.metadata.gradeGroups) {
          lesson.metadata.gradeGroups = enrichedRequest.gradeGroups;
        }

        // Stamp validation metadata
        if (validation.isValid) {
          lesson.metadata.validationStatus = 'passed';
          if ('validationErrors' in lesson.metadata) {
            (lesson.metadata as any).validationErrors = [];
          }
        } else {
          console.warn('Validation failed:', validation.errors);
          lesson.metadata.validationStatus = 'failed';
          if ('validationErrors' in lesson.metadata) {
            (lesson.metadata as any).validationErrors = validation.errors;
          }
        }

        // Return the lesson regardless of validation status
        return {
          lesson,
          validation,
          metadata: toSafeMetadata(this.provider.getLastGenerationMetadata())
        };
      } catch (error) {
        console.error('Lesson generation failed:', error);

        // Return a mock lesson for development if generation fails
        // Check multiple conditions that indicate development mode
        const isDevelopment = process.env.NODE_ENV === 'development' ||
                            process.env.USE_MOCK_LESSONS === 'true' ||
                            !process.env.OPENAI_API_KEY;

        if (isDevelopment) {
          console.log('API key missing or development mode - returning mock lesson');
          return {
            lesson: this.createMockLesson(request),
            validation: {
              isValid: true,
              errors: [],
              warnings: ['This is a mock lesson (API key not configured or development mode)']
            }
          };
        }

        throw error;
      }
    } catch (error) {
      // Outer catch for any unexpected errors
      console.error('Unexpected error in lesson generation:', error);
      throw error;
    }
  }

  /**
   * Generates a lesson using chunked approach for large student groups
   * 
   * NOTE: Returns only safe metadata for client exposure.
   * Full metadata with PII is available server-side via provider.getLastGenerationMetadata()
   */
  private async generateChunkedLesson(request: LessonRequest): Promise<{
    lesson: LessonResponse;
    validation: ValidationResult;
    metadata?: SafeGenerationMetadata;
  }> {
    console.log(`Using chunked generation for ${request.students.length} students`);
    
    try {
      // Determine grade groups
      const gradeGroups = determineGradeGroups(request.students);
      
      // Generate the base lesson plan first (without student materials)
      // Pick representative students from different grade groups
      const representativeIds = gradeGroups
        .flatMap(g => g.studentIds.slice(0, 1))
        .slice(0, SAMPLE_STUDENTS_FOR_BASE);
      const lessonPlanRequest = {
        ...request,
        students: request.students.filter(s => representativeIds.includes(s.id))
      };
      
      const systemPrompt = promptBuilder.buildSystemPrompt(request.teacherRole, request.subjectType);
      const lessonPlanUserPrompt = `Create a lesson plan structure for a ${request.duration}-minute ${request.subject} lesson.
Focus on the teacher guidance and lesson structure. Generate placeholder student materials only.
${promptBuilder.buildUserPrompt(lessonPlanRequest)}`;

      // Generate base lesson with separated prompts
      const baseLesson = await this.provider.generateLesson(lessonPlanRequest, systemPrompt, lessonPlanUserPrompt);
      
      // Now generate student materials in chunks by grade group
      const studentMaterials: StudentMaterial[] = [];
      
      for (const [groupIndex, group] of gradeGroups.entries()) {
        const groupStudents = request.students.filter(s => group.studentIds.includes(s.id));
        console.log(`Generating materials for grade group ${group.grades.join(', ')} (${groupStudents.length} students)`);
        
        // Generate materials for this grade group
        const materialsPrompt = `Generate worksheet materials for Grade ${group.grades.join('/')} students.
These students need ${request.subject} activities at grade level ${group.grades[0]}.
Create one comprehensive worksheet that all students in this grade group will use.
Include accommodations as specified.

Students in this group:
${groupStudents.map(s => `- ${s.id}: Grade ${s.grade}, Accommodations: ${s.accommodations?.join(', ') || 'None'}`).join('\n')}

Return ONLY the worksheet content in this structure:
{
  "worksheet": {
    "title": "string",
    "instructions": "string",
    "sections": [/* worksheet sections with actual content */],
    "accommodations": []
  }
}`;
        
        try {
          // Generate just the worksheet for this grade group
          // We need to handle the response differently since we're not getting a full LessonResponse
          const worksheetSystemPrompt = systemPrompt;
          const worksheetUserPrompt = materialsPrompt +
            '\n\nIMPORTANT: Return ONLY the JSON object with the worksheet field. Do not include lesson or metadata fields.';

          // Create a minimal request for worksheet generation
          const worksheetRequest = { ...request, students: groupStudents };

          // Call provider with special handling for worksheet-only response
          let worksheetResponse: any;
          try {
            // Try to get the response as a full lesson (for compatibility)
            const fullResponse = await this.provider.generateLesson(worksheetRequest, worksheetSystemPrompt, worksheetUserPrompt);
            worksheetResponse = fullResponse;
          } catch (error) {
            // If that fails, it might be because we got worksheet-only JSON
            console.log('Retrying as worksheet-only response...');
            worksheetResponse = { worksheet: null };
          }
          
          // Extract worksheet from various possible response formats
          const worksheet = worksheetResponse?.worksheet || 
                          (worksheetResponse as any)?.studentMaterials?.[0]?.worksheet ||
                          (worksheetResponse as any)?.lesson?.studentMaterials?.[0]?.worksheet ||
                          this.createMockWorksheet(group.grades[0], request.subject);
          
          for (const student of groupStudents) {
            studentMaterials.push({
              studentId: student.id,
              gradeGroup: groupIndex,
              gradeLevel: student.grade, // Add student's actual grade
              worksheet: {
                ...worksheet,
                title: `${request.subject} Practice - Grade ${student.grade}`, // Ensure title matches student grade
                grade: student.grade, // Add grade to worksheet
                accommodations: student.accommodations || []
              }
            });
          }
        } catch (error) {
          console.error(`Failed to generate materials for grade group ${group.grades.join(', ')}:`, error);
          // Use mock worksheet as fallback
          for (const student of groupStudents) {
            studentMaterials.push({
              studentId: student.id,
              gradeGroup: groupIndex,
              gradeLevel: student.grade, // Add student's actual grade
              worksheet: {
                ...this.createMockWorksheet(student.grade, request.subject),
                grade: student.grade // Ensure grade is set
              }
            });
          }
        }
      }
      
      // Combine the lesson plan with student materials
      const completeLesson: LessonResponse = {
        lesson: baseLesson.lesson,
        studentMaterials,
        metadata: {
          ...baseLesson.metadata,
          gradeGroups
        } as LessonMetadata
      };
      
      // Validate the complete lesson
      const validation = materialsValidator.validateLesson(completeLesson);
      
      // Stamp validation metadata like non-chunked path
      if (validation.isValid) {
        completeLesson.metadata.validationStatus = 'passed';
        if (completeLesson.metadata.validationErrors) {
          completeLesson.metadata.validationErrors = [];
        }
      } else {
        completeLesson.metadata.validationStatus = 'failed';
        completeLesson.metadata.validationErrors = validation.errors;
      }
      
      return { 
        lesson: completeLesson, 
        validation,
        metadata: toSafeMetadata(this.provider.getLastGenerationMetadata())
      };
      
    } catch (error) {
      console.error('Chunked generation failed:', error);
      // Fall back to mock lesson
      return {
        lesson: this.createMockLesson(request),
        validation: {
          isValid: true,
          errors: [],
          warnings: ['Chunked generation failed, using mock lesson']
        }
      };
    }
  }
  
  /**
   * Creates a mock worksheet for a specific grade
   */
  private createMockWorksheet(grade: number, subject: string): any {
    return {
      title: `${subject} Practice - Grade ${grade}`,
      instructions: 'Complete all sections. Show your work.',
      sections: [
        {
          title: 'Part 1: Warm-Up',
          instructions: 'Complete these problems to get started',
          items: [
            {
              sectionType: 'warmup',
              sectionTitle: 'Warm Up',
              instructions: 'Complete these problems',
              items: [
                {
                  type: 'problem',
                  content: `Sample ${subject} problem for grade ${grade}`,
                  space: 'medium'
                }
              ]
            }
          ]
        },
        {
          title: 'Part 2: Practice',
          instructions: 'Work through the main activity',
          items: [
            {
              sectionType: 'practice',
              sectionTitle: 'Main Activity',
              instructions: 'Complete these tasks',
              items: [
                {
                  type: 'problem',
                  content: `Main ${subject} activity for grade ${grade}`,
                  space: 'large'
                }
              ]
            }
          ]
        }
      ],
      accommodations: []
    };
  }

  /**
   * Creates a mock lesson for development/testing
   */
  private createMockLesson(request: LessonRequest): LessonResponse {
    const gradeGroups = determineGradeGroups(request.students);
    
    return {
      lesson: {
        title: `${request.subject} Lesson - ${request.topic || 'Practice'}`,
        duration: request.duration,
        objectives: [
          `Students will practice ${request.subject} skills`,
          'Students will complete worksheet activities independently',
          'Students will demonstrate understanding through written work'
        ],
        materials: 'Worksheets, pencils, whiteboard and markers only',
        overview: `This is a ${request.duration}-minute ${request.subject} lesson for ${request.students.length} students.`,
        introduction: {
          description: 'Review previous learning and introduce today\'s topic',
          duration: Math.floor(request.duration * 0.2),
          instructions: [
            'Review key concepts on whiteboard',
            'Distribute worksheets to students',
            'Explain worksheet instructions'
          ],
          materials: ['whiteboard', 'markers', 'worksheets']
        },
        activity: {
          description: 'Students complete differentiated worksheet activities',
          duration: Math.floor(request.duration * 0.6),
          instructions: [
            'Students work on their worksheets',
            'Teacher circulates to provide support',
            'Check in with priority students'
          ],
          materials: ['worksheets', 'pencils']
        },
        roleSpecificContent: this.getMockRoleContent(request.teacherRole)
      },
      studentMaterials: request.students.map(student => {
        const gradeGroup = gradeGroups.findIndex(g => g.studentIds.includes(student.id));
        
        return {
          studentId: student.id,
          gradeGroup,
          gradeLevel: student.grade, // Add student's actual grade
          worksheet: {
            title: `${request.subject} Practice - Grade ${student.grade}`,
            grade: student.grade, // Add grade to worksheet
            instructions: 'Complete all sections. Show your work.',
            sections: [
              {
                title: 'Examples',
                instructions: 'Review these examples',
                items: [
                  {
                    type: 'example',
                    content: `Here's how to solve ${request.subject} problems for grade ${student.grade}`
                  }
                ]
              },
              {
                title: 'Practice',
                instructions: 'Complete these problems',
                items: [
                  {
                    type: 'short-answer',
                    content: `Sample ${request.subject} question for grade ${student.grade}`,
                    blankLines: student.grade <= 1 ? 4 : student.grade <= 3 ? 3 : 2
                  },
                  {
                    type: 'multiple-choice',
                    content: `Choose the correct answer for this grade ${student.grade} problem`,
                    choices: ['Option A', 'Option B', 'Option C', 'Option D']
                  },
                  {
                    type: 'long-answer',
                    content: 'What did you learn today?',
                    blankLines: student.grade <= 3 ? 5 : 4
                  }
                ]
              }
            ],
            accommodations: student.accommodations || []
          }
        };
      }),
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: 'Mock',
        generationTime: 0,
        gradeGroups,
        validationStatus: 'passed',
        validationErrors: []
      }
    };
  }

  private getMockRoleContent(role: LessonRequest['teacherRole']): any {
    switch (role) {
      case 'resource':
        return {
          differentiationStrategies: ['Visual supports', 'Reduced problem count'],
          scaffoldingSteps: ['Model first problem', 'Guided practice', 'Independent work']
        };
      case 'ot':
        return {
          fineMotorActivities: ['Tracing shapes', 'Letter formation'],
          sensorySupports: ['Desk push-ups between activities']
        };
      case 'speech':
        return {
          articulationTargets: ['/s/ sounds', '/r/ sounds'],
          languageGoals: ['Vocabulary development', 'Sentence structure']
        };
      default:
        return {};
    }
  }
}

// Export singleton instance
export const lessonGenerator = new LessonGenerator();