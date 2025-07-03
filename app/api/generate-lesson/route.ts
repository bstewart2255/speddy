import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

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
    const prompt = createEnhancedPrompt(students, duration, recentLogs || []);

    let content;

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
              content: prompt
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

function createEnhancedPrompt(students: any[], duration: number, recentLogs: any[]) {
  // Create detailed student profiles
  const studentProfiles = students.map(student => {
    const studentLogs = recentLogs.filter(log => log.student_id === student.id);

    return `
Student: ${student.initials} (Grade ${student.grade_level})
- Teacher: ${student.teacher_name}
- Reading Level: ${student.reading_level || 'Not specified'}
- Math Level: ${student.math_level || 'Not specified'}
- Learning Style: ${student.learning_style || 'Mixed'}
- IEP Goals: ${student.iep_goals?.join('; ') || 'Standard curriculum goals'}
- Focus Areas: ${student.focus_areas?.join(', ') || 'General academic skills'}
- Strengths: ${student.strengths?.join(', ') || 'To be identified'}
- Accommodations: ${student.accommodations?.join(', ') || 'Standard classroom accommodations'}
${studentLogs.length > 0 ? `- Recent Work: ${studentLogs[0].skills_practiced?.join(', ') || 'N/A'}` : ''}
${studentLogs.length > 0 && studentLogs[0].next_steps ? `- Recommended Next Steps: ${studentLogs[0].next_steps}` : ''}`;
  }).join('\n');

  return `Create a detailed, practical ${duration}-minute special education lesson plan for the following students:

${studentProfiles}

Requirements:
1. Address each student's SPECIFIC IEP goals with targeted activities
2. Differentiate instruction based on actual reading/math levels, not just grade
3. Incorporate each student's learning style (visual/auditory/kinesthetic)
4. Build on recent work and recommended next steps where provided
5. Include all required accommodations for each student
6. Use student strengths to support areas of need

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

Format as clean, semantic HTML. Use <h3> for sections, <h4> for activities, <strong> for student names, and clear paragraph structure. Make it immediately actionable for a special education teacher.`;
}

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