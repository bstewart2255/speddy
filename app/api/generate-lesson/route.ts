import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { students, timeSlot, duration = 30 } = await request.json();

    // Group students by grade
    const gradeGroups = students.reduce((acc: any, student: any) => {
      const grade = student.grade_level;
      if (!acc[grade]) acc[grade] = [];
      acc[grade].push(student);
      return acc;
    }, {});

    // Create a detailed prompt
    const prompt = `You are an expert special education teacher. Generate a detailed ${duration}-minute lesson plan for a group session with the following students:

${Object.entries(gradeGroups).map(([grade, studentList]: [string, any]) => 
  `Grade ${grade}: ${studentList.map((s: any) => `${s.initials} (Teacher: ${s.teacher_name})`).join(', ')}`
).join('\n')}

Please create a comprehensive lesson plan that includes:

1. **Learning Objectives** - Clear, measurable objectives appropriate for mixed grade levels
2. **Materials Needed** - List all required materials
3. **Lesson Structure**:
   - Opening/Warm-up Activity (5 minutes) - Engaging activity to start
   - Main Instruction (${duration - 10} minutes) - Core teaching with differentiation strategies
   - Closing/Assessment (5 minutes) - Quick assessment or exit ticket
4. **Differentiation Strategies** - Specific accommodations for each grade level
5. **Assessment Methods** - How to evaluate student understanding
6. **Extension Activities** - For students who finish early
7. **IEP Considerations** - General accommodations for special education students

IMPORTANT: Format the response as clean HTML with proper headings and sections. Use <h3> for main sections, <h4> for subsections, <ul> and <li> for lists, and <p> for paragraphs. Make it practical and immediately usable by a special education teacher. The HTML should be well-structured and ready to display or print.`;

    let content;

    // Check if we're in the browser environment with claude.complete available
    if (typeof window !== 'undefined' && window.claude?.complete) {
      try {
        const response = await window.claude.complete(prompt);
        content = response;
      } catch (error) {
        console.error('Claude API error:', error);
        // Fall back to the detailed mock response
        content = await generateMockResponse(prompt, gradeGroups, duration);
      }
    } else {
      // Use mock response for now (server-side or no Claude available)
      content = await generateMockResponse(prompt, gradeGroups, duration);
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

// Keep the existing generateMockResponse function
async function generateMockResponse(prompt: string, gradeGroups: any, duration: number) {
  const grades = Object.keys(gradeGroups).sort();
  const studentCount = Object.values(gradeGroups).flat().length;

  return `
    <div class="lesson-plan">
      <h3>Multi-Grade Special Education Lesson Plan</h3>
      <div class="lesson-header">
        <p><strong>Duration:</strong> ${duration} minutes</p>
        <p><strong>Group Size:</strong> ${studentCount} students</p>
        <p><strong>Grade Levels:</strong> ${grades.join(', ')}</p>
        <p><strong>Subject Focus:</strong> Mathematics - Number Sense and Operations</p>
      </div>

      <h3>Learning Objectives</h3>
      <ul>
        ${grades.map(grade => {
          if (grade === 'K' || grade === '1') {
            return '<li><strong>Grades K-1:</strong> Students will identify and count numbers 1-20 with 80% accuracy</li>';
          } else if (grade === '2' || grade === '3') {
            return '<li><strong>Grades 2-3:</strong> Students will solve addition and subtraction problems within 100</li>';
          } else {
            return '<li><strong>Grades 4-5:</strong> Students will solve multi-step word problems involving all operations</li>';
          }
        }).join('\n')}
      </ul>

      <h3>Materials Needed</h3>
      <ul>
        <li>Whiteboard and colored markers</li>
        <li>Number cards (1-100)</li>
        <li>Manipulatives (counting bears, base-10 blocks)</li>
        <li>Differentiated worksheets by grade level</li>
        <li>Visual number line</li>
        <li>Timer</li>
        <li>Exit ticket forms</li>
      </ul>

      <h3>Lesson Structure</h3>

      <h4>1. Opening Activity (5 minutes) - "Number of the Day"</h4>
      <p>Display a number on the board (e.g., 24). Each student shares something about this number:</p>
      <ul>
        <li><strong>K-1:</strong> Count to the number, identify if it's bigger/smaller than 10</li>
        <li><strong>2-3:</strong> Break it into tens and ones, find numbers that add to it</li>
        <li><strong>4-5:</strong> Find factors, create equations that equal this number</li>
      </ul>

      <h4>2. Main Instruction (${duration - 10} minutes) - Differentiated Centers</h4>
      <p>Divide class into 3 rotating centers (${Math.floor((duration - 10) / 3)} minutes each):</p>

      <div style="margin-left: 20px;">
        <p><strong>Center A - Hands-On Manipulation:</strong></p>
        <ul>
          <li>K-1: Sort and count objects, create number sets</li>
          <li>2-3: Use base-10 blocks for addition/subtraction</li>
          <li>4-5: Model word problems with manipulatives</li>
        </ul>

        <p><strong>Center B - Guided Practice with Teacher:</strong></p>
        <ul>
          <li>Direct instruction tailored to each grade's objectives</li>
          <li>Use of visual aids and step-by-step modeling</li>
          <li>Immediate feedback and error correction</li>
        </ul>

        <p><strong>Center C - Independent/Partner Work:</strong></p>
        <ul>
          <li>Grade-appropriate worksheets or task cards</li>
          <li>Peer tutoring opportunities</li>
          <li>Self-checking activities</li>
        </ul>
      </div>

      <h4>3. Closing Activity (5 minutes) - "Show What You Know"</h4>
      <p>Quick formative assessment:</p>
      <ul>
        <li>Each student completes one problem at their level</li>
        <li>Share strategies with a partner</li>
        <li>Teacher does quick check of understanding</li>
      </ul>

      <h3>Differentiation Strategies</h3>
      <ul>
        <li><strong>For struggling learners:</strong> Provide number lines, hundreds charts, additional manipulatives</li>
        <li><strong>For advanced learners:</strong> Offer challenge problems, peer tutoring roles</li>
        <li><strong>Visual supports:</strong> Color-coding, graphic organizers, step-by-step visual guides</li>
        <li><strong>Reduced problem sets:</strong> Quality over quantity, focus on mastery</li>
      </ul>

      <h3>Assessment Methods</h3>
      <ul>
        <li>Observation during center rotations</li>
        <li>Exit ticket performance</li>
        <li>Anecdotal notes on student strategies</li>
        <li>Photo documentation of manipulative work</li>
      </ul>

      <h3>IEP Accommodations</h3>
      <ul>
        <li>Extended time as needed</li>
        <li>Preferential seating near instruction</li>
        <li>Frequent breaks between activities</li>
        <li>Modified problem complexity based on IEP goals</li>
        <li>Use of assistive technology as specified</li>
      </ul>

      <h3>Extension Activities</h3>
      <ul>
        <li>Create their own word problems for classmates</li>
        <li>Math journal reflections</li>
        <li>Digital math games on tablets</li>
        <li>Teach a concept to a younger student</li>
      </ul>
    </div>
  `;
}