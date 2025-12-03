import { NextRequest, NextResponse } from 'next/server';
import { generateV2Worksheet } from '@/lib/lessons/v2-generator';
import type { V2GenerationRequest } from '@/lib/lessons/v2-generator';
import { generateLessonPlan } from '@/lib/lessons/lesson-plan-generator';
import type { LessonPlanRequest } from '@/lib/lessons/lesson-plan-generator';
import { createClient } from '@/lib/supabase/server';
import type { Student } from '@/lib/lessons/ability-detector';
import { determineContentLevel, hasMatchingGoals } from '@/lib/lessons/ability-detector';
import { withAuth } from '@/lib/api/with-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
  try {
    // Parse request body
    const body = await req.json();

    // Validate required fields and types
    if (!body.topic || !body.subjectType || !body.duration) {
      return NextResponse.json(
        { error: 'Missing required fields: topic, subjectType, duration' },
        { status: 400 }
      );
    }

    // Validate field types
    if (typeof body.subjectType !== 'string' || typeof body.topic !== 'string') {
      return NextResponse.json(
        { error: 'Invalid field types: topic and subjectType must be strings' },
        { status: 400 }
      );
    }

    if (typeof body.duration !== 'number') {
      return NextResponse.json(
        { error: 'Invalid field type: duration must be a number' },
        { status: 400 }
      );
    }

    // Validate that either grade or studentIds are provided
    if (!body.grade && (!body.studentIds || body.studentIds.length === 0)) {
      return NextResponse.json(
        { error: 'Must provide either a grade level or select students with IEP goals' },
        { status: 400 }
      );
    }

    // Validate field values
    if (![15, 30, 45, 60].includes(body.duration)) {
      return NextResponse.json(
        { error: 'Invalid duration. Must be 15, 30, 45, or 60' },
        { status: 400 }
      );
    }

    // Validate grade if provided
    if (body.grade && !['K', '1', '2', '3', '4', '5'].includes(body.grade)) {
      return NextResponse.json(
        { error: 'Invalid grade. Must be K-5 or empty' },
        { status: 400 }
      );
    }

    if (!['ela', 'math'].includes(body.subjectType)) {
      return NextResponse.json(
        { error: 'Invalid subjectType. Must be ela or math' },
        { status: 400 }
      );
    }

    const validElaTopics = ['reading-comprehension', 'phonics-decoding', 'writing-prompt', 'grammar-vocabulary'];
    const validMathTopics = ['computation', 'word-problems', 'mixed-practice', 'addition', 'subtraction', 'multiplication', 'division', 'fractions'];
    const validTopics = body.subjectType === 'ela' ? validElaTopics : validMathTopics;

    if (!validTopics.includes(body.topic)) {
      return NextResponse.json(
        { error: `Invalid topic for ${body.subjectType}. Must be one of: ${validTopics.join(', ')}` },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured in environment');
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Fetch student data if studentIds provided
    let students: Student[] | undefined;
    if (body.studentIds && Array.isArray(body.studentIds) && body.studentIds.length > 0) {
      const supabase = await createClient();
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, grade_level, student_details(iep_goals)')
        .in('id', body.studentIds);

      if (studentsError) {
        console.error('[V2 API] Error fetching students:', studentsError);
        // If no grade provided and student fetch failed, return error
        if (!body.grade) {
          return NextResponse.json(
            { error: `Unable to load student data: ${studentsError.message}. Please try selecting a grade level or refresh the page.` },
            { status: 500 }
          );
        }
        // If grade is provided, continue with grade-only generation
        console.log('[V2 API] Continuing with grade-only generation due to student fetch error');
      } else if (studentsData && studentsData.length > 0) {
        // Transform to Student type
        students = studentsData.map((s: any) => {
          // Parse grade level
          let grade: number;
          if (typeof s.grade_level === 'string') {
            const gradeStr = s.grade_level.toUpperCase();
            if (gradeStr === 'K' || gradeStr === 'KINDERGARTEN') {
              grade = 0;
            } else {
              grade = parseInt(gradeStr, 10) || 3;
            }
          } else {
            grade = s.grade_level || 3;
          }

          // Extract IEP goals
          let iepGoals: string[] = [];
          if (s.student_details) {
            const details = Array.isArray(s.student_details) ? s.student_details : [s.student_details];
            for (const detail of details) {
              if (detail?.iep_goals) {
                if (Array.isArray(detail.iep_goals)) {
                  iepGoals.push(...detail.iep_goals.filter((g: any) => typeof g === 'string' && g.trim()));
                } else if (typeof detail.iep_goals === 'string' && detail.iep_goals.trim()) {
                  if (detail.iep_goals.includes(';')) {
                    iepGoals.push(...detail.iep_goals.split(';').map((g: string) => g.trim()).filter(Boolean));
                  } else {
                    iepGoals.push(detail.iep_goals);
                  }
                }
              }
            }
          }

          return {
            id: s.id,
            grade,
            iepGoals: iepGoals.length > 0 ? iepGoals : undefined,
          };
        });

        console.log(`[V2 API] Fetched ${students.length} students with IEP data`);
      } else if (studentsData && studentsData.length === 0) {
        // No students found - could be RLS issue or invalid IDs
        console.warn('[V2 API] No students found for provided IDs:', body.studentIds);
        if (!body.grade) {
          return NextResponse.json(
            { error: 'Unable to access the selected students. Please select a grade level or ensure you have permission to view these students.' },
            { status: 403 }
          );
        }
        // Continue with grade-only generation
        console.log('[V2 API] Continuing with grade-only generation since no student data found');
      }
    }

    // Check for matching goals and create warning if needed (when no grade is provided)
    let iepGoalWarning: string | undefined;
    if (students && students.length > 0 && !body.grade) {
      // Check if any student has IEP goals
      const hasAnyGoals = students.some(s => s.iepGoals && s.iepGoals.length > 0);

      if (hasAnyGoals) {
        // Check if any goals match the subject type
        const hasMatching = hasMatchingGoals(students, body.subjectType);

        if (!hasMatching) {
          const subjectName = body.subjectType === 'ela' ? 'ELA/Reading' : 'Math';
          const studentWord = students.length === 1 ? 'student doesn\'t' : 'students don\'t';

          iepGoalWarning = `Note: The selected ${studentWord} have ${subjectName} keywords in their IEP goals. The lesson has been generated, but please verify it aligns with the students' actual IEP objectives.`;
          console.log('[V2 API] IEP goal mismatch warning:', iepGoalWarning);
        }
      }
    }

    // Build generation request
    const generationRequest: V2GenerationRequest = {
      topic: body.topic,
      subjectType: body.subjectType,
      grade: body.grade,
      duration: body.duration,
      studentIds: body.studentIds,
      studentInitials: body.studentInitials,
      students,  // Pass student data for IEP-aware generation
    };

    console.log('[V2 API] Generation request:', {
      topic: body.topic,
      subjectType: body.subjectType,
      grade: body.grade,
      duration: body.duration,
      studentCount: students?.length ?? 0,
      hasStudentIds: !!body.studentIds?.length,
    });

    // Generate worksheet
    const result = await generateV2Worksheet(generationRequest, apiKey);

    if (!result.success) {
      console.error('V2 worksheet generation failed:', {
        error: result.error,
        topic: body.topic,
        grade: body.grade,
        duration: body.duration,
        subjectType: body.subjectType,
      });
      return NextResponse.json(
        { error: result.error || 'Generation failed' },
        { status: 500 }
      );
    }

    // Conditionally generate lesson plan
    let lessonPlan;
    let lessonPlanMetadata;
    if (body.generateLessonPlan) {
      try {
        // Reuse ability detection for consistency with worksheet generation
        const abilityProfile = determineContentLevel(
          students,
          body.grade,
          body.subjectType
        );

        // Extract worksheet content for lesson plan generation
        let worksheetContent = '';
        if (result.content) {
          // Add passage if present
          if (result.content.passage) {
            worksheetContent += `PASSAGE/TEXT:\n${result.content.passage}\n\n`;
          }

          // Add writing prompt if present
          if (result.content.prompt) {
            worksheetContent += `WRITING PROMPT:\n${result.content.prompt}\n\n`;
          }

          // Add examples if present
          if (result.content.examples && result.content.examples.length > 0) {
            worksheetContent += `EXAMPLE PROBLEMS:\n`;
            result.content.examples.forEach((ex, i) => {
              worksheetContent += `${i + 1}. ${ex.problem}\n   Solution: ${ex.solution.join('; ')}\n`;
            });
            worksheetContent += '\n';
          }

          // Add questions/problems
          if (result.content.questions && result.content.questions.length > 0) {
            worksheetContent += `STUDENT QUESTIONS (${result.content.questions.length} total):\n`;
            // Include first 5 questions to give context without overwhelming the prompt
            const sampleQuestions = result.content.questions.slice(0, 5);
            sampleQuestions.forEach((q, i) => {
              worksheetContent += `${i + 1}. ${q.text}\n`;
              if (q.explanation) {
                worksheetContent += `   Explanation: ${q.explanation}\n`;
              }
            });
            if (result.content.questions.length > 5) {
              worksheetContent += `... and ${result.content.questions.length - 5} more similar questions\n`;
            }
          }
        }

        const lessonPlanRequest: LessonPlanRequest = {
          topic: body.topic,
          subjectType: body.subjectType,
          grade: body.grade,
          duration: body.duration,
          students,
          abilityLevel: abilityProfile.abilityLevel,  // Use detected ability level
          worksheetContent,  // Pass the actual worksheet content
        };

        const lessonPlanResult = await generateLessonPlan(lessonPlanRequest, apiKey);
        lessonPlan = lessonPlanResult.lessonPlan;
        lessonPlanMetadata = lessonPlanResult.metadata;
        console.log('[V2 API] Lesson plan generated successfully');
      } catch (error) {
        console.error('[V2 API] Lesson plan generation failed:', error);
        // Don't fail the entire request if lesson plan fails
        // Just log the error and return worksheet without lesson plan
      }
    }

    // Combine metadata if lesson plan was generated
    const combinedMetadata = lessonPlanMetadata ? {
      promptTokens: result.metadata.promptTokens + lessonPlanMetadata.promptTokens,
      completionTokens: result.metadata.completionTokens + lessonPlanMetadata.completionTokens,
      totalTokens: result.metadata.totalTokens + lessonPlanMetadata.totalTokens,
      generationTime: result.metadata.generationTime + lessonPlanMetadata.generationTime,
      model: result.metadata.model,
      generationVersion: result.metadata.generationVersion,
      worksheetTokens: result.metadata.totalTokens,
      lessonPlanTokens: lessonPlanMetadata.totalTokens,
    } : result.metadata;

    // Save to database silently (for analytics)
    let savedLessonId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('school_id, district_id, state_id')
        .eq('id', userId)
        .single();

      // Prepare lesson record
      const lessonDate = new Date().toISOString().split('T')[0];
      const timeSlot = `on-demand-${Date.now()}`;  // Unique identifier for on-demand lessons

      // Build grade_levels array from either body.grade or students
      const gradeLevels: string[] = [];
      if (body.grade) {
        gradeLevels.push(body.grade);
      }
      if (students && students.length > 0) {
        // Add unique grade levels from students
        const studentGrades = students.map(s => {
          if (s.grade === 0) return 'K';
          return s.grade.toString();
        });
        const uniqueGrades = Array.from(new Set(studentGrades));
        uniqueGrades.forEach(grade => {
          if (!gradeLevels.includes(grade)) {
            gradeLevels.push(grade);
          }
        });
      }

      const lessonRecord = {
        provider_id: userId,
        lesson_source: 'ai_generated',
        generation_version: 'v2',
        lesson_date: lessonDate,
        time_slot: timeSlot,
        content: {
          worksheet: result.worksheet,
          lessonPlan: lessonPlan || null,
        },
        title: result.worksheet?.title || body.topic,
        subject: body.subjectType.toUpperCase(),
        topic: body.topic,
        grade_levels: gradeLevels.length > 0 ? gradeLevels : null,
        duration_minutes: body.duration,
        // SECURITY: Only persist student IDs that were actually fetched through RLS
        student_ids: students && students.length > 0 ? students.map(s => s.id) : null,
        metadata: {
          generatedAt: new Date().toISOString(),
          abilityLevel: students ? determineContentLevel(students, body.grade, body.subjectType).abilityLevel : body.grade,
          hasLessonPlan: !!lessonPlan,
        },
        school_id: profile?.school_id || null,
        district_id: profile?.district_id || null,
        state_id: profile?.state_id || null,
        ai_model: combinedMetadata.model,
        prompt_tokens: combinedMetadata.promptTokens,
        completion_tokens: combinedMetadata.completionTokens,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: savedLesson, error: saveError } = await supabase
        .from('lessons')
        .insert(lessonRecord)
        .select('id')
        .single();

      if (saveError) {
        console.error('[V2 API] Failed to save lesson to database:', saveError);
        // Don't fail the request - lesson was generated successfully
      } else if (savedLesson) {
        savedLessonId = savedLesson.id;
        console.log('[V2 API] Lesson saved to database:', savedLessonId);
      }
    } catch (saveError) {
      console.error('[V2 API] Error saving lesson to database:', saveError);
      // Don't fail the request - lesson was generated successfully
    }

    // Return successful result with optional lesson plan and combined metadata
    return NextResponse.json({
      ...result,
      lessonPlan,
      metadata: combinedMetadata,
      lessonId: savedLessonId,  // Include lessonId (though UI won't use it)
      warning: iepGoalWarning,  // Include IEP goal warning if present
    });
  } catch (error) {
    console.error('V2 generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
  })(request);
}
