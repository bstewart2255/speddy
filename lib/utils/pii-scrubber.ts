/**
 * PII Scrubber Utility
 * Uses Claude AI to intelligently detect and remove PII from IEP goals
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ScrubbedGoal {
  original: string;
  scrubbed: string;
  piiDetected: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ScrubResult {
  goals: ScrubbedGoal[];
  errors: string[];
}

/**
 * Scrub PII from IEP goals using Claude AI or regex fallback
 */
export async function scrubPIIFromGoals(
  goals: string[],
  studentFirstName: string,
  studentLastName: string,
  useAI: boolean = false // Default to fast regex-based scrubbing
): Promise<ScrubResult> {
  // Use fast regex-based scrubbing by default (much faster than AI)
  if (!useAI) {
    const scrubbedGoals: ScrubbedGoal[] = [];
    for (const goal of goals) {
      const scrubbed = basicPIIScrub(goal, studentFirstName, studentLastName);
      scrubbedGoals.push({
        original: goal,
        scrubbed: scrubbed.text,
        piiDetected: scrubbed.removed,
        confidence: scrubbed.removed.length > 0 ? 'medium' : 'high'
      });
    }
    return { goals: scrubbedGoals, errors: [] };
  }

  // AI-based scrubbing (slower but more accurate)
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      goals: goals.map(g => ({
        original: g,
        scrubbed: g,
        piiDetected: [],
        confidence: 'low'
      })),
      errors: ['AI service not configured - PII scrubbing unavailable']
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const scrubbedGoals: ScrubbedGoal[] = [];
  const errors: string[] = [];

  // Create the prompt for Claude
  const systemPrompt = `You are a privacy-focused AI assistant that removes Personally Identifiable Information (PII) from IEP (Individualized Education Program) goals.

Your task is to:
1. Identify and remove student names (first, last, full names)
2. Remove specific dates (e.g., "by March 2024", "by 3/15/24")
3. Remove district IDs, case numbers, or student identifiers
4. Preserve measurement goals, percentages, and performance metrics
5. Maintain the educational meaning and structure of the goal

KEEP (Do NOT remove):
- Performance targets (e.g., "80% accuracy", "4 out of 5 trials")
- Skill descriptions (e.g., "reading fluency", "math computation")
- Time periods without specific dates (e.g., "by the end of the school year", "within 6 months")
- General grade levels or age ranges

Return a JSON array with this structure for each goal:
{
  "original": "the original goal text",
  "scrubbed": "the goal with PII removed",
  "piiDetected": ["list of PII items found"],
  "confidence": "high|medium|low"
}

IMPORTANT:
- Return ONLY valid JSON
- NO markdown, NO explanations, NO text before or after the JSON
- Start your response with [ and end with ]`;

  const userPrompt = `Student name to scrub: ${studentFirstName} ${studentLastName}
Initials: ${studentFirstName.charAt(0)}${studentLastName.charAt(0)}

IEP Goals to scrub:
${goals.map((g, i) => `${i + 1}. ${g}`).join('\n\n')}

Please remove all PII while preserving the educational content and goals.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      temperature: 0, // Deterministic for consistent PII detection
      messages: [
        { role: 'user', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    // Parse Claude's response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    try {
      // Clean up the response
      let jsonText = responseText.trim();

      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Find JSON array
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      // Parse the JSON
      const parsed = JSON.parse(jsonText);

      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length && i < goals.length; i++) {
          const item = parsed[i];
          scrubbedGoals.push({
            original: item.original || goals[i],
            scrubbed: item.scrubbed || goals[i],
            piiDetected: item.piiDetected || [],
            confidence: item.confidence || 'medium'
          });
        }
      } else {
        throw new Error('Expected an array from Claude');
      }
    } catch (parseError: any) {
      console.error('Failed to parse Claude response:', parseError);
      errors.push(`Failed to parse AI response: ${parseError.message}`);

      // Fallback: return goals with basic regex-based scrubbing
      for (const goal of goals) {
        const scrubbed = basicPIIScrub(goal, studentFirstName, studentLastName);
        scrubbedGoals.push({
          original: goal,
          scrubbed: scrubbed.text,
          piiDetected: scrubbed.removed,
          confidence: 'low'
        });
      }
    }
  } catch (error: any) {
    console.error('Error calling Claude API:', error);
    errors.push(`AI service error: ${error.message}`);

    // Fallback: return goals with basic regex-based scrubbing
    for (const goal of goals) {
      const scrubbed = basicPIIScrub(goal, studentFirstName, studentLastName);
      scrubbedGoals.push({
        original: goal,
        scrubbed: scrubbed.text,
        piiDetected: scrubbed.removed,
        confidence: 'low'
      });
    }
  }

  return { goals: scrubbedGoals, errors };
}

/**
 * Basic PII scrubbing using regex (fallback when AI is unavailable)
 */
function basicPIIScrub(
  text: string,
  firstName: string,
  lastName: string
): { text: string; removed: string[] } {
  let scrubbed = text;
  const removed: string[] = [];

  // Remove full name
  const fullNameRegex = new RegExp(`${firstName}\\s+${lastName}`, 'gi');
  if (fullNameRegex.test(scrubbed)) {
    scrubbed = scrubbed.replace(fullNameRegex, '[STUDENT]');
    removed.push(`${firstName} ${lastName}`);
  }

  // Remove first name
  const firstNameRegex = new RegExp(`\\b${firstName}\\b`, 'gi');
  if (firstNameRegex.test(scrubbed)) {
    scrubbed = scrubbed.replace(firstNameRegex, '[STUDENT]');
    if (!removed.includes(firstName)) {
      removed.push(firstName);
    }
  }

  // Remove last name
  const lastNameRegex = new RegExp(`\\b${lastName}\\b`, 'gi');
  if (lastNameRegex.test(scrubbed)) {
    scrubbed = scrubbed.replace(lastNameRegex, '[STUDENT]');
    if (!removed.includes(lastName)) {
      removed.push(lastName);
    }
  }

  // Remove specific dates with patterns like "by March 2024", "by 3/15/24", "by March 15th"
  const datePatterns = [
    /by\s+\d{1,2}\/\d{1,2}\/\d{2,4}/gi, // by 3/15/24
    /by\s+\w+\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}/gi, // by March 15th, 2024
    /by\s+\w+\s+\d{4}/gi, // by March 2024
    /on\s+\d{1,2}\/\d{1,2}\/\d{2,4}/gi, // on 3/15/24
    /on\s+\w+\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}/gi // on March 15th, 2024
  ];

  for (const pattern of datePatterns) {
    const matches = scrubbed.match(pattern);
    if (matches) {
      matches.forEach(match => {
        removed.push(match);
      });
      scrubbed = scrubbed.replace(pattern, 'by [DATE]');
    }
  }

  // Remove district/student IDs (patterns like ID: 123456, #123456, Student ID: 123456)
  const idPattern = /(student\s*)?id\s*[:#]?\s*\d+/gi;
  const idMatches = scrubbed.match(idPattern);
  if (idMatches) {
    idMatches.forEach(match => {
      removed.push(match);
    });
    scrubbed = scrubbed.replace(idPattern, '[ID REMOVED]');
  }

  return { text: scrubbed, removed };
}
