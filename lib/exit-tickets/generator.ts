import Anthropic from '@anthropic-ai/sdk';

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
  type: 'multiple_choice' | 'short_answer' | 'problem' | 'fill_in_blank';
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

  const client = new Anthropic({ apiKey });

  // Create a focused prompt for exit ticket generation
  const prompt = `Generate a brief exit ticket assessment for a student. This should be completable in 3-5 minutes.

Student Information:
- Initials: ${request.studentInitials}
- Grade Level: ${request.gradeLevel}

Target IEP Goal:
"${request.iepGoal}"

Requirements:
1. Create 2-4 problems that directly assess progress toward this IEP goal
2. Problems should be appropriate for grade ${request.gradeLevel}
3. Mix problem types (multiple choice, short answer, or computation)
4. Each problem should be solvable independently in 1-2 minutes
5. Language should be clear and grade-appropriate
6. For multiple choice, provide 3-4 options

SPECIAL INSTRUCTIONS FOR READING COMPREHENSION:
- If the IEP goal involves reading comprehension, include a "passage" field with a short text (3-5 sentences)
- The passage should be appropriate for grade ${request.gradeLevel}
- All comprehension questions should reference "the passage above"
- Make the passage interesting and engaging for students

FOR OTHER GOALS:
- Each problem must be completely self-contained with all needed information
- Math word problems must include all numbers and context
- Never reference external materials

ANSWER FORMAT SPECIFICATIONS:
For short_answer and fill_in_blank problems, include an "answer_format" object when needed:
- If the problem asks for drawing/sketching: add "drawing_space": true
- Specify "lines" based on expected response:
  - 1 line for single words or numbers
  - 2 lines for one sentence
  - 3 lines for multiple sentences (e.g., "write 3 sentences")
  - 5-6 lines for a paragraph
  - If both drawing and writing are needed, include both fields

Examples:
- "Draw a picture and write 2 sentences" → {"drawing_space": true, "lines": 2}
- "Write a paragraph about..." → {"lines": 5}
- "Write three facts about..." → {"lines": 3}
- "What is 5 + 3?" → {"lines": 1} or omit answer_format

Return the response in this exact JSON format:

For reading comprehension goals:
{
  "passage": "A short reading passage here (3-5 sentences for grade ${request.gradeLevel})",
  "problems": [
    {
      "type": "multiple_choice",
      "question": "Based on the passage above, what...",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "answer": "A"
    },
    {
      "type": "short_answer",
      "question": "According to the passage, why did...",
      "answer": "Expected answer",
      "answer_format": {"lines": 2}
    }
  ]
}

For other goals (no passage needed):
{
  "problems": [
    {
      "type": "problem",
      "problem": "Complete self-contained problem with all information",
      "answer": "Solution"
    }
  ]
}

Important:
- Keep problems concise and focused on the IEP goal
- Ensure all problems are solvable with paper and pencil only
- Do not include images or complex diagrams
- Make sure the difficulty is appropriate for independent work
- For reading comprehension, use the "passage" field once, then reference it in questions`;

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
          answer: 'Student answer'
        }
      ];
    }

    // Ensure we have 2-4 problems
    if (content.problems.length > 4) {
      content.problems = content.problems.slice(0, 4);
    }

    return content;
  } catch (error) {
    console.error('Error generating exit ticket:', error);

    // Return a fallback exit ticket
    return {
      problems: [
        {
          type: 'short_answer',
          question: generateFallbackProblem(request.iepGoal, request.gradeLevel),
          answer: 'Student answer'
        },
        {
          type: 'problem',
          problem: `Show your work for a problem related to: ${request.iepGoal}`,
          answer: 'Work shown'
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