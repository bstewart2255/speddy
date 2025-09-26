import OpenAI from 'openai';

interface ExitTicketRequest {
  studentInitials: string;
  gradeLevel: number;
  iepGoal: string;
}

interface ExitTicketProblem {
  type: 'multiple_choice' | 'short_answer' | 'problem' | 'fill_in_blank';
  question?: string;
  prompt?: string;
  problem?: string;
  options?: string[];
  answer?: string;
}

interface ExitTicketContent {
  passage?: string; // Optional reading passage for comprehension questions
  problems: ExitTicketProblem[];
}

export async function generateExitTicket(request: ExitTicketRequest): Promise<ExitTicketContent> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

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
      "answer": "Expected answer"
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
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful educational assistant that creates brief assessments for students based on their IEP goals. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    // Parse the AI response
    let content: ExitTicketContent;
    const responseContent = completion.choices[0].message.content;

    if (responseContent) {
      try {
        content = JSON.parse(responseContent);
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
    } else {
      // Fallback if AI doesn't return expected format
      content = {
        problems: [
          {
            type: 'short_answer',
            question: `Assessment for ${request.studentInitials}: ${request.iepGoal}`,
            answer: 'Student response'
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