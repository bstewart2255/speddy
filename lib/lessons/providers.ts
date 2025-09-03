// AI Provider abstraction for model flexibility
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LessonRequest, LessonResponse, isValidLessonResponse } from './schema';

// Debug logging helper with PII sanitization
function sanitizeAndLogDebug(context: string, content: string): void {
  const isDebugEnabled = process.env.DEBUG_OPENAI === 'true' || process.env.NODE_ENV === 'development';
  
  if (!isDebugEnabled) {
    return;
  }
  
  // Sanitize PII patterns
  let sanitized = content
    // Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    // SSN patterns
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
    // Phone numbers
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
    // Long numeric IDs (more than 8 digits)
    .replace(/\b\d{9,}\b/g, '[ID_REDACTED]')
    // Student names in common patterns
    .replace(/Student\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g, 'Student [NAME_REDACTED]')
    .replace(/"name"\s*:\s*"[^"]+"/g, '"name":"[REDACTED]"');
  
  // Truncate to first 200 chars
  const truncated = sanitized.length > 200 
    ? `${sanitized.substring(0, 200)}... [truncated, total length: ${content.length}]`
    : sanitized;
  
  console.debug(`[${context}] Response preview:`, truncated);
}

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
        max_tokens: 16000, // Increased from 8000 to handle larger responses
        response_format: { type: 'json_object' } // Force JSON response
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }
      
      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(content);
      } catch (e) {
        // Log sanitized debug info only if debug is enabled
        sanitizeAndLogDebug('OpenAI Parse Error', content);
        
        // Try to repair truncated JSON
        const contentLength = content.length;
        console.log(`Attempting to repair potentially truncated JSON (length: ${contentLength})...`);
        const repairedContent = this.attemptJsonRepair(content);
        
        if (repairedContent) {
          try {
            jsonResponse = JSON.parse(repairedContent);
            console.log('Successfully repaired and parsed JSON');
          } catch (repairError) {
            console.error(`Failed to parse OpenAI response after repair attempt (original length: ${contentLength})`);
            throw new Error('Non-JSON response from OpenAI - repair attempt failed');
          }
        } else {
          console.error(`Failed to parse OpenAI response: Invalid JSON format (length: ${contentLength})`);
          throw new Error('Non-JSON response from OpenAI - unable to repair');
        }
      }
      
      // Ensure metadata exists before validation
      const baseMeta = (jsonResponse && typeof jsonResponse.metadata === 'object' && jsonResponse.metadata !== null)
        ? jsonResponse.metadata
        : {};
      
      jsonResponse.metadata = {
        ...baseMeta,
        modelUsed: 'OpenAI',
        modelVersion: this.model,
        generationTime: 0, // Will be filled after validation
        generatedAt: new Date().toISOString(),
        gradeGroups: (baseMeta as any).gradeGroups || [],
        validationStatus: 'passed' // Will be updated if validation fails
      };

      if (!isValidLessonResponse(jsonResponse)) {
        jsonResponse.metadata.validationStatus = 'failed';
        throw new Error('Invalid lesson response structure from OpenAI');
      }
      
      // Fill timing after successful validation
      jsonResponse.metadata.generationTime = Date.now() - startTime;

      return jsonResponse;
    } catch (error) {
      console.error('OpenAI generation error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate lesson with OpenAI: ${msg}`);
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
  
  /**
   * Attempts to repair potentially truncated or malformed JSON
   * @param content - The potentially malformed JSON string
   * @returns Repaired JSON string if successful, null if repair failed
   */
  private attemptJsonRepair(content: string): string | null {
    try {
      // Remove any leading/trailing whitespace
      let cleaned = content.trim();
      
      // Check if response appears truncated (doesn't end with })
      if (!cleaned.endsWith('}')) {
        // Count open and close braces to determine nesting level
        const openBraces = (cleaned.match(/{/g) || []).length;
        const closeBraces = (cleaned.match(/}/g) || []).length;
        const openBrackets = (cleaned.match(/\[/g) || []).length;
        const closeBrackets = (cleaned.match(/\]/g) || []).length;
        
        // Add missing closing brackets and braces
        cleaned += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        cleaned += '}'.repeat(Math.max(0, openBraces - closeBraces));
      }
      
      // Attempt to parse the repaired JSON
      JSON.parse(cleaned);
      return cleaned;
    } catch (e) {
      // If repair fails, return null
      return null;
    }
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
        max_tokens: 16000, // Increased from 8000 to handle larger responses
        temperature: 0.7,
        system: systemPrompt + '\n\nYou must respond with ONLY a valid JSON object. No markdown code blocks, no explanation, just the JSON.',
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      // Extract text from Anthropic response safely with type assertions
      interface TextBlock {
        type: string;
        text: string;
      }
      
      const textBlock = Array.isArray(message.content)
        ? (message.content as Array<TextBlock | any>).find(
            (b): b is TextBlock => b && b.type === 'text' && typeof b.text === 'string'
          )
        : null;
      
      if (!textBlock?.text) {
        throw new Error('Empty text content from Anthropic');
      }
      
      // Clean response (remove any markdown if present)
      const cleanedResponse = textBlock.text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(cleanedResponse);
      } catch (e) {
        // Log sanitized debug info only if debug is enabled
        sanitizeAndLogDebug('Anthropic Parse Error', cleanedResponse);
        
        // Try to repair truncated JSON
        const contentLength = cleanedResponse.length;
        console.log(`Attempting to repair potentially truncated JSON (length: ${contentLength})...`);
        const repairedContent = this.attemptJsonRepair(cleanedResponse);
        
        if (repairedContent) {
          try {
            jsonResponse = JSON.parse(repairedContent);
            console.log('Successfully repaired and parsed JSON');
          } catch (repairError) {
            console.error(`Failed to parse Anthropic response after repair attempt (original length: ${contentLength})`);
            throw new Error('Non-JSON response from Anthropic - repair attempt failed');
          }
        } else {
          console.error(`Failed to parse Anthropic response: Invalid JSON format (length: ${contentLength})`);
          throw new Error('Non-JSON response from Anthropic - unable to repair');
        }
      }
      
      // Ensure metadata exists before validation
      const baseMeta = (jsonResponse && typeof jsonResponse.metadata === 'object' && jsonResponse.metadata !== null)
        ? jsonResponse.metadata
        : {};
      
      jsonResponse.metadata = {
        ...baseMeta,
        modelUsed: 'Anthropic',
        modelVersion: this.model,
        generationTime: 0, // Will be filled after validation
        generatedAt: new Date().toISOString(),
        gradeGroups: (baseMeta as any).gradeGroups || [],
        validationStatus: 'passed' // Will be updated if validation fails
      };

      if (!isValidLessonResponse(jsonResponse)) {
        jsonResponse.metadata.validationStatus = 'failed';
        throw new Error('Invalid lesson response structure from Anthropic');
      }
      
      // Fill timing after successful validation
      jsonResponse.metadata.generationTime = Date.now() - startTime;

      return jsonResponse;
    } catch (error) {
      console.error('Anthropic generation error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate lesson with Anthropic: ${msg}`);
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
  
  /**
   * Attempts to repair potentially truncated or malformed JSON
   * @param content - The potentially malformed JSON string
   * @returns Repaired JSON string if successful, null if repair failed
   */
  private attemptJsonRepair(content: string): string | null {
    try {
      // Remove any leading/trailing whitespace
      let cleaned = content.trim();
      
      // Quick shape check
      if (!(cleaned.startsWith('{') || cleaned.startsWith('['))) {
        return null;
      }
      
      // Strip trailing commas before } or ]
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
      
      // Check if response appears truncated (doesn't end with })
      if (!cleaned.endsWith('}')) {
        // Count open and close braces to determine nesting level
        const openBraces = (cleaned.match(/{/g) || []).length;
        const closeBraces = (cleaned.match(/}/g) || []).length;
        const openBrackets = (cleaned.match(/\[/g) || []).length;
        const closeBrackets = (cleaned.match(/\]/g) || []).length;
        
        // Add missing closing brackets and braces
        cleaned += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        cleaned += '}'.repeat(Math.max(0, openBraces - closeBraces));
      }
      
      // Attempt to parse the repaired JSON
      JSON.parse(cleaned);
      return cleaned;
    } catch (e) {
      // If repair fails, return null
      return null;
    }
  }
}

// Factory function to create the appropriate provider
export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'openai';
  
  switch (provider.toLowerCase()) {
    case 'anthropic': {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
      }
      const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, anthropicModel);
    }
    
    case 'openai':
    default: {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      // Use gpt-4o for better performance with large responses, fallback to gpt-4o-mini
      const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
      return new OpenAIProvider(process.env.OPENAI_API_KEY, openaiModel);
    }
  }
}