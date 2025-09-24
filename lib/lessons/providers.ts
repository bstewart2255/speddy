// AI Provider abstraction for model flexibility
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LessonRequest, LessonResponse, isValidLessonResponse } from './schema';
import { logger } from '@/lib/logger';

// Environment flags for controlling sensitive data capture
const CAPTURE_FULL_PROMPTS = process.env.CAPTURE_FULL_PROMPTS === 'true';
const CAPTURE_AI_RAW = process.env.CAPTURE_AI_RAW === 'true';
const DEBUG_OPENAI = process.env.DEBUG_OPENAI === 'true';

/**
 * Redacts student-identifying information from text
 * Used to sanitize prompts and responses before storage
 */
function redactStudentPII(text: string): string {
  if (!text) return '';
  
  return text
    // Student IDs (various formats)
    .replace(/student[-_]?\d+/gi, 'student-[ID_REDACTED]')
    .replace(/"id"\s*:\s*"[^"]+"/g, '"id":"[REDACTED]"')
    .replace(/\bid:\s*['"]?[\w-]+['"]?/gi, 'id: [REDACTED]')
    // IEP/FERPA sensitive content
    .replace(/\bIEP\s+goals?[^.]*\./gi, 'IEP goals [REDACTED].')
    .replace(/\baccommodat\w+[^.]*\./gi, 'Accommodations [REDACTED].')
    .replace(/\bread\w+\s+level[^.]*\./gi, 'Reading level [REDACTED].')
    // Student names in common patterns
    .replace(/\bstudent\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi, 'Student [NAME_REDACTED]')
    .replace(/"name"\s*:\s*"[^"]+"/g, '"name":"[REDACTED]"')
    // Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    // SSN patterns
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
    // Phone numbers
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
    // Long numeric IDs (more than 8 digits)
    .replace(/\b\d{9,}\b/g, '[ID_REDACTED]');
}

// Debug logging helper with PII sanitization
function sanitizeAndLogDebug(context: string, content: string): void {
  const isDebugEnabled = process.env.DEBUG_OPENAI === 'true' || process.env.NODE_ENV === 'development';
  
  if (!isDebugEnabled) {
    return;
  }
  
  // Apply PII redaction
  const sanitized = redactStudentPII(content);
  
  // Truncate to first 200 chars
  const truncated = sanitized.length > 200 
    ? `${sanitized.substring(0, 200)}... [truncated, total length: ${content.length}]`
    : sanitized;
  
  console.debug(`[${context}] Response preview:`, truncated);
}

// Model token limits (context window - input + output combined)
const MODEL_MAX_TOKENS: Record<string, number> = {
  'gpt-5': 200000,  // Context window for GPT-5
  'gpt-5-mini': 200000,  // Context window for GPT-5-mini
  'gpt-5-nano': 200000,  // Context window for GPT-5-nano
  'gpt-4o': 128000,  // Context window
  'gpt-4o-mini': 128000,  // Context window
  'gpt-4-turbo': 128000,  // Context window
  'gpt-4-turbo-preview': 128000,  // Context window
  'gpt-4': 8192,  // Legacy model
  'gpt-3.5-turbo': 16384,  // Updated context window
  'claude-3-5-sonnet-20241022': 200000,  // Context window
  'claude-3-opus-20240229': 200000,  // Context window
  'claude-3-sonnet-20240229': 200000,  // Context window
  'claude-3-haiku-20240307': 200000  // Context window
};

// Default max tokens for response (can be overridden by env var)
const DEFAULT_MAX_RESPONSE_TOKENS = 16000;

export interface AIProvider {
  generateLesson(request: LessonRequest, systemPrompt: string, userPrompt: string): Promise<LessonResponse>;
  getName(): string;
  getLastGenerationMetadata(): GenerationMetadata | null;
}

export interface GenerationMetadata {
  fullPromptSent: string;
  aiRawResponse: any;
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
  generationMetadata: any;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private lastGenerationMetadata: GenerationMetadata | null = null;

  constructor(apiKey: string, model: string = 'gpt-5-mini') {
    // Increase timeout for GPT-5 models as they may take longer
    const timeout = model.startsWith('gpt-5') ? 300000 : 60000; // 5 min for GPT-5, 1 min for others
    this.client = new OpenAI({
      apiKey,
      timeout,
      maxRetries: 2
    });
    this.model = model;
    
    // Calculate safe max tokens for response
    const modelLimit = MODEL_MAX_TOKENS[model] || 8192;
    const envMaxTokens = parseInt(process.env.MAX_RESPONSE_TOKENS || String(DEFAULT_MAX_RESPONSE_TOKENS));
    
    // Use the minimum of: env setting, default, or 50% of model limit (to leave room for prompt)
    this.maxTokens = Math.min(envMaxTokens, DEFAULT_MAX_RESPONSE_TOKENS, Math.floor(modelLimit * 0.5));
    
    logger.debug(`OpenAI Provider initialized: model=${model}, maxTokens=${this.maxTokens}`);
  }

  async generateLesson(request: LessonRequest, systemPrompt: string, userPrompt: string): Promise<LessonResponse> {
    const startTime = Date.now();

    // Now properly using separate system and user prompts as intended
    const fullSystemPrompt = systemPrompt + '\n\nYou must respond with ONLY a valid JSON object. No other text.';

    // Log prompt sizes for debugging
    const debugEnabled = process.env.DEBUG_LESSON_GENERATION === 'true' || process.env.DEBUG_OPENAI === 'true';
    if (debugEnabled) {
      const systemPromptTokens = Math.ceil(fullSystemPrompt.length / 4); // Rough estimate
      const userPromptTokens = Math.ceil(userPrompt.length / 4);
      const estimatedPromptTokens = systemPromptTokens + userPromptTokens;

      logger.debug(`[OpenAI] Prompt Size Estimate:
  - System prompt: ~${systemPromptTokens} tokens (${fullSystemPrompt.length} chars)
  - User prompt: ~${userPromptTokens} tokens (${userPrompt.length} chars)
  - Total prompt: ~${estimatedPromptTokens} tokens
  - Available for response: ~${this.maxTokens} tokens`);
    }

    try {
      logger.debug(`[OpenAI] Starting API call with model ${this.model}, max tokens: ${this.maxTokens}`);

      // Use correct parameters based on model version
      const isGPT5 = this.model.startsWith('gpt-5');
      const tokenParam = isGPT5
        ? { max_completion_tokens: this.maxTokens }
        : { max_tokens: this.maxTokens };

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: fullSystemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        ...(isGPT5 ? {} : { temperature: 0.7 }), // GPT-5 only supports default temperature
        ...tokenParam,
        response_format: { type: 'json_object' } // Force JSON response
      });

      logger.debug(`[OpenAI] API call completed successfully in ${Date.now() - startTime}ms`);

      // Log token usage details
      if (debugEnabled) {
        const usage = completion.usage;
        const totalTokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
        const modelLimit = MODEL_MAX_TOKENS[this.model] || 128000;
        const tokenPercentage = (totalTokens / modelLimit) * 100;

        logger.debug(`[OpenAI] Token Usage:
  - Prompt tokens: ${usage?.prompt_tokens || 0}
  - Completion tokens: ${usage?.completion_tokens || 0}
  - Total tokens: ${totalTokens}
  - Model limit: ${modelLimit}
  - Usage: ${tokenPercentage.toFixed(1)}%
  - Max response tokens configured: ${this.maxTokens}`);

        // Detect potential truncation
        const finishReason = completion.choices[0]?.finish_reason;
        if (finishReason === 'length') {
          logger.error('[OpenAI] WARNING: Response was truncated due to token limit!');
        } else {
          logger.debug(`[OpenAI] Finish reason: ${finishReason}`);
        }
      }

      // Capture metadata for logging (with environment flag gating)
      this.lastGenerationMetadata = {
        // Only capture full prompts if explicitly enabled via environment flag
        fullPromptSent: CAPTURE_FULL_PROMPTS
          ? redactStudentPII(`System: ${fullSystemPrompt}\n\nUser: ${userPrompt}`)
          : '[PROMPTS_NOT_CAPTURED]',
        // Only capture raw AI response if explicitly enabled via environment flag  
        aiRawResponse: CAPTURE_AI_RAW
          ? {
              id: completion.id,
              model: completion.model,
              created: completion.created,
              choices: completion.choices.map(choice => ({
                ...choice,
                message: {
                  ...choice.message,
                  content: redactStudentPII(choice.message?.content || '')
                }
              })),
              usage: completion.usage
            }
          : { model: completion.model, usage: completion.usage }, // Minimal info only
        modelUsed: this.model,
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        generationMetadata: {
          provider: 'OpenAI',
          temperature: 0.7,
          maxTokens: this.maxTokens,
          generationTimeMs: Date.now() - startTime
        }
      };

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Check for truncation indicators
      if (debugEnabled && content) {
        const lastChars = content.slice(-50);
        logger.debug(`[OpenAI] Response ends with: "${lastChars}"`);
        logger.debug(`[OpenAI] Response length: ${content.length} characters`);

        if (!content.endsWith('}')) {
          console.warn('[OpenAI] Response may be truncated - does not end with }');
        }

        // Try to detect if students are missing
        const studentMatches = content.match(/"studentId"/g);
        const studentCount = studentMatches ? studentMatches.length : 0;
        logger.debug(`[OpenAI] Found ${studentCount} student entries in response`);
      }

      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(content);
      } catch (e) {
        // Log sanitized debug info only if debug is enabled
        sanitizeAndLogDebug('OpenAI Parse Error', content);
        
        // Try to repair truncated JSON
        const contentLength = content.length;
        logger.debug(`Attempting to repair potentially truncated JSON (length: ${contentLength})...`);
        const repairedContent = this.attemptJsonRepair(content);
        
        if (repairedContent) {
          try {
            jsonResponse = JSON.parse(repairedContent);
            logger.debug('Successfully repaired and parsed JSON');
          } catch (repairError) {
            logger.error(`Failed to parse OpenAI response after repair attempt (original length: ${contentLength})`);
            throw new Error('Non-JSON response from OpenAI - repair attempt failed');
          }
        } else {
          logger.error(`Failed to parse OpenAI response: Invalid JSON format (length: ${contentLength})`);
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
        logger.error('OpenAI response structure:', JSON.stringify(jsonResponse.lesson, null, 2).slice(0, 500));
        throw new Error('Invalid lesson response structure from OpenAI');
      }
      
      // Fill timing after successful validation
      jsonResponse.metadata.generationTime = Date.now() - startTime;

      // Store generation explanation in generation metadata if provided
      if (jsonResponse.generation_explanation) {
        this.lastGenerationMetadata = {
          ...this.lastGenerationMetadata,
          generationMetadata: {
            ...this.lastGenerationMetadata?.generationMetadata,
            generation_explanation: jsonResponse.generation_explanation
          }
        };
      }

      return jsonResponse;
    } catch (error) {
      const timeElapsed = Date.now() - startTime;
      
      // Log detailed error info only when DEBUG_OPENAI is enabled
      if (DEBUG_OPENAI) {
        logger.debug('[OpenAI] Generation failed', {
          timeElapsed,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
      }
      
      // Extract error details from various error structures
      let errorMessage = '';
      let statusCode: number | undefined;
      
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check for status/code in error object
        const errorWithStatus = error as any;
        statusCode = errorWithStatus.status || errorWithStatus.code || errorWithStatus.response?.status;
      }
      
      // Map errors to user-friendly messages
      if (errorMessage.includes('timeout') || statusCode === 408) {
        logger.warn('OpenAI API timeout', { timeElapsed });
        throw new Error(`Request timed out after ${Math.round(timeElapsed / 1000)}s. Please try again.`);
      } else if (errorMessage.includes('401') || statusCode === 401 || errorMessage.includes('authentication')) {
        logger.error('OpenAI API authentication failed', error);
        throw new Error('Authentication failed. Please contact support.');
      } else if (errorMessage.includes('402') || statusCode === 402 || errorMessage.includes('quota') || errorMessage.includes('exhausted')) {
        logger.error('OpenAI API quota exceeded', error);
        throw new Error('API quota exceeded. Please try again later or contact support.');
      } else if (errorMessage.includes('413') || statusCode === 413 || errorMessage.includes('payload too large')) {
        logger.warn('OpenAI API payload too large', { timeElapsed });
        throw new Error('Request too large. Please try with fewer students or shorter content.');
      } else if (errorMessage.includes('429') || statusCode === 429) {
        logger.warn('OpenAI API rate limit exceeded', { timeElapsed });
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      } else if (errorMessage.includes('500') || statusCode === 500) {
        logger.error('OpenAI API internal server error', error);
        throw new Error('Service error occurred. Please try again.');
      } else if (errorMessage.includes('502') || statusCode === 502) {
        logger.error('OpenAI API bad gateway', error);
        throw new Error('Connection error. Please try again.');
      } else if (errorMessage.includes('503') || statusCode === 503) {
        logger.warn('OpenAI API service unavailable', { timeElapsed });
        throw new Error('Service temporarily unavailable. Please try again in a few moments.');
      } else if (errorMessage.includes('504') || statusCode === 504) {
        logger.error('OpenAI API gateway timeout', error);
        throw new Error('Gateway timeout. Please try again.');
      } else {
        // Log unknown errors to Sentry for investigation
        logger.error('OpenAI API unknown error', error, { timeElapsed });
        const msg = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to generate lesson: ${msg}`);
      }
    }
  }


  getName(): string {
    return `OpenAI (${this.model})`;
  }

  getLastGenerationMetadata(): GenerationMetadata | null {
    return this.lastGenerationMetadata;
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

        // Log repair details if debugging is enabled
        if (process.env.DEBUG_LESSON_GENERATION === 'true' || process.env.DEBUG_OPENAI === 'true') {
          logger.debug(`[OpenAI] JSON Repair:
  - Original ended with: "${content.slice(-50)}"
  - Added ${Math.max(0, openBrackets - closeBrackets)} brackets
  - Added ${Math.max(0, openBraces - closeBraces)} braces
  - Repair ${cleaned.endsWith('}') ? 'succeeded' : 'may have failed'}`);
        }
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
  private maxTokens: number;
  private lastGenerationMetadata: GenerationMetadata | null = null;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    
    // Calculate safe max tokens for response
    const modelLimit = MODEL_MAX_TOKENS[model] || 200000;
    const envMaxTokens = parseInt(process.env.MAX_RESPONSE_TOKENS || String(DEFAULT_MAX_RESPONSE_TOKENS));
    
    // Use the minimum of: env setting, default, or 50% of model limit (to leave room for prompt)
    this.maxTokens = Math.min(envMaxTokens, DEFAULT_MAX_RESPONSE_TOKENS, Math.floor(modelLimit * 0.5));
    
    logger.debug(`Anthropic Provider initialized: model=${model}, maxTokens=${this.maxTokens}`);
  }

  async generateLesson(request: LessonRequest, systemPrompt: string, userPrompt: string): Promise<LessonResponse> {
    const startTime = Date.now();

    // Now properly using separate system and user prompts as intended
    const fullSystemPrompt = systemPrompt + '\n\nYou must respond with ONLY a valid JSON object. No markdown code blocks, no explanation, just the JSON.';

    // Log prompt sizes for debugging
    const debugEnabled = process.env.DEBUG_LESSON_GENERATION === 'true';
    if (debugEnabled) {
      const systemPromptTokens = Math.ceil(fullSystemPrompt.length / 4); // Rough estimate
      const userPromptTokens = Math.ceil(userPrompt.length / 4);
      const estimatedPromptTokens = systemPromptTokens + userPromptTokens;

      logger.debug(`[Anthropic] Prompt Size Estimate:
  - System prompt: ~${systemPromptTokens} tokens (${fullSystemPrompt.length} chars)
  - User prompt: ~${userPromptTokens} tokens (${userPrompt.length} chars)
  - Total prompt: ~${estimatedPromptTokens} tokens
  - Available for response: ~${this.maxTokens} tokens`);
    }

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.7,
        system: fullSystemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      // Log token usage details
      if (debugEnabled) {
        const usage = message.usage;
        const totalTokens = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
        const modelLimit = MODEL_MAX_TOKENS[this.model] || 200000;
        const tokenPercentage = (totalTokens / modelLimit) * 100;

        logger.debug(`[Anthropic] Token Usage:
  - Input tokens: ${usage?.input_tokens || 0}
  - Output tokens: ${usage?.output_tokens || 0}
  - Total tokens: ${totalTokens}
  - Model limit: ${modelLimit}
  - Usage: ${tokenPercentage.toFixed(1)}%
  - Max response tokens configured: ${this.maxTokens}`);

        // Log stop reason for truncation detection
        const stopReason = (message as any).stop_reason || 'unknown';
        logger.debug(`[Anthropic] Response completed in ${Date.now() - startTime}ms; stop_reason=${stopReason}`);

        // Detect potential truncation
        if (stopReason === 'max_tokens') {
          logger.error('[Anthropic] WARNING: Response was truncated due to token limit!');
        }
      }

      // Capture metadata for logging (with environment flag gating)
      this.lastGenerationMetadata = {
        // Only capture full prompts if explicitly enabled via environment flag
        fullPromptSent: CAPTURE_FULL_PROMPTS
          ? redactStudentPII(`System: ${fullSystemPrompt}\n\nUser: ${userPrompt}`)
          : '[PROMPTS_NOT_CAPTURED]',
        // Only capture raw AI response if explicitly enabled via environment flag
        aiRawResponse: CAPTURE_AI_RAW
          ? {
              id: message.id,
              model: message.model,
              role: message.role,
              content: message.content.map((block: any) => {
                if (block.type === 'text' && typeof block.text === 'string') {
                  return { ...block, text: redactStudentPII(block.text) };
                }
                return block;
              }),
              usage: message.usage
            }
          : { model: message.model, usage: message.usage }, // Minimal info only
        modelUsed: this.model,
        promptTokens: message.usage?.input_tokens || 0,
        completionTokens: message.usage?.output_tokens || 0,
        generationMetadata: {
          provider: 'Anthropic',
          temperature: 0.7,
          maxTokens: this.maxTokens,
          generationTimeMs: Date.now() - startTime
        }
      };

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

      // Check for truncation indicators
      if (debugEnabled && cleanedResponse) {
        const lastChars = cleanedResponse.slice(-50);
        logger.debug(`[Anthropic] Response ends with: "${lastChars}"`);
        logger.debug(`[Anthropic] Response length: ${cleanedResponse.length} characters`);

        if (!cleanedResponse.endsWith('}')) {
          console.warn('[Anthropic] Response may be truncated - does not end with }');
        }

        // Try to detect if students are missing
        const studentMatches = cleanedResponse.match(/"studentId"/g);
        const studentCount = studentMatches ? studentMatches.length : 0;
        logger.debug(`[Anthropic] Found ${studentCount} student entries in response`);
      }

      let jsonResponse: any;
      try {
        jsonResponse = JSON.parse(cleanedResponse);
      } catch (e) {
        // Log sanitized debug info only if debug is enabled
        sanitizeAndLogDebug('Anthropic Parse Error', cleanedResponse);
        
        // Try to repair truncated JSON
        const contentLength = cleanedResponse.length;
        logger.debug(`Attempting to repair potentially truncated JSON (length: ${contentLength})...`);
        const repairedContent = this.attemptJsonRepair(cleanedResponse);
        
        if (repairedContent) {
          try {
            jsonResponse = JSON.parse(repairedContent);
            logger.debug('Successfully repaired and parsed JSON');
          } catch (repairError) {
            logger.error(`Failed to parse Anthropic response after repair attempt (original length: ${contentLength})`);
            throw new Error('Non-JSON response from Anthropic - repair attempt failed');
          }
        } else {
          logger.error(`Failed to parse Anthropic response: Invalid JSON format (length: ${contentLength})`);
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

      // Store generation explanation in generation metadata if provided
      if (jsonResponse.generation_explanation) {
        this.lastGenerationMetadata = {
          ...this.lastGenerationMetadata,
          generationMetadata: {
            ...this.lastGenerationMetadata?.generationMetadata,
            generation_explanation: jsonResponse.generation_explanation
          }
        };
      }

      return jsonResponse;
    } catch (error) {
      logger.error('Anthropic generation error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate lesson with Anthropic: ${msg}`);
    }
  }


  getName(): string {
    return `Anthropic (${this.model})`;
  }

  getLastGenerationMetadata(): GenerationMetadata | null {
    return this.lastGenerationMetadata;
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
      // Use gpt-5-mini for better performance with large responses
      const openaiModel = process.env.OPENAI_MODEL || 'gpt-5-mini';
      return new OpenAIProvider(process.env.OPENAI_API_KEY, openaiModel);
    }
  }
}