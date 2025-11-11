// Lesson Plan Generator - Creates teacher guidance for sample lessons
// Provides teaching methodology, scaffolding, and IEP accommodations

import Anthropic from '@anthropic-ai/sdk';
import type { TemplateTopic } from '@/lib/templates/types';
import type { Student } from './ability-detector';

/**
 * Lesson Plan structure for teachers
 */
export interface LessonPlan {
  title: string;
  gradeLevel: string;
  topic: string;
  duration: number;
  objectives: string[];
  teachingSteps: Array<{
    step: number;
    instruction: string;
  }>;
  guidedPractice: string[];
}

/**
 * Result of lesson plan generation including metadata
 */
export interface LessonPlanResult {
  lessonPlan: LessonPlan;
  metadata: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    generationTime: number;
    model: string;
  };
}

/**
 * Request for lesson plan generation
 */
export interface LessonPlanRequest {
  topic: TemplateTopic;
  subjectType: 'ela' | 'math';
  grade?: string;
  duration: number;
  students?: Student[];  // For IEP-specific accommodations
  abilityLevel?: string;  // Detected ability level
  worksheetContent?: string;  // The actual worksheet content to base the lesson plan on
}

/**
 * Generate a lesson plan for teachers
 */
export async function generateLessonPlan(
  request: LessonPlanRequest,
  apiKey: string
): Promise<LessonPlanResult> {
  const startTime = Date.now();
  const { topic, subjectType, grade, duration, students, abilityLevel } = request;

  // Use ability level if available, otherwise use grade
  const contentLevel = abilityLevel || grade || '3';

  // Build the prompt
  const prompt = buildLessonPlanPrompt(request, contentLevel);

  // Call AI
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1200,
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
    throw new Error('No text content in AI response');
  }

  // Parse JSON
  let lessonPlan: LessonPlan;
  try {
    let jsonText = textContent.text;

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    }

    // Try parsing directly (JSON.parse handles whitespace)
    try {
      lessonPlan = JSON.parse(jsonText);
    } catch (firstError) {
      // Try to extract JSON object
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const extractedJson = jsonText.substring(firstBrace, lastBrace + 1);
        lessonPlan = JSON.parse(extractedJson);
      } else {
        throw firstError;
      }
    }
  } catch (e) {
    throw new Error(`Failed to parse lesson plan JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  return {
    lessonPlan,
    metadata: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      generationTime: Date.now() - startTime,
      model: response.model,
    },
  };
}

/**
 * Build the AI prompt for lesson plan generation
 */
function buildLessonPlanPrompt(request: LessonPlanRequest, contentLevel: string): string {
  const { topic, subjectType, grade, duration, worksheetContent } = request;

  // If we have worksheet content, create a focused lesson plan for it
  if (worksheetContent) {
    return `You are an expert special education teacher creating a brief lesson plan for teaching this worksheet.

WORKSHEET CONTENT:
${worksheetContent}

LESSON DETAILS:
- Grade level: ${contentLevel}${grade && grade !== contentLevel ? ` (student ability is grade ${contentLevel}, actual grade is ${grade})` : ''}
- Duration: ${duration} minutes
- Subject: ${subjectType.toUpperCase()}

Create a concise lesson plan in JSON format:
{
  "title": "Brief lesson title based on worksheet content",
  "gradeLevel": "${contentLevel}",
  "topic": "${topic}",
  "duration": ${duration},
  "objectives": ["2-3 specific learning objectives based on the worksheet"],
  "teachingSteps": [
    { "step": 1, "instruction": "Brief introduction step (2-3 sentences)" },
    { "step": 2, "instruction": "Explain/model key concepts from worksheet (2-3 sentences)" },
    { "step": 3, "instruction": "Guided practice approach (2-3 sentences)" },
    { "step": 4, "instruction": "Independent work on worksheet (1-2 sentences)" }
  ],
  "guidedPractice": [
    "How to demonstrate the first example",
    "Key questions to ask students",
    "What to watch for as students work"
  ]
}

IMPORTANT: Be concise and specific to THIS worksheet. Each instruction should be 2-3 sentences maximum. Focus on practical steps a teacher can follow.`;
  }

  // Fallback to generic guidance if no worksheet content (shouldn't happen)
  const topicGuidance = getTopicTeachingGuidance(topic, contentLevel, duration);

  return `You are an expert special education teacher creating a lesson plan for teaching ${topic}.

${topicGuidance}

LESSON DETAILS:
- Grade level: ${contentLevel}${grade && grade !== contentLevel ? ` (student ability is grade ${contentLevel}, actual grade is ${grade})` : ''}
- Duration: ${duration} minutes
- Subject: ${subjectType.toUpperCase()}

REQUIRED OUTPUT FORMAT (JSON):
{
  "title": "Brief lesson title",
  "gradeLevel": "${contentLevel}",
  "topic": "${topic}",
  "duration": ${duration},
  "objectives": [
    "Learning objective 1 (specific, measurable)",
    "Learning objective 2"
  ],
  "teachingSteps": [
    { "step": 1, "instruction": "Detailed teaching instruction for step 1" },
    { "step": 2, "instruction": "Detailed teaching instruction for step 2" }
  ],
  "guidedPractice": [
    "How to work through examples together",
    "Questions to ask students",
    "What to model/demonstrate"
  ]
}

GUIDELINES:
1. Be specific and actionable - teachers should be able to follow these steps directly
2. Include explicit teaching methodology (I do, We do, You do)
3. Anticipate student challenges and provide solutions in the teaching steps
4. Keep language clear and concise (this is a quick reference, not a textbook)
5. Make it practical for a ${duration}-minute lesson

Generate the lesson plan now.`;
}

/**
 * Get topic-specific teaching guidance
 */
function getTopicTeachingGuidance(topic: TemplateTopic, grade: string, duration: number): string {
  switch (topic) {
    case 'reading-comprehension': {
      // Allocate times so sum equals duration
      const beforeReading = 5;
      const duringReading = Math.floor(duration * 0.4);
      const afterReading = Math.floor(duration * 0.35);
      const independentPractice = duration - (beforeReading + duringReading + afterReading);

      return `TEACHING APPROACH: Reading Comprehension

This lesson should follow the gradual release model for reading comprehension:

1. BEFORE READING (${beforeReading} minutes):
   - Activate prior knowledge
   - Preview text features and vocabulary
   - Set a purpose for reading

2. DURING READING (${duringReading} minutes):
   - Model think-alouds for comprehension strategies
   - Pause for prediction and clarification
   - Annotate together (underline, circle, note)

3. AFTER READING (${afterReading} minutes):
   - Discuss main ideas and key details
   - Work through questions together (I do, We do)
   - Guide students to find evidence in text

4. INDEPENDENT PRACTICE (${independentPractice} minutes):
   - Students complete worksheet questions
   - Circulate to provide support

Key teaching points:
- Always return to the text for evidence
- Teach inference by modeling your thinking process
- Use sentence frames for struggling readers
- Encourage re-reading when confused`;
    }

    case 'phonics-decoding': {
      // Allocate times so sum equals duration
      const soundIntro = 5;
      const wordBuilding = Math.floor(duration * 0.3);
      const guidedPractice = Math.floor(duration * 0.35);
      const sentenceReading = duration - (soundIntro + wordBuilding + guidedPractice);

      return `TEACHING APPROACH: Phonics & Decoding

This lesson should use explicit, systematic phonics instruction:

1. SOUND INTRODUCTION (${soundIntro} minutes):
   - Introduce the target sound/pattern clearly
   - Show mouth position and articulation
   - Practice sound in isolation, then in words

2. WORD BUILDING (${wordBuilding} minutes):
   - Start with simple CVC if applicable
   - Build up to more complex patterns
   - Use manipulatives (letter cards, tiles)
   - Blend sounds together repeatedly

3. GUIDED PRACTICE (${guidedPractice} minutes):
   - Read words with the pattern together
   - Sort words by pattern
   - Complete word completion activities together

4. SENTENCE READING (${sentenceReading} minutes):
   - Read sentences containing target words
   - Students complete worksheet independently
   - Provide immediate corrective feedback

Key teaching points:
- Always explicitly teach the sound pattern first
- Use multisensory approaches (visual, auditory, kinesthetic)
- Build from simple to complex
- Provide LOTS of practice and repetition
- Celebrate small wins to build confidence`;
    }

    case 'writing-prompt': {
      // Allocate times so sum equals duration
      const promptExploration = Math.floor(duration * 0.2);
      const planning = Math.floor(duration * 0.2);
      const miniLesson = 10;
      const independentWriting = duration - (promptExploration + planning + miniLesson);

      return `TEACHING APPROACH: Writing & Composition

This lesson should scaffold the writing process:

1. PROMPT EXPLORATION (${promptExploration} minutes):
   - Read prompt aloud together
   - Discuss what's being asked
   - Brainstorm ideas as a group

2. PLANNING (${planning} minutes):
   - Model using planning questions
   - Create graphic organizer together
   - Students complete their own planning

3. MINI-LESSON (${miniLesson} minutes):
   - Teach one specific writing skill (topic sentences, transitions, etc.)
   - Show examples of good vs. needs improvement
   - Model writing the first sentence together

4. INDEPENDENT WRITING (${independentWriting} minutes):
   - Students write their responses
   - Circulate to conference briefly with students
   - Provide encouragement and specific feedback

Key teaching points:
- Planning is essential - don't skip it
- Model your thinking process ("I'm thinking...")
- Provide sentence frames for struggling writers
- Focus on ideas first, editing later
- Celebrate effort and creativity`;
    }

    case 'grammar-vocabulary': {
      // Allocate times so sum equals duration
      const introduction = Math.floor(duration * 0.2);
      const guidedExploration = Math.floor(duration * 0.3);
      const practiceActivities = Math.floor(duration * 0.3);
      const independentWork = duration - (introduction + guidedExploration + practiceActivities);

      return `TEACHING APPROACH: Grammar & Vocabulary

This lesson should emphasize practical application:

1. INTRODUCTION (${introduction} minutes):
   - Present vocabulary words or grammar concept
   - Show real-world examples
   - Define clearly with student-friendly language

2. GUIDED EXPLORATION (${guidedExploration} minutes):
   - Work through examples together
   - Identify patterns or rules
   - Create example sentences as a class

3. PRACTICE ACTIVITIES (${practiceActivities} minutes):
   - Complete practice items together (We do)
   - Discuss why answers are correct/incorrect
   - Make connections to reading and writing

4. INDEPENDENT WORK (${independentWork} minutes):
   - Students complete worksheet
   - Apply what they've learned

Key teaching points:
- Connect to authentic reading and writing
- Use the words/concepts in multiple contexts
- Encourage students to create their own examples
- Provide visual aids and anchor charts`;
    }

    case 'computation': {
      // Allocate times so sum equals duration
      const warmUp = 5;
      const explicitTeaching = Math.floor(duration * 0.25);
      const guidedPractice = Math.floor(duration * 0.35);
      const independentPractice = duration - (warmUp + explicitTeaching + guidedPractice);

      return `TEACHING APPROACH: Math Computation

This lesson should build computational fluency through explicit instruction:

1. WARM-UP (${warmUp} minutes):
   - Review prerequisite skills
   - Mental math practice
   - Build number sense

2. EXPLICIT TEACHING (${explicitTeaching} minutes):
   - Introduce or review operation/concept
   - Model solving example problems step-by-step
   - Think aloud to show your process
   - Use visual representations (number lines, arrays, etc.)

3. GUIDED PRACTICE (${guidedPractice} minutes):
   - Work through problems together
   - Students explain their thinking
   - Check for understanding frequently
   - Correct misconceptions immediately

4. INDEPENDENT PRACTICE (${independentPractice} minutes):
   - Students complete worksheet problems
   - Circulate to identify who needs help
   - Provide immediate feedback

Key teaching points:
- Always show multiple solution strategies
- Emphasize accuracy before speed
- Use manipulatives for concrete understanding
- Connect procedures to conceptual understanding
- Celebrate progress and persistence`;
    }

    case 'word-problems': {
      // Allocate times so sum equals duration
      const strategyIntro = Math.floor(duration * 0.2);
      const modeling = Math.floor(duration * 0.3);
      const guidedPractice = Math.floor(duration * 0.3);
      const independentWork = duration - (strategyIntro + modeling + guidedPractice);

      return `TEACHING APPROACH: Math Word Problems

This lesson should teach problem-solving strategies:

1. STRATEGY INTRODUCTION (${strategyIntro} minutes):
   - Teach problem-solving steps (CUBES, STAR, or similar)
   - U = Underline key information
   - C = Circle numbers
   - B = Box the question
   - E = Eliminate extra information
   - S = Solve and check

2. MODELING (${modeling} minutes):
   - Work through example problems using the strategy
   - Think aloud extensively
   - Show how to identify operation needed
   - Demonstrate checking work

3. GUIDED PRACTICE (${guidedPractice} minutes):
   - Solve problems together
   - Students explain their reasoning
   - Discuss different solution paths
   - Check answers make sense

4. INDEPENDENT WORK (${independentWork} minutes):
   - Students solve worksheet problems
   - Apply the problem-solving strategy

Key teaching points:
- Always read the problem at least twice
- Teach students to identify what the problem is asking
- Model drawing pictures/diagrams
- Emphasize checking if answer makes sense
- Connect to real-world situations`;
    }

    case 'mixed-practice': {
      // Allocate times so sum equals duration
      const warmUpReview = Math.floor(duration * 0.15);
      const skillReview = Math.floor(duration * 0.25);
      const guidedPractice = Math.floor(duration * 0.3);
      const independentPractice = duration - (warmUpReview + skillReview + guidedPractice);

      return `TEACHING APPROACH: Mixed Math Practice

This lesson should review and reinforce multiple skills:

1. WARM-UP REVIEW (${warmUpReview} minutes):
   - Quick review of operations
   - Mental math strategies
   - Number sense warm-up

2. SKILL REVIEW (${skillReview} minutes):
   - Review computation strategies
   - Review problem-solving steps
   - Address common errors from previous lessons

3. GUIDED PRACTICE (${guidedPractice} minutes):
   - Work through variety of problems together
   - Mix computation and word problems
   - Discuss which strategy to use for each type

4. INDEPENDENT PRACTICE (${independentPractice} minutes):
   - Students complete mixed practice worksheet
   - Circulate to support and assess

Key teaching points:
- Help students identify what type of problem they're solving
- Review strategies for each problem type
- Emphasize flexibility in thinking
- Build confidence through variety
- Celebrate using multiple strategies`;
    }

    default:
      return `Create a well-structured lesson plan appropriate for grade ${grade} students.`;
  }
}
