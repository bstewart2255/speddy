// Unified API endpoint for JSON-first lesson generation
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { lessonGenerator } from '@/lib/lessons/generator';
import { 
  LessonRequest, 
  StudentProfile, 
  isValidTeacherRole 
} from '@/lib/lessons/schema';
import { withAuth } from '@/lib/api/with-auth';

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      
      // Parse request body
      const body = await req.json();
      
      // Validate request
      const validation = validateRequest(body);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'Invalid request', details: validation.errors },
          { status: 400 }
        );
      }
      
      // Get teacher's role from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      const teacherRole = body.teacherRole || profile?.role || 'resource';
      
      if (!isValidTeacherRole(teacherRole)) {
        return NextResponse.json(
          { error: 'Invalid teacher role', details: `Role "${teacherRole}" is not supported` },
          { status: 400 }
        );
      }
      
      // Fetch student details if IDs are provided
      const students = await enrichStudentData(body.students, supabase);
      
      // Create lesson request
      const lessonRequest: LessonRequest = {
        students,
        teacherRole: teacherRole as LessonRequest['teacherRole'],
        subject: body.subject,
        topic: body.topic,
        duration: body.duration || 30,
        focusSkills: body.focusSkills
      };
      
      // Generate lesson
      console.log('Generating lesson for:', {
        studentCount: students.length,
        role: teacherRole,
        subject: body.subject,
        duration: lessonRequest.duration
      });
      
      const { lesson, validation: lessonValidation } = await lessonGenerator.generateLesson(lessonRequest);
      
      // Save lesson to database
      const savedLesson = await saveLessonToDatabase(
        lesson,
        lessonRequest,
        userId,
        supabase
      );
      
      // Return response
      return NextResponse.json({
        success: true,
        lessonId: savedLesson.id,
        lesson,
        validation: lessonValidation,
        renderUrl: `/api/lessons/${savedLesson.id}/render`
      });
      
    } catch (error) {
      console.error('Lesson generation error:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to generate lesson', 
          details: error instanceof Error ? error.message : 'Unknown error' 
        },
        { status: 500 }
      );
    }
  })(request);
}

/**
 * Validates the incoming request
 */
function validateRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!body.students || !Array.isArray(body.students) || body.students.length === 0) {
    errors.push('Students array is required and must not be empty');
  }
  
  if (!body.subject || typeof body.subject !== 'string') {
    errors.push('Subject is required and must be a string');
  }
  
  // Optional fields validation
  if (body.duration && (typeof body.duration !== 'number' || body.duration < 5 || body.duration > 120)) {
    errors.push('Duration must be a number between 5 and 120 minutes');
  }
  
  if (body.focusSkills && !Array.isArray(body.focusSkills)) {
    errors.push('Focus skills must be an array');
  }
  
  if (body.teacherRole && !isValidTeacherRole(body.teacherRole)) {
    errors.push('Invalid teacher role provided');
  }
  
  // Validate student objects
  if (body.students && Array.isArray(body.students)) {
    body.students.forEach((student: any, index: number) => {
      if (!student.id && !student.studentId) {
        errors.push(`Student ${index + 1} must have an id or studentId`);
      }
      
      if (!student.grade && student.grade !== 0) {
        errors.push(`Student ${index + 1} must have a grade`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Enriches student data with information from the database
 */
async function enrichStudentData(
  students: any[],
  supabase: any
): Promise<StudentProfile[]> {
  // Collect all student IDs for batch query
  const studentIds = students.map(s => s.id || s.studentId);
  
  // Batch fetch all student data in one query
  const { data: studentsData } = await supabase
    .from('students')
    .select('*, student_details(*)')
    .in('id', studentIds);
  
  // Create a map for quick lookup
  const studentDataMap = new Map();
  if (studentsData) {
    studentsData.forEach((sd: any) => {
      studentDataMap.set(sd.id, sd);
    });
  }
  
  const studentProfiles: StudentProfile[] = [];
  
  for (const student of students) {
    const studentId = student.id || student.studentId;
    const studentData = studentDataMap.get(studentId);
    
    let grade = student.grade;
    let readingLevel = student.readingLevel;
    let iepGoals: string[] = [];
    let accommodations: string[] = [];
    
    if (studentData) {
      // Parse grade from database (could be "2nd Grade", "Grade 2", or just "2")
      if (studentData.grade) {
        const gradeMatch = studentData.grade.match(/\d+/);
        if (gradeMatch) {
          grade = parseInt(gradeMatch[0]);
        }
      }
      
      // Get reading level from student_details
      if (studentData.student_details?.reading_level) {
        readingLevel = studentData.student_details.reading_level;
      }
      
      // Parse IEP goals if available
      if (studentData.iep_goals) {
        iepGoals = Array.isArray(studentData.iep_goals) 
          ? studentData.iep_goals 
          : [studentData.iep_goals];
      }
      
      // Parse accommodations if available
      if (studentData.accommodations) {
        accommodations = Array.isArray(studentData.accommodations)
          ? studentData.accommodations
          : studentData.accommodations.split(',').map((a: string) => a.trim());
      }
    }
    
    // Use provided data as fallback/override
    studentProfiles.push({
      id: studentId,
      grade: grade || 3, // Default to grade 3 if not specified
      readingLevel: readingLevel,
      iepGoals: student.iepGoals || iepGoals,
      accommodations: student.accommodations || accommodations
    });
  }
  
  return studentProfiles;
}

/**
 * Saves the generated lesson to the database
 */
async function saveLessonToDatabase(
  lesson: any,
  request: LessonRequest,
  userId: string,
  supabase: any
): Promise<{ id: string }> {
  // Create lesson record
  const { data: lessonRecord, error } = await supabase
    .from('lessons')
    .insert({
      provider_id: userId,
      lesson_type: request.students.length === 1 ? 'individual' : 'group',
      subject: request.subject,
      topic: request.topic || null,
      duration: request.duration,
      content: lesson, // Store entire JSON structure
      student_ids: request.students.map(s => s.id), // This is a text array in the DB
      metadata: {
        teacherRole: request.teacherRole,
        focusSkills: request.focusSkills,
        generatedAt: lesson?.metadata?.generatedAt || new Date().toISOString(),
        modelUsed: lesson?.metadata?.modelUsed || 'unknown',
        validationStatus: lesson?.metadata?.validationStatus || 'passed'
      },
      created_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Error saving lesson to database:', error);
    throw new Error('Failed to save lesson to database');
  }
  
  return lessonRecord;
}