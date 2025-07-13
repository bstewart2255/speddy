import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { getStudentDetails } from '../../../lib/supabase/queries/student-details';
import { GRADE_SKILLS_CONFIG } from '../../../lib/grade-skills-config';

// Curriculum mapping
const CURRICULUM_DETAILS: Record<string, string> = {
  'wilson-reading': 'Wilson Reading System - structured literacy program',
  'orton-gillingham': 'Orton-Gillingham - multisensory phonics approach',
  'lindamood-bell': 'Lindamood-Bell - sensory-cognitive instruction',
  'reading-mastery': 'Reading Mastery - direct instruction program',
  'corrective-reading': 'Corrective Reading - remedial reading program',
  'rewards': 'REWARDS - reading comprehension strategies',
  'spire': 'S.P.I.R.E. - intensive reading intervention',
  'phonics-first': 'Phonics First - systematic phonics instruction',
  'fundations': 'Fundations - Wilson language basics',
  'raz-kids': 'Raz-Kids - digital leveled reading',
  'lexia-core5': 'Lexia Core5 - adaptive blended learning',
  'touch-math': 'TouchMath - multisensory math program',
  'math-u-see': 'Math-U-See - manipulative-based math',
  'saxon-math': 'Saxon Math - incremental development approach',
  'singapore-math': 'Singapore Math - conceptual understanding focus',
  'enumeracy': 'Do The Math - intensive math intervention',
  'number-worlds': 'Number Worlds - prevention/intervention program',
  'connecting-math': 'Connecting Math Concepts - explicit instruction',
  'handwriting-without-tears': 'Handwriting Without Tears - developmental approach',
  'step-up-to-writing': 'Step Up to Writing - writing instruction framework',
  'social-thinking': 'Social Thinking - social cognitive teaching',
  'zones-of-regulation': 'Zones of Regulation - self-regulation framework',
  'second-step': 'Second Step - social-emotional learning',
  'superflex': 'Superflex - social thinking curriculum',
  'unique-learning': 'Unique Learning System - standards-based special ed',
  'edmark': 'Edmark Reading Program - whole-word approach',
  'teachtown': 'TeachTown - computer-assisted instruction',

  // Speech Therapy Resources
  'speech-articulation': 'Articulation Station - speech sound practice',
  'language-builder': 'Language Builder - vocabulary and concept development',
  'social-language': 'Social Language Development - pragmatic skills',
  'aac-pecs': 'PECS - Picture Exchange Communication System',
  'aac-proloquo': 'Proloquo2Go - AAC communication app',
  'phonological-awareness': 'Phonological Awareness Activities',
  'fluency-shaping': 'Fluency Shaping Techniques',

  // Occupational Therapy Resources
  'handwriting-hwt': 'Handwriting Without Tears - fine motor program',
  'sensory-diet': 'Sensory Diet Activities - regulation strategies',
  'zones-regulation': 'Zones of Regulation - self-regulation',
  'brain-gym': 'Brain Gym - movement-based learning',
  'alert-program': 'Alert Program - self-regulation',
  'fine-motor-skills': 'Fine Motor Skills Development Kit',
  'visual-motor': 'Visual Motor Integration Activities',

  // Counseling Resources
  'second-step-sel': 'Second Step - social emotional learning',
  'mindfulness-schools': 'Mindfulness in Schools curriculum',
  'cbt-worksheets': 'CBT Worksheets for Children',
  'restorative-practices': 'Restorative Justice Practices',

  // Life Skills/Transition
  'life-centered': 'Life Centered Education curriculum',
  'transition-planning': 'Transition Planning Toolkit',
  'job-skills': 'Job Skills Assessment and Training'
};
// Role-specific lesson templates
const ROLE_SPECIFIC_PROMPTS: Record<string, string> = {
  speech: `Create a detailed speech therapy session plan that focuses on:
- Articulation and phonological processes appropriate for each student's age
- Receptive and expressive language development
- Pragmatic/social communication skills
- Oral motor exercises if needed
- AAC strategies for non-verbal or minimally verbal students
- Functional communication in natural contexts`,

  ot: `Create a detailed occupational therapy session plan that focuses on:
- Fine motor skill development (pencil grasp, cutting, manipulation)
- Gross motor coordination and motor planning
- Sensory integration and regulation strategies
- Visual-motor integration and visual perception
- Self-care and activities of daily living (ADL) skills
- Handwriting and pre-writing skills appropriate to grade level
- Executive functioning and organizational skills`,

  resource: `Create a detailed special education lesson plan that focuses on:
- Academic skills in ELA and Math aligned to grade-level standards
- Differentiated instruction based on learning needs
- Multi-sensory teaching approaches
- Evidence-based interventions for reading and math
- Study skills and learning strategies`,

  counseling: `Create a detailed counseling session plan that focuses on:
- Social-emotional learning (SEL) skills
- Coping strategies and emotional regulation
- Social skills and peer relationships
- Self-advocacy and self-awareness
- Behavioral strategies and positive behavior support
- Crisis prevention and de-escalation techniques`,

  specialist: `Create a detailed program specialist session plan that focuses on:
- Transition planning and life skills
- Vocational readiness and career exploration
- Community-based instruction
- Functional academics
- Self-determination and independence skills`
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { students, timeSlot, duration = 30 } = await request.json();

    /// Get user profile for curriculum information and role
    const { data: profile } = await supabase
      .from('profiles')
      .select('selected_curriculums, role')
      .eq('id', user.id)
      .single();

    // Get recent session logs for enhanced personalization
    const studentIds = students.map((s: any) => s.id);
    const { data: recentLogs } = await supabase
      .from('session_logs')
      .select('*')
      .in('student_id', studentIds)
      .order('date', { ascending: false })
      .limit(10);

    // Create enhanced prompt with role information
    const promptContent = await createEnhancedPrompt(
      students, 
      duration, 
      recentLogs || [], 
      profile,
      profile?.role || 'resource' // Pass the role, default to resource
    );
    

    let content: string;

    // Check if API key exists in Replit Secrets
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        console.log('Using Anthropic API for lesson generation...');

        const anthropic = new Anthropic({
          apiKey: apiKey,
        });

      const userRole = profile?.role || 'resource';
      const systemContent = `You are an expert ${
        userRole === 'speech' ? 'speech-language pathologist' : 
        userRole === 'ot' ? 'occupational therapist' : 
        userRole === 'counseling' ? 'school counselor' :
        userRole === 'specialist' ? 'program specialist' :
        'special education teacher'
      } creating highly personalized ${
        userRole === 'speech' ? 'speech therapy session plans' :
        userRole === 'ot' ? 'occupational therapy session plans' :
        userRole === 'counseling' ? 'counseling session plans' :
        'lesson plans'
      }. You have deep knowledge of evidence-based practices, developmental milestones, and therapeutic interventions specific to your field. Always create practical, engaging activities appropriate for the school setting.`;

      const message = await anthropic.messages.create({
        model: "claude-3-haiku-20240307", // Cheapest and fastest model
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: systemContent
          },
          {
            role: "user",
            content: promptContent
          }
        ]
      });

        // Extract the text content from Claude's response
        content = message.content[0].type === 'text' ? message.content[0].text : '';

        // Map student numbers back to initials for display
        students.forEach((student, index) => {
          const studentNum = `Student ${index + 1}`;
          const studentInitials = student.initials;
          // Replace all instances of "Student 1" with actual initials
          content = content.replace(
            new RegExp(studentNum, 'g'), 
            studentInitials
          );
        });

        // Log usage for monitoring (visible in Replit console)
        console.log(`✅ Anthropic API Success - Tokens used: ${message.usage.input_tokens + message.usage.output_tokens}`);

      } catch (apiError: any) {
        console.error('❌ Anthropic API error:', apiError.message);
        // Fall back to mock response if API fails
        content = `<div class="error-message">
          <p><strong>Error:</strong> Failed to generate lesson. Please try again.</p>
          <p>If this persists, check your API configuration.</p>
        </div>`;
      }
    } else {
      // No API key configured, use mock response
      console.log('⚠️ No Anthropic API key found in Secrets. Using mock response.');
      content = `<div class="error-message">
        <p><strong>Note:</strong> No API key configured. Please add your Anthropic API key to generate lessons.</p>
        <p>Contact your administrator for assistance.</p>
      </div>`;

      // Map student numbers back to initials for display
      students.forEach((student, index) => {
        const studentNum = `Student ${index + 1}`;
        const studentInitials = student.initials;
        // Replace all instances of "Student 1" with actual initials
        content = content.replace(
          new RegExp(studentNum, 'g'), 
          studentInitials
        );
      });
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
  recentLogs: any[],
  profile: any,
  userRole: string
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

    // Anonymize student data before sending to AI
        const studentIndex = students.indexOf(student) + 1;

        // Sanitize IEP goals if they exist
        const sanitizedGoals = details?.iep_goals?.map(goal => 
          goal.replace(/\b\d{4}\b/g, 'this year') // Replace years
              .replace(/January|February|March|April|May|June|July|August|September|October|November|December/gi, 'this term') // Replace months
              .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/gi, 'this term') // Replace abbreviated months
        );

      return `
    Student ${studentIndex} (Grade ${student.grade_level})
    - IEP Goals: ${sanitizedGoals && sanitizedGoals.length > 0 
        ? sanitizedGoals.join('; ') 
        : 'Standard curriculum goals'}
    - Current Working Skills: ${workingSkillsText}
    - Focus Areas: ${student.focus_areas?.join(', ') || 'General academic skills'}
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

    // Get the role-specific prompt or default to resource
    const rolePrompt = ROLE_SPECIFIC_PROMPTS[userRole] || ROLE_SPECIFIC_PROMPTS.resource;
    
    return `${rolePrompt}

