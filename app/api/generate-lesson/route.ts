import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';
import { getStudentDetails } from '../../../lib/supabase/queries/student-details';
import { GRADE_SKILLS_CONFIG } from '../../../lib/grade-skills-config';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { students, timeSlot, duration = 30 } = await request.json();

    // Get recent session logs for enhanced personalization
    const studentIds = students.map((s: any) => s.id);
    const { data: recentLogs } = await supabase
      .from('session_logs')
      .select('*')
      .in('student_id', studentIds)
      .order('date', { ascending: false })
      .limit(10);

    // Create enhanced prompt
    const promptContent = await createEnhancedPrompt(students, duration, recentLogs || []);

    let content: string;

    // Check if API key exists in Replit Secrets
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        console.log('Using Anthropic API for lesson generation...');

        const anthropic = new Anthropic({
          apiKey: apiKey,
        });

        const message = await anthropic.messages.create({
          model: "claude-3-haiku-20240307", // Cheapest and fastest model
          max_tokens: 2000,
          temperature: 0.7,
          system: "You are an expert special education teacher creating highly personalized lesson plans. Format all responses as clean HTML with proper semantic tags.",
          messages: [
            {
              role: "user",
              content: promptContent
            }
          ]
        });

        // Extract the text content from Claude's response
        content = message.content[0].type === 'text' ? message.content[0].text : '';

        // Log usage for monitoring (visible in Replit console)
        console.log(`✅ Anthropic API Success - Tokens used: ${message.usage.input_tokens + message.usage.output_tokens}`);

      } catch (apiError: any) {
        console.error('❌ Anthropic API error:', apiError.message);
        // Fall back to mock response if API fails
        content = await generateMockResponse(students, duration);
      }
    } else {
      // No API key configured, use mock response
      console.log('⚠️ No Anthropic API key found in Secrets. Using mock response.');
      content = await generateMockResponse(students, duration);
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error generating lesson:', error);
    return NextResponse.json(
      { error: 'Failed to generate lesson content' },
      { status: 500 }
    );
  }
}

