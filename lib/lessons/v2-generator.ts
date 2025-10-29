// V2 Generator - Template-based worksheet generation
// Flow: Template Selection → AI (content only) → Template Population → Rendering

import Anthropic from '@anthropic-ai/sdk';
import type { TemplateTopic } from '@/lib/templates/types';
import { selectTemplate, type TemplateSelection } from '@/lib/templates/template-selector';
import { buildV2Prompt } from './v2-prompts';
import { validateV2Content } from './v2-validator';
import type { V2ContentRequest, V2ContentResponse } from './v2-schema';
import { isV2ContentResponse } from './v2-schema';
import { determineContentLevel, type Student } from './ability-detector';
import type { LessonPlan } from './lesson-plan-generator';

// Simplified generation request (user-facing)
export interface V2GenerationRequest {
  topic: TemplateTopic;
  subjectType: 'ela' | 'math';
  grade?: string;  // Optional when students are provided
  duration: 15 | 30 | 45 | 60;
  studentIds?: string[];
  studentInitials?: string[];
  students?: Student[];  // Optional: for IEP-aware generation
}

// Generation result
export interface V2GenerationResult {
  success: boolean;
  content?: V2ContentResponse;
  template?: TemplateSelection;
  worksheet?: any; // Populated worksheet in LessonResponse format
  lessonPlan?: LessonPlan; // Optional teacher guidance
  error?: string;
  metadata: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    generationTime: number;
    model: string;
    generationVersion: 'v2';
    worksheetTokens?: number; // Token breakdown when lesson plan is generated
    lessonPlanTokens?: number; // Token breakdown when lesson plan is generated
  };
}

/**
 * Generate worksheet content using template-based approach
 * This is the main entry point for v2 generation
 */
export async function generateV2Worksheet(
  request: V2GenerationRequest,
  apiKey: string
): Promise<V2GenerationResult> {
  const startTime = Date.now();

  try {
    // Step 1: Determine ability level from students or grade
    const abilityProfile = determineContentLevel(
      request.students,
      request.grade,
      request.subjectType
    );

    console.log('[V2 Generator] Ability profile:', abilityProfile);

    // Step 2: Select template and calculate problem count
    const templateSelection = selectTemplate({
      topic: request.topic,
      subjectType: request.subjectType,
      duration: request.duration,
      grade: abilityProfile.abilityLevel,  // Use detected ability level
    });

    if (!templateSelection) {
      return {
        success: false,
        error: 'Failed to select template',
        metadata: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          generationTime: Date.now() - startTime,
          model: 'none',
          generationVersion: 'v2',
        },
      };
    }

    // Step 3: Build simplified content-only prompt
    const problemCount = Math.round(
      (templateSelection.problemCount.min + templateSelection.problemCount.max) / 2
    );

    const contentRequest: V2ContentRequest = {
      topic: request.topic,
      subjectType: request.subjectType,
      grade: request.grade,
      duration: request.duration,
      problemCount,
      studentInitials: request.studentInitials,
      abilityProfile,  // Pass ability profile to prompt builder
    };

    const prompt = buildV2Prompt(contentRequest);

    // Step 3: Call AI for content generation
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      temperature: 0, // Deterministic for consistent JSON structure
      system: 'You are a helpful assistant that generates educational content. You must respond with ONLY valid JSON. No markdown code blocks, no explanations, just pure JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract JSON from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return {
        success: false,
        error: 'No text content in AI response',
        metadata: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          generationTime: Date.now() - startTime,
          model: response.model,
          generationVersion: 'v2',
        },
      };
    }

    // Parse JSON
    let content: V2ContentResponse;
    try {
      let jsonText = textContent.text;

      // Try to extract JSON from markdown code blocks first
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      }

      // Remove single-line comments (// ...) which are not valid JSON
      jsonText = jsonText.replace(/\/\/[^\n]*/g, '');

      // If parsing fails or there's extra content, try to extract just the JSON object
      try {
        content = JSON.parse(jsonText);
      } catch (firstError) {
        // Try to find JSON object boundaries
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const extractedJson = jsonText.substring(firstBrace, lastBrace + 1);
          content = JSON.parse(extractedJson);
        } else {
          throw firstError; // Re-throw original error if extraction doesn't help
        }
      }
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse AI response as JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
        metadata: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          generationTime: Date.now() - startTime,
          model: response.model,
          generationVersion: 'v2',
        },
      };
    }

    // Step 4: Validate content
    const validation = validateV2Content(content);
    if (!validation.valid) {
      return {
        success: false,
        error: `Content validation failed: ${validation.errors.join(', ')}`,
        metadata: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          generationTime: Date.now() - startTime,
          model: response.model,
          generationVersion: 'v2',
        },
      };
    }

    // Step 5: Populate template with content
    const studentIds = request.studentIds || ['student-1'];
    const populatedWorksheet = populateTemplate(content, templateSelection, studentIds);

    // Success! Return populated worksheet
    return {
      success: true,
      content,
      template: templateSelection,
      worksheet: populatedWorksheet,
      metadata: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        generationTime: Date.now() - startTime,
        model: response.model,
        generationVersion: 'v2',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        generationTime: Date.now() - startTime,
        model: 'error',
        generationVersion: 'v2',
      },
    };
  }
}