Duration: ${duration} minutes

Student Information:
${studentProfiles.join('\n')}

Requirements:
1. Address each student's SPECIFIC IEP goals with targeted activities
2. Focus on the Current Working Skills listed for each student - these are the exact skills they need practice with
3. Differentiate instruction based on actual needs, not just grade level
4. Build on recent work and recommended next steps where provided
5. Use each student's focus areas to guide instruction
6. For therapy sessions (speech/OT), incorporate evidence-based practices appropriate for each student's age and developmental level

CRITICAL: Pay special attention to the "Current Working Skills" for each student. These are the specific skills the teacher has identified as current focus areas. Design activities that directly practice these skills.

Structure the lesson with:
- Opening (5 min): Multi-sensory warm-up engaging all learning styles
- Main Instruction (${duration - 10} min): 
  * Differentiated activities for each ability level
  * Specific IEP goal practice for each student
  * Clear instructions for grouping/individual work
- Closing (5 min): Individual assessment aligned to goals

${profile?.selected_curriculums?.length > 0 ? `

AVAILABLE CURRICULUMS:
The district uses these special education curriculums that you should incorporate when relevant:
${profile.selected_curriculums.map((id: string) => 
  CURRICULUM_DETAILS[id] || id
).join('\n')}

When designing activities, reference these specific curriculums where appropriate. For example:
- Use Wilson Reading System techniques for phonics instruction
- Apply TouchMath strategies for number concepts
- Incorporate Zones of Regulation for self-regulation activities
` : ''}

