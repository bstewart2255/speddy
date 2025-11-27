import Anthropic from '@anthropic-ai/sdk';
import { isReadingFluencyGoal } from '@/lib/shared/question-types';

interface ExitTicketRequest {
  studentInitials: string;
  gradeLevel: number;
  iepGoal: string;
}

interface AnswerFormat {
  drawing_space?: boolean;
  lines?: number;
}

interface ExitTicketProblem {
  type: 'multiple_choice' | 'short_answer' | 'problem';
  question?: string;
  prompt?: string;
  problem?: string;
  options?: string[];
  answer?: string;
  answer_format?: AnswerFormat;
}

export interface ExitTicketContent {
  passage?: string; // Optional reading passage for comprehension questions
  problems: ExitTicketProblem[];
}

export async function generateExitTicket(request: ExitTicketRequest): Promise<ExitTicketContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Check if this is a fluency goal - handle separately
  if (isReadingFluencyGoal(request.iepGoal)) {
    return generateFluencyExitTicket(request);
  }

  const client = new Anthropic({ apiKey });

  // Create a focused prompt for exit ticket generation
  const prompt = `Generate an exit ticket assessment for a student. This should be completable in 3-5 minutes and fit on ONE page.

Student Information:
- Initials: ${request.studentInitials}
- Grade Level: ${request.gradeLevel}

Target IEP Goal:
"${request.iepGoal}"

CRITICAL REQUIREMENTS:
1. Create EXACTLY 3 problems that directly assess progress toward this IEP goal
2. Problems should be appropriate for grade ${request.gradeLevel}
3. Each problem should be solvable independently in 1-2 minutes
4. Language should be clear and grade-appropriate
5. Content must fit on ONE printed page

ALLOWED PROBLEM TYPES (use only these 3 types):
- "multiple_choice" - Questions with 4 answer choices (include "options" array)
- "short_answer" - Open-ended questions requiring written responses
- "problem" - Math problems or exercises requiring work space

SPECIAL INSTRUCTIONS FOR READING COMPREHENSION:
- If the IEP goal involves reading comprehension, include a "passage" field with a short text (3-5 sentences)
- The passage should be appropriate for grade ${request.gradeLevel}
- All comprehension questions should reference "the passage"
- Keep passages brief to fit on one page

CONTENT VARIETY (for reading passages):
- Use diverse themes: science, history, sports, animals, friendship, adventure, mystery
- Avoid overused patterns like "lost pet" stories or common names like Maya/Alex
- Vary settings: different countries, time periods, environments
- Each passage should feel unique and fresh

FOR OTHER GOALS:
- Each problem must be completely self-contained with all needed information
- Math word problems must include all numbers and context
- Never reference external materials

ANSWER FORMAT SPECIFICATIONS:
For short_answer problems, include an "answer_format" object:
- Specify "lines" based on expected response:
  - 1 line for single words or numbers
  - 2 lines for one sentence
  - 3 lines for multiple sentences
- If the problem asks for drawing/sketching: add "drawing_space": true

Return the response in this exact JSON format:

For reading comprehension goals:
{
  "passage": "A short reading passage here (3-5 sentences for grade ${request.gradeLevel})",
  "problems": [
    {
      "type": "multiple_choice",
      "question": "Based on the passage, what...",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"]
    },
    {
      "type": "short_answer",
      "question": "According to the passage, why did...",
      "answer_format": {"lines": 2}
    },
    {
      "type": "short_answer",
      "question": "What do you think...",
      "answer_format": {"lines": 2}
    }
  ]
}

For other goals (no passage needed):
{
  "problems": [
    {
      "type": "problem",
      "problem": "Solve: 5 + 3 = ___",
      "answer_format": {"lines": 1}
    },
    {
      "type": "multiple_choice",
      "question": "Which number is greater?",
      "options": ["A) 5", "B) 8", "C) 3", "D) 2"]
    },
    {
      "type": "short_answer",
      "question": "Explain how you solved the first problem.",
      "answer_format": {"lines": 2}
    }
  ]
}

VALIDATION CHECKLIST:
✓ Exactly 3 problems
✓ All problems use one of the 3 allowed types
✓ Multiple choice has exactly 4 options
✓ Content is brief enough to fit on one page
✓ No teacher-facing notes or scoring criteria`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: 'You are a helpful educational assistant that creates brief assessments for students based on their IEP goals. Always respond with valid JSON.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
    });

    // Extract JSON from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in AI response');
    }

    // Parse the AI response
    let content: ExitTicketContent;
    let jsonText = textContent.text;

    try {
      // Try to extract JSON from markdown code blocks first
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      }

      // Remove single-line comments (// ...) at the start of lines only
      // This avoids corrupting URLs like https://... inside JSON strings
      jsonText = jsonText.replace(/^\s*\/\/.*$/gm, '');

      // Try parsing
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
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to a simple format
      content = {
        problems: [
          {
            type: 'short_answer',
            question: `Practice problem for: ${request.iepGoal}`,
            answer: 'Student answer here'
          }
        ]
      };
    }

    // Validate that we have problems
    if (!content.problems || !Array.isArray(content.problems) || content.problems.length === 0) {
      content.problems = [
        {
          type: 'short_answer',
          question: generateFallbackProblem(request.iepGoal, request.gradeLevel),
          answer_format: { lines: 2 }
        },
        {
          type: 'multiple_choice',
          question: `Which skill does this goal focus on?`,
          options: ['A) Reading', 'B) Writing', 'C) Math', 'D) Other']
        },
        {
          type: 'short_answer',
          question: 'What is one thing you learned today?',
          answer_format: { lines: 2 }
        }
      ];
    }

    // Ensure we have exactly 3 problems
    if (content.problems.length > 3) {
      content.problems = content.problems.slice(0, 3);
    } else if (content.problems.length < 3) {
      // Pad with generic problems if needed
      while (content.problems.length < 3) {
        content.problems.push({
          type: 'short_answer',
          question: 'What is one thing you want to practice more?',
          answer_format: { lines: 2 }
        });
      }
    }

    return content;
  } catch (error) {
    console.error('Error generating exit ticket:', error);

    // Return a fallback exit ticket with exactly 3 problems
    return {
      problems: [
        {
          type: 'short_answer',
          question: generateFallbackProblem(request.iepGoal, request.gradeLevel),
          answer_format: { lines: 2 }
        },
        {
          type: 'multiple_choice',
          question: 'Which skill does this goal focus on?',
          options: ['A) Reading', 'B) Writing', 'C) Math', 'D) Other']
        },
        {
          type: 'short_answer',
          question: 'What is one thing you learned today?',
          answer_format: { lines: 2 }
        }
      ]
    };
  }
}

