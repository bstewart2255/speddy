// app/api/ai-lessons/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { lessonGenerator, LessonGenerationRequest } from '@/lib/ai-lessons/lesson-generator';
import { adjustmentQueue } from '@/lib/ai-lessons/adjustment-queue';
import { hasGoalsForSubject } from '@/lib/utils/subject-classifier';
import { getStudentDetails } from '@/lib/supabase/queries/student-details';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: LessonGenerationRequest = await request.json();
    
    // Validate required fields
    if (!body.studentIds || body.studentIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one student ID is required' },
        { status: 400 }
      );
    }

    if (!body.lessonType || !['individual', 'group'].includes(body.lessonType)) {
      return NextResponse.json(
        { error: 'Invalid lesson type. Must be "individual" or "group"' },
        { status: 400 }
      );
    }

    if (body.lessonType === 'group' && (body.studentIds.length < 2 || body.studentIds.length > 6)) {
      return NextResponse.json(
        { error: 'Group lessons require 2-6 students' },
        { status: 400 }
      );
    }

    if (!body.subject) {
      return NextResponse.json(
        { error: 'Subject is required' },
        { status: 400 }
      );
    }

    // Validate students have IEP goals for the requested subject
    if (body.subject.toLowerCase() === 'math' || body.subject.toLowerCase() === 'ela' || body.subject.toLowerCase() === 'english') {
      const studentsWithSubjectGoals: string[] = [];
      const studentsWithoutGoals: string[] = [];
      
      // Check each student's IEP goals
      for (const studentId of body.studentIds) {
        try {
          const studentDetails = await getStudentDetails(studentId);
          if (studentDetails && hasGoalsForSubject(studentDetails.iep_goals, body.subject)) {
            studentsWithSubjectGoals.push(studentId);
          } else {
            studentsWithoutGoals.push(studentId);
          }
        } catch (error) {
          console.warn(`Failed to fetch details for student ${studentId}:`, error);
          // If we can't fetch student details, allow the lesson to proceed
          studentsWithSubjectGoals.push(studentId);
        }
      }
      
      // If no students have goals for this subject, return an error
      if (studentsWithSubjectGoals.length === 0) {
        return NextResponse.json(
          { 
            error: `None of the selected students have IEP goals for ${body.subject}`,
            details: 'Please select students with appropriate IEP goals or choose a different subject.'
          },
          { status: 400 }
        );
      }
      
      // If some students don't have goals, return a warning but proceed with students who do have goals
      if (studentsWithoutGoals.length > 0) {
        console.warn(`Some students don't have ${body.subject} goals:`, studentsWithoutGoals);
        // Update the studentIds to only include students with goals
        body.studentIds = studentsWithSubjectGoals;
        
        // If this reduces to just 1 student for a group lesson, change to individual
        if (body.lessonType === 'group' && studentsWithSubjectGoals.length < 2) {
          body.lessonType = 'individual';
        }
      }
    }

    // Set defaults
    const lessonRequest: LessonGenerationRequest = {
      ...body,
      duration: body.duration || 30,
      teacherId: user.id
    };

    // Generate the lesson
    const lesson = await lessonGenerator.generateLesson(lessonRequest);

    // Process any pending adjustments for these students
    for (const studentId of body.studentIds) {
      const adjustments = await adjustmentQueue.getPendingAdjustments(
        studentId,
        body.subject,
        5
      );
      
      // Mark top adjustments as processed since we're incorporating them
      const adjustmentIds = adjustments.map(a => a.id);
      if (adjustmentIds.length > 0) {
        await adjustmentQueue.processBatch(adjustmentIds);
      }
    }

    // Return the generated lesson
    return NextResponse.json({
      success: true,
      lesson: {
        id: lesson.id,
        type: lesson.lessonType,
        title: lesson.content.title,
        objectives: lesson.content.objectives,
        duration: lesson.content.duration,
        materials: lesson.content.materials,
        studentCount: body.studentIds.length,
        dataConfidence: lesson.dataConfidence,
        worksheets: Array.from(lesson.worksheetIds.entries()).map(([studentId, worksheetId]) => ({
          studentId,
          worksheetId,
          qrCode: lesson.qrCodes.get(studentId)
        })),
        teacherGuidance: {
          overview: lesson.content.teacherGuidance.overview,
          checkInPriorities: lesson.content.teacherGuidance.checkInPriorities,
          differentiationNotes: Array.from(lesson.content.teacherGuidance.differentiationNotes.entries()),
          expectedCompletionTimes: Array.from(lesson.content.teacherGuidance.expectedCompletionTimes.entries()),
          supportLevels: Array.from(lesson.content.teacherGuidance.supportLevels.entries())
        }
      }
    });

  } catch (error: any) {
    console.error('Error generating AI lesson:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate lesson',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Get pending adjustments for the student
    const adjustments = await adjustmentQueue.getStudentAdjustmentSummary(studentId);

    // Get recent lessons for the student
    const { data: recentLessons } = await supabase
      .from('differentiated_lessons')
      .select(`
        *,
        lessons!inner(
          title,
          created_at
        )
      `)
      .contains('student_ids', [studentId])
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      studentId,
      adjustmentSummary: {
        pending: adjustments.pending,
        processed: adjustments.processed,
        bySubject: Array.from(adjustments.bySubject.entries()).map(([subject, data]) => ({
          subject,
          pendingCount: data.pending.length,
          trend: data.trend,
          latestAdjustment: data.pending[0]?.adjustmentType
        })),
        recommendations: adjustments.recommendations
      },
      recentLessons: recentLessons?.map(lesson => ({
        id: lesson.id,
        title: lesson.lessons.title,
        type: lesson.lesson_type,
        createdAt: lesson.lessons.created_at,
        dataConfidence: lesson.data_confidence?.overall || 0
      })) || []
    });

  } catch (error: any) {
    console.error('Error fetching lesson data:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch lesson data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}