/**
 * Populate template with generated content
 * This converts V2ContentResponse into worksheet sections based on template structure
 */
export function populateTemplate(
  content: V2ContentResponse,
  template: TemplateSelection,
  studentIds: string[]
): any {
  const topicName = template.template.name;

  // Track which questions have been used to avoid duplication
  const usedQuestionIndices = new Set<number>();

  // Build worksheet sections based on template structure
  const sections = template.template.sections.map((templateSection) => {
    const items: any[] = [];

    // Map content to template slots
    for (const slot of templateSection.slots) {
      if (slot.type === 'passage' && content.passage) {
        // Add passage
        items.push({
          type: 'passage',
          content: content.passage,
        });
      } else if (slot.type === 'writing-prompt' && content.prompt) {
        // Add writing prompt as plain text (no passage styling)
        items.push({
          type: 'writing-prompt',
          content: content.prompt,
        });
      } else if (slot.type === 'writing-space') {
        // Add writing space with lines
        // Use the problemCount as line count (represents expected sentences)
        const lineCount = Math.round(
          (template.problemCount.min + template.problemCount.max) / 2
        );
        items.push({
          type: 'long-answer',
          content: '',  // Empty content, just lines
          blankLines: lineCount,
        });
      } else if (slot.type === 'examples' && content.examples) {
        // Add example problems
        content.examples.forEach((example, idx) => {
          items.push({
            type: 'example',
            content: `Example ${idx + 1}: ${example.problem}`,
            solution: example.solution,
          });
        });
      } else if (slot.type === 'questions' || slot.type === 'problems' || slot.type === 'practice') {
        // Add questions/problems, filtering by allowed types and avoiding duplicates
        const allowedTypes = slot.allowedTypes || [];
        let questionNumber = 1;

        content.questions.forEach((question, idx) => {
          // Skip if already used
          if (usedQuestionIndices.has(idx)) {
            return;
          }

          // Check if question type is allowed for this slot
          const isAllowed = allowedTypes.length === 0 || allowedTypes.includes(question.type as any);

          if (isAllowed) {
            // Special handling for phonics: distinguish word completion from sentence completion
            // Word completion: just a word with blanks (e.g., "fl___t")
            // Sentence completion: full sentence (e.g., "The cat will _____ in the sun.")
            if (question.type === 'fill-blank') {
              const isWordOnly = !question.text.trim().match(/\s+[a-zA-Z]/); // No spaces followed by letters (indicating multiple words)
              const sectionIsWordCompletion = templateSection.title.toLowerCase().includes('word');
              const sectionIsSentenceCompletion = templateSection.title.toLowerCase().includes('sentence');

              // Skip if this is word-only but section wants sentences, or vice versa
              if ((isWordOnly && sectionIsSentenceCompletion) || (!isWordOnly && sectionIsWordCompletion)) {
                return;
              }
            }

            // Check if the question has embedded blanks (like "fl___t") - don't add lines for these
            const hasEmbeddedBlank = question.text.includes('___');

            // Determine blank lines based on question type
            let blankLines: number | undefined;
            if (question.type === 'short-answer' && !hasEmbeddedBlank) {
              blankLines = 3;
            } else if (question.type === 'long-answer') {
              blankLines = 5;
            } else if (question.type === 'math-work') {
              blankLines = 5;
            } else {
              blankLines = undefined;
            }

            items.push({
              type: question.type,
              content: `${questionNumber}. ${question.text}`,
              choices: question.choices,
              blankLines,
            });
            usedQuestionIndices.add(idx);
            questionNumber++;
          }
        });
      }
    }

    return {
      title: templateSection.title,
      instructions: templateSection.instructions,
      items,
    };
  });

  // Return formatted worksheet
  return {
    title: `${topicName} - G${template.metadata.grade}`,
    grade: template.metadata.grade,
    topic: template.metadata.topic,
    duration: template.metadata.duration,
    sections,
    formatting: template.formatting,
  };
}