function generateFallbackProblem(iepGoal: string, gradeLevel: number): string {
  // Extract key words from the IEP goal to create a simple problem
  const goalLower = iepGoal.toLowerCase();

  if (goalLower.includes('read') || goalLower.includes('comprehension')) {
    return 'Read this sentence and answer: What is the main idea?';
  } else if (goalLower.includes('add') || goalLower.includes('subtract')) {
    return `Solve this problem: ${Math.floor(Math.random() * 20) + 1} + ${Math.floor(Math.random() * 20) + 1} = ?`;
  } else if (goalLower.includes('multiply') || goalLower.includes('multiplication')) {
    return `Solve this problem: ${Math.floor(Math.random() * 10) + 1} × ${Math.floor(Math.random() * 10) + 1} = ?`;
  } else if (goalLower.includes('write') || goalLower.includes('writing')) {
    return 'Write a complete sentence about your favorite subject in school.';
  } else if (goalLower.includes('count')) {
    return `Count by ${gradeLevel <= 2 ? '2s' : '5s'} from 0 to ${gradeLevel <= 2 ? '20' : '50'}.`;
  } else {
    return `Complete this task related to: ${iepGoal.substring(0, 100)}...`;
  }
}

/**
 * Generate a fluency exit ticket with a reading passage for teacher assessment
 */
async function generateFluencyExitTicket(
  request: ExitTicketRequest
): Promise<ExitTicketContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      passage: generateFallbackFluencyPassage(request.gradeLevel),
      problems: [],
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system:
        'Generate a grade-appropriate reading passage for fluency assessment. Return valid JSON only.',
      messages: [
        {
          role: 'user',
          content: `Generate a short reading passage (50-75 words) for grade ${request.gradeLevel} fluency assessment.

The passage should be:
- Engaging and age-appropriate
- Suitable for timed oral reading
- Use diverse themes (science, history, animals, adventure - NOT lost pet stories)

Return JSON: { "passage": "..." }`,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content');
    }

    let jsonText = textContent.text;
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    }

    const { passage } = JSON.parse(jsonText);

    return {
      passage: passage || generateFallbackFluencyPassage(request.gradeLevel),
      problems: [], // No problems for fluency - teacher assesses oral reading
    };
  } catch (error) {
    console.error('Error generating fluency exit ticket:', error);
    return {
      passage: generateFallbackFluencyPassage(request.gradeLevel),
      problems: [],
    };
  }
}

/**
 * Generate a fallback fluency passage if AI generation fails
 */
function generateFallbackFluencyPassage(gradeLevel: number): string {
  if (gradeLevel <= 2) {
    return `The sun came up over the farm. A little bird woke up in its nest. It was time to find food. The bird flew to the ground and found a worm. What a good morning!`;
  } else if (gradeLevel <= 4) {
    return `Deep in the forest, a family of deer lived near a quiet stream. Every morning, they walked to the water to drink. The youngest deer liked to splash in the shallow parts. One day, they discovered a meadow full of wildflowers.`;
  } else {
    return `Scientists recently discovered a remarkable octopus species in the deep ocean. Unlike most octopuses that prefer warm waters, this creature thrives in freezing temperatures near underwater volcanoes. Researchers believe studying it could lead to breakthroughs in medicine.`;
  }
}