// API endpoint to render lesson worksheets
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { worksheetRenderer } from '@/lib/lessons/renderer';
import { LessonResponse, isValidLessonResponse } from '@/lib/lessons/schema';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const lessonId = params.id;
    
    // Get render type from query params
    const searchParams = request.nextUrl.searchParams;
    const renderType = searchParams.get('type') || 'plan'; // plan, worksheet, answer
    const studentId = searchParams.get('studentId');
    
    // Fetch lesson from database
    const { data: lessonData, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .single();
    
    if (error || !lessonData) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }
    
    // Validate and extract lesson content
    let lesson: LessonResponse | null = null;
    if (lessonData?.content) {
      lesson = lessonData.content as LessonResponse;
    } else if (lessonData?.content_old_text) {
      try {
        const parsed = JSON.parse(lessonData.content_old_text);
        if (isValidLessonResponse(parsed)) lesson = parsed;
      } catch {
        // ignore parse failure
      }
    }
    
    if (!lesson || !isValidLessonResponse(lesson)) {
      return NextResponse.json(
        { error: 'Invalid or missing lesson content' },
        { status: 422 }
      );
    }
    
    // Render based on type
    let html: string;
    
    switch (renderType) {
      case 'worksheet': {
        if (!studentId) {
          return NextResponse.json(
            { error: 'Student ID required for worksheet rendering' },
            { status: 400 }
          );
        }
        
        // Find the student's material
        const studentMaterial = lesson.studentMaterials.find(
          m => m.studentId === studentId
        );
        
        if (!studentMaterial) {
          return NextResponse.json(
            { error: 'No worksheet found for this student' },
            { status: 404 }
          );
        }
        
        // Get student name from database
        const { data: student } = await supabase
          .from('students')
          .select('first_name, last_name, initials')
          .eq('id', studentId)
          .single();
        
        const studentName =
          student?.first_name || student?.last_name
            ? `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim()
            : (student?.initials ?? 'Student');
        
        // Generate QR code for worksheet (using existing system)
        let qrCodeUrl: string | undefined;
        try {
          // Check if we can use the existing QR system
          const { data: worksheetRecord } = await supabase
            .from('worksheets')
            .select('qr_code')
            .eq('lesson_id', lessonId)
            .eq('student_id', studentId)
            .single();
          
          if (worksheetRecord?.qr_code) {
            qrCodeUrl = worksheetRecord.qr_code;
          }
        } catch (qrError) {
          console.log('QR code not available for this worksheet');
        }
        
        html = worksheetRenderer.renderStudentWorksheet(
          studentMaterial,
          studentName,
          qrCodeUrl
        );
        break;
      }
      
      case 'answer': {
        html = worksheetRenderer.renderAnswerKey(lesson);
        break;
      }
      
      case 'plan':
      default: {
        html = worksheetRenderer.renderLessonPlan(lesson);
        break;
      }
    }
    
    // Return HTML response
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
    
  } catch (error) {
    console.error('Render error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to render lesson', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}