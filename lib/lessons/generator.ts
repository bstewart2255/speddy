// Main lesson generator that orchestrates the JSON-first generation
import { LessonRequest, LessonResponse, LessonMetadata, StudentMaterial, determineGradeGroups } from './schema';
import { createAIProvider, AIProvider, GenerationMetadata } from './providers';
import { promptBuilder } from './prompts';
import { materialsValidator, ValidationResult } from './validator';

// Configuration constants
const CHUNK_THRESHOLD = parseInt(process.env.LESSON_CHUNK_THRESHOLD || '10');
const MAX_GENERATION_ATTEMPTS = 2;
const SAMPLE_STUDENTS_FOR_BASE = 3;

/**
 * Safe metadata type for client exposure
 * Only includes non-sensitive fields that are safe to send to the client
 * Full metadata with PII should only be used server-side for logging/debugging
 */
export type SafeGenerationMetadata = Pick<GenerationMetadata, 
  'modelUsed' | 'promptTokens' | 'completionTokens'
>;

/**
 * SERVER-ONLY: Converts full metadata to safe metadata for client exposure
 * This function should only be called on the server side
 * @param metadata Full generation metadata (may contain PII)
 * @returns Safe metadata without sensitive information
 */
function toSafeMetadata(metadata: GenerationMetadata | null | undefined): SafeGenerationMetadata | undefined {
  if (!metadata) return undefined;
  
  return {
    modelUsed: metadata.modelUsed,
    promptTokens: metadata.promptTokens,
    completionTokens: metadata.completionTokens
  };
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
      // Build prompts based on role
      const systemPrompt = promptBuilder.buildSystemPrompt(request.teacherRole);
      const userPrompt = promptBuilder.buildUserPrompt(request);
      
      // Add grade groups to request for provider
      const enrichedRequest = {
        ...request,
        gradeGroups: determineGradeGroups(request.students)
      };
      
      // Generate lesson with AI
      console.log(`Generating lesson with ${this.provider.getName()}...`);
      const startTime = Date.now();
      
      let lesson: LessonResponse | undefined;
      let attempts = 0;
      
      // Try generation with retry on failure
      let dynamicSystemPrompt = systemPrompt + '\n\nUSER REQUEST:\n' + userPrompt;
      
      while (attempts < MAX_GENERATION_ATTEMPTS) {
        attempts++;
        
        try {
          // Generate using the current dynamic prompt
          lesson = await this.provider.generateLesson(enrichedRequest, dynamicSystemPrompt);
          const validation = materialsValidator.validateLesson(lesson);
          
          if (validation.isValid) {
            console.log(`Lesson generated successfully in ${Date.now() - startTime}ms`);
            
            // Ensure grade groups are properly set
            if (!lesson.metadata.gradeGroups) {
              lesson.metadata.gradeGroups = enrichedRequest.gradeGroups;
            }
            
            // Stamp validation metadata on success
            lesson.metadata.validationStatus = 'passed';
            if ('validationErrors' in lesson.metadata) {
              (lesson.metadata as any).validationErrors = [];
            }
            
            return { 
              lesson, 
              validation,
              metadata: toSafeMetadata(this.provider.getLastGenerationMetadata())
            };
          } else {
            console.warn(`Validation failed on attempt ${attempts}:`, validation.errors);
            
            if (attempts < MAX_GENERATION_ATTEMPTS) {
              console.log('Retrying with additional constraints...');
              
              // Persist additional constraints into the next attempt prompt
              const errorFeedback =
                `\n\nPREVIOUS ATTEMPT HAD ERRORS:\n${validation.errors.join('\n')}\n\n` +
                `Please fix these issues and ensure strict compliance with material constraints.`;
              dynamicSystemPrompt += errorFeedback;
              continue;
            }
          }
        } catch (error) {
          console.error(`Generation attempt ${attempts} failed:`, error);
          
          if (attempts >= MAX_GENERATION_ATTEMPTS) {
            throw error;
          }
        }
      }
      
      // If we get here, we may have a lesson but validation may have failed
      // Ensure we validate the final lesson attempt
      if (lesson) {
        const finalValidation = materialsValidator.validateLesson(lesson);
        
        // Ensure grade groups are properly set
        if (!lesson.metadata.gradeGroups) {
          lesson.metadata.gradeGroups = enrichedRequest.gradeGroups;
        }
        
        // Return the lesson even if validation failed (UI can show warnings)
        return { 
          lesson, 
          validation: finalValidation 
        };
      }
      
      // No lesson was generated successfully
      throw new Error('Failed to generate lesson after all attempts');
      
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
      
      const systemPrompt = promptBuilder.buildSystemPrompt(request.teacherRole);
      const lessonPlanPrompt = `Create a lesson plan structure for a ${request.duration}-minute ${request.subject} lesson. 
Focus on the teacher guidance and lesson structure. Generate placeholder student materials only.
${promptBuilder.buildUserPrompt(lessonPlanRequest)}`;
      
      // Generate base lesson
      const baseLesson = await this.provider.generateLesson(lessonPlanRequest, systemPrompt + '\n\n' + lessonPlanPrompt);
      
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
          const worksheetPrompt = systemPrompt + '\n\n' + materialsPrompt + 
            '\n\nIMPORTANT: Return ONLY the JSON object with the worksheet field. Do not include lesson or metadata fields.';
          
          // Create a minimal request for worksheet generation
          const worksheetRequest = { ...request, students: groupStudents };
          
          // Call provider with special handling for worksheet-only response
          let worksheetResponse: any;
          try {
            // Try to get the response as a full lesson (for compatibility)
            const fullResponse = await this.provider.generateLesson(worksheetRequest, worksheetPrompt);
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
              worksheet: {
                ...worksheet,
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
              worksheet: this.createMockWorksheet(student.grade, request.subject)
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
        mainActivity: {
          description: 'Students complete differentiated worksheet activities',
          duration: Math.floor(request.duration * 0.6),
          instructions: [
            'Students work on their worksheets',
            'Teacher circulates to provide support',
            'Check in with priority students'
          ],
          materials: ['worksheets', 'pencils']
        },
        closure: {
          description: 'Review learning and assess understanding',
          duration: Math.floor(request.duration * 0.2),
          instructions: [
            'Review answers as a group',
            'Students complete exit ticket on worksheet',
            'Collect worksheets'
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
          worksheet: {
            title: `${request.subject} Practice - Grade ${student.grade}`,
            instructions: 'Complete all sections. Show your work.',
            sections: [
              {
                title: 'Part 1: Warm-Up',
                instructions: 'Complete these problems to get started',
                items: [
                  {
                    sectionType: 'warmup',
                    sectionTitle: 'Warm Up',
                    instructions: 'Complete these problems to get started',
                    items: [
                      {
                        type: 'problem',
                        content: `Sample problem for grade ${student.grade}`,
                        space: 'medium'
                      }
                    ]
                  }
                ]
              },
              {
                title: 'Part 2: Practice',
                instructions: 'Work through these problems',
                items: [
                  {
                    sectionType: 'practice',
                    sectionTitle: 'Practice',
                    instructions: 'Work through these problems',
                    items: [
                      {
                        type: 'problem',
                        content: `Main activity for grade ${student.grade}`,
                        space: 'large'
                      }
                    ]
                  }
                ]
              },
              {
                title: 'Part 3: Exit Ticket',
                instructions: 'Show what you learned',
                items: [
                  {
                    sectionType: 'assessment',
                    sectionTitle: 'Exit Ticket',
                    instructions: 'Show what you learned',
                    items: [
                      {
                        type: 'question',
                        content: 'What did you learn today?',
                        blankLines: 3
                      }
                    ]
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