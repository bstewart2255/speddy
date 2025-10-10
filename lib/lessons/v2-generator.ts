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

    // Success! Content is ready to be populated into template
    return {
      success: true,
      content,
      template: templateSelection,
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
 * This converts V2ContentResponse into the old lesson format for compatibility
 */
export function populateTemplate(
  content: V2ContentResponse,
  template: TemplateSelection,
  studentIds: string[]
): any {
  // TODO: Implement template population logic
  // This will map content into the existing LessonResponse format
  // For now, return a placeholder

  return {
    lesson: {
      title: `${template.metadata.topic} - Grade ${template.metadata.grade}`,
      duration: template.metadata.duration,
      objectives: ['Generated from template'],
      materials: 'Worksheets, pencils, whiteboard and markers only',
      overview: 'Template-based lesson',
      introduction: {
        description: 'Introduction',
        duration: 5,
        instructions: [],
        materials: [],
      },
      activity: {
        description: 'Practice activity',
        duration: template.metadata.duration - 5,
        instructions: [],
        materials: [],
      },
    },
    studentMaterials: studentIds.map((id) => ({
      studentId: id,
      gradeGroup: 1,
      worksheet: {
        title: `${template.metadata.topic} Practice`,
        instructions: 'Complete the following exercises.',
        sections: template.template.sections.map((section) => ({
          title: section.title,
          instructions: section.instructions,
          items: content.questions.map((q) => ({
            type: q.type,
            content: q.text,
            choices: q.choices,
          })),
        })),
      },
    })),
    metadata: {
      generatedAt: new Date().toISOString(),
      modelUsed: 'claude-3-5-sonnet-20241022',
      generationTime: 0,
      gradeGroups: [],
      validationStatus: 'passed' as const,
    },
  };
}
