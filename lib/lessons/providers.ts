// AI Provider abstraction for model flexibility
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LessonRequest, LessonResponse, isValidLessonResponse } from './schema';

export interface AIProvider {
  generateLesson(request: LessonRequest, systemPrompt: string): Promise<LessonResponse>;
  getName(): string;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateLesson(request: LessonRequest, systemPrompt: string): Promise<LessonResponse> {
    const startTime = Date.now();
    
    const userPrompt = this.buildUserPrompt(request);
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nYou must respond with ONLY a valid JSON object. No other text.'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' } // Force JSON response
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const jsonResponse = JSON.parse(responseText);
      
      if (!isValidLessonResponse(jsonResponse)) {
        throw new Error('Invalid lesson response structure from OpenAI');
      }

      // Add metadata
      jsonResponse.metadata = {
        ...jsonResponse.metadata,
        modelUsed: 'OpenAI',
        modelVersion: this.model,
        generationTime: Date.now() - startTime,
        generatedAt: new Date().toISOString()
      };

      return jsonResponse;
    } catch (error) {
      console.error('OpenAI generation error:', error);
      throw new Error(`Failed to generate lesson with OpenAI: ${error.message}`);
    }
  }

  private buildUserPrompt(request: LessonRequest): string {
    const gradeList = request.students.map(s => `Grade ${s.grade}`).join(', ');
    
    return `Create a ${request.duration}-minute ${request.subject} lesson for the following students:
    
Students: ${request.students.length} students (${gradeList})
Topic: ${request.topic || 'Teacher\'s choice based on grade level'}
Focus Skills: ${request.focusSkills?.join(', ') || 'Grade-appropriate skills'}

Student Details:
${request.students.map((s, i) => `
Student ${i + 1}:
- ID: ${s.id}
- Grade: ${s.grade}
- Reading Level: ${s.readingLevel ? `Grade ${s.readingLevel}` : 'At grade level'}
- IEP Goals: ${s.iepGoals?.join('; ') || 'None specified'}
- Accommodations: ${s.accommodations?.join('; ') || 'None specified'}
`).join('\n')}

Generate a complete lesson plan with individualized worksheets for each student or grade group.`;
  }

  getName(): string {
    return `OpenAI (${this.model})`;
  }
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateLesson(request: LessonRequest, systemPrompt: string): Promise<LessonResponse> {
    const startTime = Date.now();
    
    const userPrompt = this.buildUserPrompt(request);
    
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        temperature: 0.7,
        system: systemPrompt + '\n\nYou must respond with ONLY a valid JSON object. No markdown code blocks, no explanation, just the JSON.',
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      // Extract text from Anthropic response
      const responseText = message.content[0].type === 'text' 
        ? message.content[0].text 
        : '';
      
      // Clean response (remove any markdown if present)
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const jsonResponse = JSON.parse(cleanedResponse);
      
      if (!isValidLessonResponse(jsonResponse)) {
        throw new Error('Invalid lesson response structure from Anthropic');
      }

      // Add metadata
      jsonResponse.metadata = {
        ...jsonResponse.metadata,
        modelUsed: 'Anthropic',
        modelVersion: this.model,
        generationTime: Date.now() - startTime,
        generatedAt: new Date().toISOString()
      };

      return jsonResponse;
    } catch (error) {
      console.error('Anthropic generation error:', error);
      throw new Error(`Failed to generate lesson with Anthropic: ${error.message}`);
    }
  }

  private buildUserPrompt(request: LessonRequest): string {
    const gradeList = request.students.map(s => `Grade ${s.grade}`).join(', ');
    
    return `Create a ${request.duration}-minute ${request.subject} lesson for the following students:
    
Students: ${request.students.length} students (${gradeList})
Topic: ${request.topic || 'Teacher\'s choice based on grade level'}
Focus Skills: ${request.focusSkills?.join(', ') || 'Grade-appropriate skills'}

Student Details:
${request.students.map((s, i) => `
Student ${i + 1}:
- ID: ${s.id}
- Grade: ${s.grade}
- Reading Level: ${s.readingLevel ? `Grade ${s.readingLevel}` : 'At grade level'}
- IEP Goals: ${s.iepGoals?.join('; ') || 'None specified'}
- Accommodations: ${s.accommodations?.join('; ') || 'None specified'}
`).join('\n')}

Remember to group students who are within 1 grade level of each other for the same activities.
Generate a complete lesson plan with individualized worksheets for each student or grade group.`;
  }

  getName(): string {
    return `Anthropic (${this.model})`;
  }
}

// Factory function to create the appropriate provider
export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'openai';
  
  switch (provider.toLowerCase()) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
      }
      const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, anthropicModel);
    
    case 'openai':
    default:
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      return new OpenAIProvider(process.env.OPENAI_API_KEY, openaiModel);
  }
}