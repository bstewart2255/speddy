import Anthropic from '@anthropic-ai/sdk';

export interface AnswerFormat {
  lines?: number;
  drawing_space?: boolean;
}

export interface AssessmentItem {
  type: 'multiple_choice' | 'short_answer' | 'problem';
  prompt: string;
  options?: string[];
  answer_format?: AnswerFormat;
}

export interface IEPGoalAssessment {
  goal: string;
  passage?: string; // Top-level passage for reading comprehension goals
  assessmentItems: AssessmentItem[];
}

export interface ProgressCheckWorksheet {
  studentInitials: string;
  iepGoals: IEPGoalAssessment[];
}

interface ProgressCheckRequest {
  studentInitials: string;
  gradeLevel: number;
  iepGoals: string[];
}

export async function generateProgressCheck(request: ProgressCheckRequest): Promise<ProgressCheckWorksheet> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey });

  // Create detailed system prompt
  const systemPrompt = `You are an expert special education assessment designer. Create assessment items to evaluate student progress on IEP goals.

CRITICAL RULES:
1. This worksheet is for STUDENTS to complete, NOT teachers
2. Do NOT include teacher notes, scoring criteria, scoring rubrics, or assessment guidelines
3. Do NOT mention IEP goals on the worksheet - students should only see questions
4. Do NOT include any meta-commentary about what the question tests
5. All prompts must be direct instructions the student can read and follow

REQUIREMENTS:
1. Test EVERY IEP goal provided
2. Generate EXACTLY 5 assessment items per goal
3. Vary formats based on goal type
4. Keep language grade-appropriate and student-friendly
5. For reading comprehension goals:
   - Include a "passage" field at the GOAL level (not on individual items)
   - Create ONE substantial passage (100-150 words, grade-appropriate)
   - All 5 questions for that goal should reference this passage
   - Questions should explore different aspects: details, inferences, vocabulary, main idea
6. For writing goals, specify how many sentences or paragraphs to write

ALLOWED ASSESSMENT TYPES - YOU MUST USE ONLY THESE 3 TYPES:
1. "multiple_choice" - Questions with 4 answer choices (must include "options" array with exactly 4 options)
2. "short_answer" - Open-ended questions requiring written responses
3. "problem" - Math problems or exercises requiring work space

ANSWER FORMAT SPECIFICATIONS:
For short_answer and problem types, include an "answer_format" object:
- Specify "lines" based on expected response:
  - 1 line for single words or numbers
  - 2 lines for one sentence
  - 3-4 lines for multiple sentences
  - 5-6 lines for a paragraph
- If the problem asks for drawing/sketching: add "drawing_space": true

CRITICAL: DO NOT USE "observation" type questions. All questions must be completable on the worksheet itself without teacher interaction.

MAPPING GOALS TO ASSESSMENT TYPES:
- Reading comprehension → Use "short_answer" with goal-level passage
- Writing goals → Use "short_answer" (specify number of sentences in prompt)
- Math goals → Use "problem" or "multiple_choice"
- Behavioral/Social goals → Convert to written reflection using "short_answer"
- Phonics/Decoding goals → Use "multiple_choice" for identification or "short_answer" for writing words
- Knowledge recall → Use "multiple_choice" or "short_answer"

OUTPUT FORMAT (valid JSON):
{
  "studentInitials": "J.D.",
  "iepGoals": [
    {
      "goal": "[exact IEP goal text - for internal tracking only, NOT shown to student]",
      "passage": "ONLY for reading comprehension goals - place passage here at goal level",
      "assessmentItems": [
        {
          "type": "multiple_choice",
          "prompt": "Based on the passage, what happened first?",
          "options": ["Option A", "Option B", "Option C", "Option D"]
        },
        {
          "type": "short_answer",
          "prompt": "Write 2 sentences explaining why the character felt sad.",
          "answer_format": {"lines": 3}
        },
        {
          "type": "problem",
          "prompt": "Solve: 24 ÷ 6 = ___",
          "answer_format": {"lines": 1}
        }
      ]
    }
  ]
}

VALIDATION CHECKLIST BEFORE RESPONDING:
✓ No teacher-facing notes or scoring criteria anywhere
✓ All prompts are student-readable instructions
✓ Multiple choice items have exactly 4 options
✓ Short answer items specify expected length in prompt AND have answer_format
✓ NO observation-type questions - all questions must be completable on paper
✓ Reading comprehension: passage at GOAL level, not on individual items
✓ Behavioral/social goals converted to written reflections, not observations

CRITICAL: The "type" field MUST be one of these EXACT strings: "multiple_choice", "short_answer", or "problem". Do NOT use "observation" type.

You must respond with ONLY a valid JSON object. No other text.`;

  // Create user prompt
  const userPrompt = `Create a progress check assessment for:

Student: ${request.studentInitials}
Grade: ${request.gradeLevel}

IEP Goals:
${request.iepGoals.map((goal, idx) => `${idx + 1}. ${goal}`).join('\n')}

For EACH goal, create exactly 5 assessment items. Mix types appropriately:
- Multiple choice for knowledge/comprehension
- Short answer for application/explanation and written reflections
- Problems for skill demonstration

IMPORTANT: Do NOT use observation-type questions. All questions must be completable on the worksheet without teacher interaction. For behavioral/social goals, use written reflections (short_answer type).`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
    });

    // Extract JSON from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in AI response');
    }

    // Parse the AI response
    let worksheet: ProgressCheckWorksheet;
    let jsonText = textContent.text;

    try {
      // Try to extract JSON from markdown code blocks first
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      }

      // Remove single-line comments (// ...) at the start of lines only
      jsonText = jsonText.replace(/^\s*\/\/.*$/gm, '');

      // Try parsing
      try {
        worksheet = JSON.parse(jsonText);
      } catch (firstError) {
        // Try to find JSON object boundaries
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const extractedJson = jsonText.substring(firstBrace, lastBrace + 1);
          worksheet = JSON.parse(extractedJson);
        } else {
          throw firstError;
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Failed to parse progress check response');
    }

    // Validate that we have the expected structure
    if (!worksheet.iepGoals || !Array.isArray(worksheet.iepGoals) || worksheet.iepGoals.length === 0) {
      throw new Error('Invalid progress check structure: missing IEP goals');
    }

    // Validate each goal has assessment items
    for (const goal of worksheet.iepGoals) {
      if (!goal.assessmentItems || !Array.isArray(goal.assessmentItems) || goal.assessmentItems.length === 0) {
        throw new Error(`Invalid progress check: goal "${goal.goal}" has no assessment items`);
      }
    }

    return worksheet;
  } catch (error) {
    console.error('Error generating progress check:', error);
    throw error;
  }
}
