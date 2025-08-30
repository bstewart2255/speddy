// Main lesson generator that orchestrates the JSON-first generation
import { LessonRequest, LessonResponse, determineGradeGroups } from './schema';
import { createAIProvider, AIProvider } from './providers';
import { promptBuilder } from './prompts';
import { materialsValidator, ValidationResult } from './validator';

export class LessonGenerator {
  private provider: AIProvider;

  constructor(provider?: AIProvider) {
    this.provider = provider || createAIProvider();
  }

  /**
   * Generates a lesson based on the request
   */
  async generateLesson(request: LessonRequest): Promise<{
    lesson: LessonResponse;
    validation: ValidationResult;
  }> {
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
      
      let lesson: LessonResponse;
      let attempts = 0;
      const maxAttempts = 2;
      
      // Try generation with retry on failure
      while (attempts < maxAttempts) {
        attempts++;
        
        try {
          // Create a modified system prompt that includes the user prompt for better context
          const combinedSystemPrompt = systemPrompt + '\n\nUSER REQUEST:\n' + userPrompt;
          
          lesson = await this.provider.generateLesson(
            enrichedRequest,
            combinedSystemPrompt
          );
          
          // Validate the generated lesson
          const validation = materialsValidator.validateLesson(lesson);
          
          if (validation.isValid) {
            console.log(`Lesson generated successfully in ${Date.now() - startTime}ms`);
            
            // Ensure grade groups are properly set
            if (!lesson.metadata.gradeGroups) {
              lesson.metadata.gradeGroups = enrichedRequest.gradeGroups;
            }
            
            return { lesson, validation };
          } else {
            console.warn(`Validation failed on attempt ${attempts}:`, validation.errors);
            
            if (attempts < maxAttempts) {
              console.log('Retrying with additional constraints...');
              
              // Modify system prompt to emphasize the validation errors
              const errorFeedback = `\n\nPREVIOUS ATTEMPT HAD ERRORS:\n${validation.errors.join('\n')}\n\nPlease fix these issues and ensure strict compliance with material constraints.`;
              
              lesson = await this.provider.generateLesson(
                enrichedRequest,
                combinedSystemPrompt + errorFeedback
              );
            }
          }
        } catch (error) {
          console.error(`Generation attempt ${attempts} failed:`, error);
          
          if (attempts >= maxAttempts) {
            throw error;
          }
        }
      }
      
      // If we get here, validation failed even after retries
      const finalValidation = materialsValidator.validateLesson(lesson!);
      
      // Return the lesson even if validation failed (UI can show warnings)
      return { 
        lesson: lesson!, 
        validation: finalValidation 
      };
      
    } catch (error) {
      console.error('Lesson generation failed:', error);
      
      // Return a mock lesson for development if generation fails
      if (process.env.NODE_ENV === 'development') {
        console.log('Returning mock lesson for development');
        return {
          lesson: this.createMockLesson(request),
          validation: {
            isValid: true,
            errors: [],
            warnings: ['This is a mock lesson for development']
          }
        };
      }
      
      throw error;
    }
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
            content: [
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
              },
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
              },
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