async function createEnhancedPrompt(
  students: any[], 
  duration: number, 
  recentLogs: any[]
): Promise<string> {
  // Create detailed student profiles with skills
  const studentProfiles = await Promise.all(students.map(async (student) => {
    const studentLogs = recentLogs.filter(log => log.student_id === student.id);
    
    // Fetch student details to get working skills
    const details = await getStudentDetails(student.id);
    
    // Get skill labels for the selected skills
    let workingSkillsText = 'General curriculum';
    if (details?.working_skills && details.working_skills.length > 0) {
      const gradeConfig = GRADE_SKILLS_CONFIG[student.grade_level];
      if (gradeConfig) {
        const skillLabels = details.working_skills
          .map(skillId => {
            const skill = gradeConfig.skills.find(s => s.id === skillId);
            return skill ? `${skill.label} (${skill.category.toUpperCase()})` : null;
          })
          .filter(Boolean);
        
        if (skillLabels.length > 0) {
          workingSkillsText = skillLabels.join(', ');
        }
      }
    }

    return `
Student: ${student.initials} (Grade ${student.grade_level})
- Teacher: ${student.teacher_name}
- Reading Level: ${student.reading_level || 'Not specified'}
- Math Level: ${student.math_level || 'Not specified'}
- Learning Style: ${student.learning_style || 'Mixed'}
- IEP Goals: ${details?.iep_goals && details.iep_goals.length > 0 
    ? details.iep_goals.join('; ') 
    : 'Standard curriculum goals'}
- Current Working Skills: ${workingSkillsText}
- Focus Areas: ${student.focus_areas?.join(', ') || 'General academic skills'}
- Strengths: ${student.strengths?.join(', ') || 'To be identified'}
- Accommodations: ${student.accommodations?.join(', ') || 'Standard classroom accommodations'}
${studentLogs.length > 0 ? `- Recent Work: ${studentLogs[0].skills_practiced?.join(', ') || 'N/A'}` : ''}
${studentLogs.length > 0 && studentLogs[0].next_steps ? `- Recommended Next Steps: ${studentLogs[0].next_steps}` : ''}`;
  }));

    // Check what data we have across all students
    const studentDetailsArray = await Promise.all(
      students.map(student => getStudentDetails(student.id))
    );

    const hasIEPGoals = studentDetailsArray.some(details => 
      details?.iep_goals && details.iep_goals.length > 0
    );

    const hasWorkingSkills = studentDetailsArray.some(details => 
      details?.working_skills && details.working_skills.length > 0
    );

    // Build conditional personalization requirements
    let personalizationInstructions = '';

    if (hasIEPGoals || hasWorkingSkills) {
      personalizationInstructions = `

  PERSONALIZATION REQUIREMENTS:
  ${hasIEPGoals ? `
  1. For students with IEP goals listed above, explicitly reference these goals in activities:
     - State which IEP goal each activity addresses
     - Use format: "This activity targets [Student]'s IEP goal: '[goal text]'"
  ` : ''}
  ${hasWorkingSkills ? `
  2. For students with specific working skills listed above:
     - Reference skills by their exact names from the profile
     - Design activities that directly practice these identified skills
  ` : ''}
  ${hasIEPGoals || hasWorkingSkills ? `
  3. Start the lesson with a "Today's Focus" section listing each student's specific targets
  ` : ''}`;
    }

    return `Create a detailed, practical ${duration}-minute special education lesson plan for the following students:

${studentProfiles.join('\n')}

Requirements:
1. Address each student's SPECIFIC IEP goals with targeted activities
2. Focus on the Current Working Skills listed for each student - these are the exact skills they need practice with
3. Differentiate instruction based on actual reading/math levels, not just grade
4. Incorporate each student's learning style (visual/auditory/kinesthetic)
5. Build on recent work and recommended next steps where provided
6. Include all required accommodations for each student
7. Use student strengths to support areas of need

CRITICAL: Pay special attention to the "Current Working Skills" for each student. These are the specific skills the teacher has identified as current focus areas. Design activities that directly practice these skills.

Structure the lesson with:
- Opening (5 min): Multi-sensory warm-up engaging all learning styles
- Main Instruction (${duration - 10} min): 
  * Differentiated activities for each ability level
  * Specific IEP goal practice for each student
  * Clear instructions for grouping/individual work
- Closing (5 min): Individual assessment aligned to goals

For each activity, specify:
- Which student(s) it targets
- Which IEP goal/skill it addresses
- What accommodations to implement
- How to assess progress

Format as clean, semantic HTML. Use <h3> for sections, <h4> for activities, <strong> for student names, and clear paragraph structure. Make it immediately actionable for a special education teacher.

IMPORTANT - Available Printable Worksheets:
The teacher has instant access to these grade-specific worksheets (available via Print Worksheet buttons):

Kindergarten:
- ELA: Letter Recognition (uppercase/lowercase matching practice)
- Math: Number Sense (counting objects, number recognition)

Grade 1:
- ELA: Phonemic Awareness (blending sounds like c-a-t → cat, segmenting words)
- Math: Addition & Subtraction within 20 (fact fluency practice)

Grade 2:
- ELA: Reading Comprehension (short passages with comprehension questions)
- Math: Place Value (expanded form, comparing numbers, ordering numbers)

Grade 3:
- ELA: Main Idea & Inferencing (passages requiring deeper comprehension)
- Math: Multiplication Facts (timed practice, word problems)

Grade 4:
- ELA: Summarizing and Synthesizing Text (identifying key points, main ideas)
- Math: Multi-digit Multiplication and Long Division (step-by-step problems)

Grade 5:
- ELA: Analyzing Texts and Citing Evidence (supporting answers with text evidence)
- Math: Fractions (adding/subtracting with unlike denominators, word problems)

When planning activities, specifically reference these worksheets when appropriate. For example:
- "Have [Student] complete the Grade 2 Place Value worksheet (print via button below)"
- "Start with the Letter Recognition worksheet for [Student]"
- "Use the Reading Comprehension worksheet to assess [Student]'s progress"

This helps the teacher know exactly which materials are ready to print and use.
${personalizationInstructions}}`;

// Keep your existing generateMockResponse function here
async function generateMockResponse(students: any[], duration: number) {
  // ... (keep the existing mock response code from the original file)
  const gradeGroups = students.reduce((acc: any, student: any) => {
    const grade = student.grade_level;
    if (!acc[grade]) acc[grade] = [];
    acc[grade].push(student);
    return acc;
  }, {});

  const grades = Object.keys(gradeGroups).sort();
  const studentCount = students.length;

  return `
    <div class="lesson-plan">
      <h3>Multi-Grade Special Education Lesson Plan</h3>
      <p><em>Note: Using mock response. Add Anthropic API key in Replit Secrets for AI-generated lessons.</em></p>
      <div class="lesson-header">
        <p><strong>Duration:</strong> ${duration} minutes</p>
        <p><strong>Group Size:</strong> ${studentCount} students</p>
        <p><strong>Grade Levels:</strong> ${grades.join(', ')}</p>
      </div>
      <!-- Rest of mock response... -->
    </div>
  `;
}