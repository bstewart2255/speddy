// V2 Prompts - Simplified, content-only prompts for template-based generation
// Focuses on educational quality, not structure/formatting (~80 lines vs ~250)

import type { V2ContentRequest } from './v2-schema';
import type { TemplateTopic } from '@/lib/templates/types';
import {
  getPassageWordCount,
  getSentenceComplexity,
  getMathComplexity,
  getComprehensionQuestionTypes,
} from '@/lib/templates/formatting-rules';

/**
 * Build a simplified content-only prompt for AI
 * NO formatting rules, NO structure requirements, ONLY content guidelines
 */
export function buildV2Prompt(request: V2ContentRequest): string {
  const { topic, grade, problemCount, subjectType } = request;

  // Get topic-specific prompt
  const topicPrompt = getTopicPrompt(topic, grade, problemCount);

  // Build the complete prompt
  return `You are an expert special education teacher creating educational content for grade ${grade} students.

${topicPrompt}

CONTENT REQUIREMENTS:
- Grade level: ${grade}
- Number of questions: ${problemCount}
- Sentence complexity: ${getSentenceComplexity(grade)}
- Educational quality: Engaging, clear, age-appropriate

RESPONSE FORMAT (JSON):
{
  ${getResponseFormat(topic)}
  "metadata": {
    "contentGenerated": true,
    "estimatedDuration": ${request.duration},
    "gradeLevel": "${grade}"
  }
}

IMPORTANT RULES:
1. Question types: ONLY use these exact types: "multiple-choice", "short-answer", "long-answer", "fill-blank", "true-false", "visual-math"
2. Multiple choice: Exactly 4 choices, NO letter prefixes (A, B, C, D)
3. Content only - we handle all formatting and structure
4. Focus on educational quality and grade-appropriate language
5. Make content engaging and relevant to students' lives

Generate the content now.`;
}

/**
 * Get topic-specific prompt section
 */
function getTopicPrompt(topic: TemplateTopic, grade: string, problemCount: number): string {
  switch (topic) {
    case 'reading-comprehension':
      const wordCount = getPassageWordCount(grade);
      const questionTypes = getComprehensionQuestionTypes(grade);
      return `TOPIC: Reading Comprehension

Create a ${wordCount.min}-${wordCount.max} word reading passage appropriate for grade ${grade}, followed by ${problemCount} comprehension questions.

Passage guidelines:
- Age-appropriate topic that interests grade ${grade} students
- Clear narrative or informational structure
- Vocabulary appropriate for grade ${grade}

Questions should include a mix of:
${questionTypes.map((type) => `- ${type}`).join('\n')}

Use a variety of question types: multiple-choice, short-answer, and 1-2 long-answer questions.`;

    case 'phonics-decoding':
      return `TOPIC: Phonics & Decoding

Create a phonics lesson focusing on a sound pattern appropriate for grade ${grade}.

Include:
- 5 example words showing the pattern
- ${problemCount} practice words for students to read
- ${Math.floor(problemCount / 2)} sentences using these words

Focus on building decoding skills and phonemic awareness.`;

    case 'writing-prompt':
      return `TOPIC: Writing & Composition

Create an engaging writing prompt for grade ${grade} students.

Include:
- 1 clear writing prompt (50-150 words)
- 3 planning questions to help students organize ideas
- Encourage creativity and personal expression

Prompt should be appropriate for ${grade} grade writing ability.`;

    case 'grammar-vocabulary':
      return `TOPIC: Grammar & Vocabulary

Create a grammar or vocabulary lesson for grade ${grade}.

Include:
- 6 vocabulary words OR grammar examples
- ${problemCount} practice questions (mix of multiple-choice, fill-blank, short-answer)

Focus on practical application and clear understanding.`;

    case 'computation':
      const mathInfo = getMathComplexity(grade);
      return `TOPIC: Math Computation

Create computation practice for grade ${grade}.

Include:
- 3 example problems with step-by-step solutions
- ${problemCount} practice problems (ALL must use type "visual-math")

Operations: ${mathInfo.operations.join(', ')}
Number range: ${mathInfo.numberRange}

IMPORTANT: All practice problems MUST use "type": "visual-math" (not short-answer, not any other type).

Focus on building computational fluency.`;

    case 'word-problems':
      const mathInfoWP = getMathComplexity(grade);
      return `TOPIC: Math Word Problems

Create story-based math problems for grade ${grade}.

Include:
- 2 example problems with solutions
- ${problemCount} practice word problems

Operations: ${mathInfoWP.operations.join(', ')}
Number range: ${mathInfoWP.numberRange}

Make problems relatable to grade ${grade} students' experiences.`;

    case 'mixed-practice':
      const mathInfoMP = getMathComplexity(grade);
      return `TOPIC: Mixed Math Practice

Create a variety of math problems for grade ${grade}.

Include:
- 3 warm-up computation problems (type: "visual-math")
- ${Math.floor(problemCount * 0.6)} computation problems (type: "visual-math")
- ${Math.ceil(problemCount * 0.4)} word problems (type: "short-answer")

Operations: ${mathInfoMP.operations.join(', ')}
Number range: ${mathInfoMP.numberRange}

IMPORTANT: Use "visual-math" for computation, "short-answer" for word problems.

Mix different problem types for comprehensive practice.`;

    default:
      return `Create ${problemCount} educational questions/problems appropriate for grade ${grade}.`;
  }
}

/**
 * Get expected response format based on topic
 */
function getResponseFormat(topic: TemplateTopic): string {
  switch (topic) {
    case 'reading-comprehension':
      return `"passage": "...",
  "questions": [
    { "text": "...", "type": "multiple-choice", "answer": "...", "choices": ["...", "...", "...", "..."] },
    { "text": "...", "type": "short-answer", "answer": "..." }
  ],`;

    case 'phonics-decoding':
      return `"examples": [
    { "problem": "word", "solution": ["breakdown"] }
  ],
  "questions": [
    { "text": "Read this word: ___", "type": "fill-blank", "answer": "word" }
  ],`;

    case 'writing-prompt':
      return `"prompt": "...",
  "questions": [
    { "text": "Planning question", "type": "short-answer", "answer": "..." }
  ],`;

    case 'computation':
      return `"examples": [
    { "problem": "2 + 2", "solution": ["Step 1: ...", "Answer: 4"], "teachingPoint": "..." }
  ],
  "questions": [
    { "text": "3 + 5 = ___", "type": "visual-math", "answer": "8" }
  ],`;

    case 'word-problems':
      return `"examples": [
    { "problem": "Word problem...", "solution": ["Step 1: ...", "Answer: ..."], "teachingPoint": "..." }
  ],
  "questions": [
    { "text": "Problem text", "type": "short-answer", "answer": "..." }
  ],`;

    case 'mixed-practice':
      return `"examples": [
    { "problem": "2 + 2", "solution": ["Step 1: ...", "Answer: 4"], "teachingPoint": "..." }
  ],
  "questions": [
    { "text": "3 + 5 = ___", "type": "visual-math", "answer": "8" },
    { "text": "Word problem...", "type": "short-answer", "answer": "..." }
  ],`;

    default:
      return `"questions": [
    { "text": "...", "type": "...", "answer": "..." }
  ],`;
  }
}
