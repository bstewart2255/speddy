import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getStudentDetails, type StudentDetails } from '../../../lib/supabase/queries/student-details';
import { GRADE_SKILLS_CONFIG } from '../../../lib/grade-skills-config';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';
import { classifyIEPGoalsBySubject, hasGoalsForSubject } from '../../../lib/utils/subject-classifier';

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

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('generate_lesson', 'api');
  
  try {
    const supabase = await createClient();

    const body = await request.json();
    
    // Check if this is a generic lesson request (from the Lesson Builder)
    if (body.grade && body.subject && body.topic && body.timeDuration) {
      // This is a generic lesson request from the Lesson Builder
      const { grade, subject, topic, timeDuration } = body;
      
      log.info('Generic lesson generation requested', {
        userId,
        grade,
        subject,
        topic,
        timeDuration
      });

      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        log.warn('No OpenAI API key configured for generic lesson', { userId });
        return NextResponse.json({ 
          content: '<p>API key not configured. Please contact your administrator.</p>' 
        });
      }

      try {
        const openai = new OpenAI({ apiKey });
        
        const systemContent = `You are an expert educator creating engaging, curriculum-aligned worksheets for students. Create practical, age-appropriate educational materials that teachers can use immediately.`;
        
        const promptContent = `Create a ${timeDuration} worksheet for ${grade} ${subject} on the topic: ${topic}

Requirements:
1. The worksheet should be engaging and appropriate for ${grade} students
2. Include clear instructions at the top
3. Provide a variety of activity types (not just questions)
4. Make it visually organized with clear sections
5. Include approximately ${
  timeDuration === '5 minutes' ? '3-5' :
  timeDuration === '10 minutes' ? '5-8' :
  timeDuration === '15 minutes' ? '8-10' :
  timeDuration === '20 minutes' ? '10-12' :
  timeDuration === '30 minutes' ? '12-15' :
  timeDuration === '45 minutes' ? '15-20' :
  '20-25'
} problems or activities
6. For younger grades (K-2), describe visual elements using text only
7. For older grades (3-12), include critical thinking elements

IMPORTANT FORMATTING RULES:
- DO NOT include any <img> tags or image references
- Use text-based visual representations instead of images
- For fractions, use text like "1/2", "2/3", "3/4"
- For shapes, describe them in text: "Draw a circle divided into 4 equal parts"
- Use ASCII art, Unicode symbols (•, ○, ■, □, ▲, ▼), or text descriptions
- Use tables and text formatting for visual organization

Format as clean HTML with:
- <h2> for the worksheet title
- <h3> for section headers
- <p> for instructions
- <ol> or <ul> for numbered/bulleted exercises
- <div class="worksheet-section"> for different parts
- Include answer spaces or lines where students would write

Make it print-friendly and ready to use.`;

        const aiPerf = measurePerformanceWithAlerts('openai_api_call', 'api');
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 5000,
          messages: [
            {
              role: "system",
              content: systemContent
            },
            {
              role: "user",
              content: promptContent
            }
          ]
        });
        const aiDuration = aiPerf.end({ 
          tokensUsed: (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0)
        });

        const content = completion.choices[0]?.message?.content || '';
        
        // Save generic lesson to database with logging data
        const fullPromptSent = `System: ${systemContent}\n\nUser: ${promptContent}`;
        
        try {
          const { error: saveError } = await supabase
            .from('ai_generated_lessons')
            .insert({
              provider_id: userId,
              lesson_date: new Date().toISOString().split('T')[0],
              time_slot: 'generic', // Mark as generic lesson
              content: content,
              prompt: promptContent.substring(0, 2000), // Keep existing field for backward compatibility
              full_prompt_sent: fullPromptSent,
              ai_raw_response: {
                id: completion.id,
                model: completion.model,
                created: completion.created,
                choices: completion.choices,
                usage: completion.usage
              },
              model_used: 'gpt-4o-mini',
              prompt_tokens: completion.usage?.prompt_tokens || 0,
              completion_tokens: completion.usage?.completion_tokens || 0,
              generation_metadata: {
                type: 'generic',
                grade: grade,
                subject: subject,
                topic: topic,
                time_duration: timeDuration,
                duration_ms: Math.round(aiDuration),
                timestamp: new Date().toISOString()
              }
            });
          
          if (saveError) {
            log.error('Failed to save generic lesson to database', saveError, { userId, grade, subject, topic });
          } else {
            log.info('Saved generic lesson to database', { 
              userId, 
              grade,
              subject,
              topic,
              model: 'gpt-4o-mini',
              promptLength: fullPromptSent.length 
            });
          }
        } catch (dbError) {
          log.error('Error saving generic lesson to database', dbError, { userId });
        }
        
        log.info('Generic lesson generated successfully', {
          userId,
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
          duration: Math.round(aiDuration)
        });
        
        track.event('generic_lesson_generated', {
          userId,
          grade,
          subject,
          topic,
          timeDuration,
          tokensUsed: (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0)
        });

        return NextResponse.json({ content });
        
      } catch (apiError: any) {
        log.error('OpenAI API error for generic lesson', apiError, { 
          userId,
          errorCode: apiError.status || apiError.response?.status,
          errorMessage: apiError.message
        });
        
        return NextResponse.json(
          { error: 'Failed to generate lesson', details: apiError.message },
          { status: 500 }
        );
      }
    }
    
    // Otherwise, this is a student-specific lesson request (original functionality)
    const { students, timeSlot, duration = 30 } = body;
    
    log.info('Lesson generation requested', {
      userId,
      studentCount: students.length,
      duration,
      timeSlot
    });

    // Get user profile for curriculum information and role
    const profilePerf = measurePerformanceWithAlerts('fetch_user_profile', 'database');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('selected_curriculums, role')
      .eq('id', userId)
      .single();
    profilePerf.end({ hasProfile: !!profile });
    
    if (profileError) {
      log.error('Failed to fetch user profile', profileError, { userId });
    }

    // Get recent session logs for enhanced personalization
    const studentIds = students.map((s: any) => s.id);
    const logsPerf = measurePerformanceWithAlerts('fetch_session_logs', 'database');
    const { data: recentLogs, error: logsError } = await supabase
      .from('session_logs')
      .select('*')
      .in('student_id', studentIds)
      .order('date', { ascending: false })
      .limit(10);
    logsPerf.end({ logsCount: recentLogs?.length || 0 });
    
    if (logsError) {
      log.warn('Failed to fetch recent session logs', { 
        error: logsError.message,
        studentIds 
      });
    }

    // Create enhanced prompt with role information
    const promptPerf = measurePerformanceWithAlerts('create_prompt', 'api');
    const { promptContent, studentDetailsArray } = await createEnhancedPrompt(
      students, 
      duration, 
      recentLogs || [], 
      profile,
      profile?.role || 'resource', // Pass the role, default to resource
      body.subject // Pass subject if specified
    );
    promptPerf.end();
    

    let content: string;

    // Check if API key exists in Replit Secrets
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        log.info('Using OpenAI API for lesson generation', { userId });

        const openai = new OpenAI({
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

      // Capture the full prompt for logging
      const fullPromptSent = `System: ${systemContent}\n\nUser: ${promptContent}`;
      
      const aiPerf = measurePerformanceWithAlerts('openai_api_call', 'api');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 5000,
        messages: [
          {
            role: "system",
            content: systemContent
          },
          {
            role: "user",
            content: promptContent
          }
        ]
      });
      const aiDuration = aiPerf.end({ 
        tokensUsed: (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0),
        role: userRole 
      });

      // Extract the text content from OpenAI's response
      content = completion.choices[0]?.message?.content || '';
      
      // Save prompt and response to database
      try {
        const { error: saveError } = await supabase
          .from('ai_generated_lessons')
          .insert({
            provider_id: userId,
            lesson_date: new Date().toISOString().split('T')[0],
            time_slot: timeSlot || 'unspecified',
            content: content,
            prompt: promptContent.substring(0, 2000), // Keep existing field for backward compatibility
            full_prompt_sent: fullPromptSent,
            ai_raw_response: {
              id: completion.id,
              model: completion.model,
              created: completion.created,
              choices: completion.choices,
              usage: completion.usage
            },
            model_used: 'gpt-4o-mini',
            prompt_tokens: completion.usage?.prompt_tokens || 0,
            completion_tokens: completion.usage?.completion_tokens || 0,
            generation_metadata: {
              role: userRole,
              duration_ms: Math.round(aiDuration),
              student_count: students.length,
              has_iep_goals: studentDetailsArray.some(d => d?.iep_goals?.length > 0),
              has_working_skills: studentDetailsArray.some(d => d?.working_skills?.length > 0),
              timestamp: new Date().toISOString()
            },
            session_data: students.map(s => ({ id: s.id, student_id: s.id }))
          });
        
        if (saveError) {
          log.error('Failed to save lesson prompt/response to database', saveError, { userId });
        } else {
          log.info('Saved lesson prompt and response to database', { 
            userId, 
            model: 'gpt-4o-mini',
            promptLength: fullPromptSent.length 
          });
        }
      } catch (dbError) {
        log.error('Error saving to database', dbError, { userId });
      }

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

      // Log API usage
      log.info('OpenAI API success', {
        userId,
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0),
        duration: Math.round(aiDuration)
      });
      
      track.event('lesson_generated', {
        userId,
        studentCount: students.length,
        duration,
        role: userRole,
        tokensUsed: (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0)
      });

      } catch (apiError: any) {
        log.error('OpenAI API error', apiError, { 
          userId,
          errorCode: apiError.status || apiError.response?.status,
          errorMessage: apiError.message,
          errorDetails: apiError.response?.data || apiError.toString()
        });
        
        track.event('lesson_generation_failed', {
          userId,
          error: apiError.message,
          errorCode: apiError.status || apiError.response?.status
        });
        
        // Provide more detailed error information
        const errorMessage = (apiError.status || apiError.response?.status) === 401 
          ? 'Invalid API key. Please check your OpenAI API key configuration.'
          : (apiError.status || apiError.response?.status) === 429
          ? 'Rate limit exceeded. Please try again in a few moments.'
          : (apiError.status || apiError.response?.status) === 400
          ? 'Invalid request. Please check your input and try again.'
          : `Failed to generate lesson: ${apiError.message || 'Unknown error'}`;
        
        // Fall back to mock response if API fails
        content = `<div class="error-message">
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p>If this persists, please contact support.</p>
          <details class="mt-2">
            <summary class="cursor-pointer text-sm text-gray-600">Technical details</summary>
            <pre class="mt-1 text-xs bg-gray-100 p-2 rounded">${JSON.stringify({
              status: apiError.status,
              message: apiError.message,
              type: apiError.type
            }, null, 2)}</pre>
          </details>
        </div>`;
      }
    } else {
      // No API key configured, use mock response
      log.warn('No OpenAI API key configured', { userId });
      
      track.event('lesson_generation_no_api_key', {
        userId
      });
      
      content = `<div class="error-message">
        <p><strong>Note:</strong> No API key configured. Please add your OpenAI API key to generate lessons.</p>
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

    perf.end({ success: true });
    
    return NextResponse.json({ content });
  } catch (error: any) {
    log.error('Error generating lesson', error, { 
      userId,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorType: error?.constructor?.name
    });
    
    track.event('lesson_generation_error', {
      userId,
      error: error?.message || 'Unknown error',
      errorType: error?.constructor?.name
    });
    
    perf.end({ success: false });
    
    // Return more detailed error information
    return NextResponse.json(
      { 
        error: 'Failed to generate lesson content',
        details: {
          message: error?.message || 'Unknown error occurred',
          type: error?.constructor?.name || 'Error',
          // Only include stack in development
          ...(process.env.NODE_ENV === 'development' && { stack: error?.stack })
        }
      },
      { status: 500 }
    );
  }
});

async function createEnhancedPrompt(
  students: any[], 
  duration: number, 
  recentLogs: any[],
  profile: any,
  userRole: string,
  subject?: string
): Promise<{ promptContent: string; studentDetailsArray: any[] }> {
  // Fetch all student details once
  const studentDetailsArray = await Promise.all(
    students.map(async (student) => {
      const detailsPerf = measurePerformanceWithAlerts('fetch_student_details', 'database');
      try {
        const details = await getStudentDetails(student.id);
        detailsPerf.end({ studentId: student.id, success: true });
        return details;
      } catch (error) {
        log.error('Failed to fetch student details', error, { studentId: student.id });
        detailsPerf.end({ studentId: student.id, success: false });
        return null;
      }
    })
  );
  
  // If a subject is specified, validate that at least one student has goals for that subject
  const subjectLower = subject?.toLowerCase() || '';
  const isMathSubject = subjectLower && ['math', 'mathematics'].includes(subjectLower);
  const isELASubject = subjectLower && ['ela', 'english', 'reading', 'writing', 'phonics', 'spelling', 'literacy', 'language arts'].includes(subjectLower);
  
  if (subject && (isMathSubject || isELASubject)) {
    const studentsWithSubjectGoals = studentDetailsArray.filter(details => {
      if (!details || !details.iep_goals) return false;
      return hasGoalsForSubject(details.iep_goals, subject);
    });
    
    if (studentsWithSubjectGoals.length === 0) {
      log.warn('No students have IEP goals for the requested subject', {
        subject,
        studentCount: students.length
      });
      throw new Error(`None of the selected students have IEP goals for ${subject}. Please select students with ${subject} goals or choose a different subject.`);
    }
  }

  // Create detailed student profiles with skills
  const studentProfiles = await Promise.all(students.map(async (student, index) => {
    const studentLogs = recentLogs.filter(log => log.student_id === student.id);
    const details = studentDetailsArray[index];
    
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

        // Filter and sanitize IEP goals based on subject if specified
        let relevantGoals = details?.iep_goals || [];
        
        // Filter goals by subject if a subject is specified
        const subjectLower = subject?.toLowerCase() || '';
        const isMathSubject = subjectLower && ['math', 'mathematics'].includes(subjectLower);
        const isELASubject = subjectLower && ['ela', 'english', 'reading', 'writing', 'phonics', 'spelling', 'literacy', 'language arts'].includes(subjectLower);
        
        if (subject && (isMathSubject || isELASubject)) {
          const classification = classifyIEPGoalsBySubject(relevantGoals);
          if (isMathSubject) {
            relevantGoals = classification.mathGoals;
          } else {
            relevantGoals = classification.elaGoals;
          }
        }
        
        // Sanitize the filtered goals
        const sanitizedGoals = relevantGoals?.map(goal => 
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

    // Check what data we have across all students (reuse already fetched data)
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
    
    const promptContent = `${rolePrompt}

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

MANDATORY FORMAT - You MUST structure the lesson EXACTLY like this:

<h3>Opening ⏱️ 5 minutes</h3>
[Multi-sensory warm-up content here]

<h3>Main Instruction ⏱️ ${duration - 10} minutes</h3>
<h4>[Student Initials] (Grade [X])</h4>
<strong>IEP Goal:</strong> [State the specific goal]
<strong>Current Working Skills:</strong> [List skills]
<strong>Focus Areas:</strong> [List areas]

<strong>Activity 1:</strong> [Activity name]
[Activity description]

<strong>Activity 2:</strong> [Activity name]
[Activity description]

[Repeat for each student]

<h3>Closing ⏱️ 5 minutes</h3>
[Assessment activities here]

Use EXACTLY this format with:
- <h3> for main sections (Opening, Main Instruction, Closing) 
- ⏱️ emoji for ALL time durations
- <h4> for student names with grade
- <strong> for labels like "IEP Goal:", "Activity 1:", etc.

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

IMPORTANT: Follow the MANDATORY FORMAT shown above exactly. Do not deviate from the structure. Make it immediately actionable for a ${
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
${personalizationInstructions}`;

  return { promptContent, studentDetailsArray };
}