For each activity, specify:
- Which student(s) it targets
- Which IEP goal/skill it addresses
- Which curriculum/program to use (if applicable)
- How to assess progress

Format as clean, semantic HTML. Use <h3> for sections, <h4> for activities, <strong> for student names, and clear paragraph structure. Make it immediately actionable for a ${
  userRole === 'speech' ? 'speech-language pathologist' :
  userRole === 'ot' ? 'occupational therapist' :
  userRole === 'counseling' ? 'school counselor' :
  userRole === 'specialist' ? 'program specialist' :
  'special education teacher'
}.

${userRole === 'resource' || !userRole ? `
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

When planning activities, specifically reference these worksheets when appropriate.` : ''}

${userRole !== 'resource' && !hasIEPGoals ? `
IMPORTANT: Since no specific IEP goals are provided, create activities based on best practices for this age group:

${userRole === 'speech' ? `
- For Kindergarten-1st: Focus on articulation of early sounds (/p/, /b/, /m/), vocabulary building, following directions
- For 2nd-3rd: Work on later sounds (/r/, /l/, /s/ blends), narrative skills, answering WH questions
- For 4th-5th: Target complex language skills, inferencing, social language, conversational skills
- Include oral motor exercises and phonological awareness activities as appropriate` : ''}

${userRole === 'ot' ? `
- For Kindergarten-1st: Focus on pencil grasp, cutting skills, letter formation, sensory regulation
- For 2nd-3rd: Work on handwriting fluency, bilateral coordination, visual-motor skills
- For 4th-5th: Target organizational skills, typing, complex fine motor tasks, self-advocacy
- Include sensory breaks and movement activities throughout` : ''}

${userRole === 'counseling' ? `
- For all grades: Focus on identifying emotions, coping strategies, friendship skills
- For younger students: Use play-based interventions, social stories, visual supports
- For older students: Include problem-solving, conflict resolution, self-advocacy skills` : ''}
` : ''}
${personalizationInstructions}}`;
}