// V2 Generator - Template-based worksheet generation
// Flow: Template Selection → AI (content only) → Template Population → Rendering

import Anthropic from '@anthropic-ai/sdk';
import type { TemplateTopic } from '@/lib/templates/types';
import { selectTemplate, type TemplateSelection } from '@/lib/templates/template-selector';
import { buildV2Prompt } from './v2-prompts';
import { validateV2Content } from './v2-validator';
import type { V2ContentRequest, V2ContentResponse } from './v2-schema';
import { isV2ContentResponse } from './v2-schema';

// Simplified generation request (user-facing)
export interface V2GenerationRequest {
  topic: TemplateTopic;
  subjectType: 'ela' | 'math';
  grade: string;
  duration: 15 | 30 | 45 | 60;
  studentIds?: string[];
  studentInitials?: string[];
}

// Generation result
export interface V2GenerationResult {
  success: boolean;
  content?: V2ContentResponse;
  template?: TemplateSelection;
  worksheet?: any; // Populated worksheet in LessonResponse format
  error?: string;
  metadata: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    generationTime: number;
    model: string;
    generationVersion: 'v2';
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
    // Step 1: Select template and calculate problem count
    const templateSelection = selectTemplate({
      topic: request.topic,
      subjectType: request.subjectType,
      duration: request.duration,
      grade: request.grade,
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

    // Step 2: Build simplified content-only prompt
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
    };

    const prompt = buildV2Prompt(contentRequest);

    // Step 3: Call AI for content generation
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
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
      // Extract JSON from markdown code blocks if present
      let jsonText = textContent.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      content = JSON.parse(jsonText);
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
        // Add writing prompt
        items.push({
          type: 'text',
          content: content.prompt,
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
        // Add questions/problems
        content.questions.forEach((question, idx) => {
          items.push({
            type: question.type,
            content: `${idx + 1}. ${question.text}`,
            choices: question.choices,
            // Only add blank lines for written responses, not computation (visual-math)
            blankLines: question.type === 'short-answer' ? 3 : question.type === 'long-answer' ? 5 : question.type === 'math-work' ? 5 : undefined,
          });
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
    title: `${topicName} - Grade ${template.metadata.grade}`,
    grade: template.metadata.grade,
    topic: template.metadata.topic,
    duration: template.metadata.duration,
    sections,
    formatting: template.formatting,
  };
}
