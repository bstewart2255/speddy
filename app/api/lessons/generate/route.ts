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
import { parseGradeLevel } from '@/lib/utils/grade-parser';

export const maxDuration = 120; // 2 minutes timeout for Vercel

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      
      // Parse request body
      const body = await req.json();
      
      // Check if this is a batch request
      if (body.batch && Array.isArray(body.batch)) {
        // Handle batch lesson generation
        console.log(`[DEBUG] Processing batch request with ${body.batch.length} lesson groups at ${new Date().toISOString()}`);
        console.log(`[DEBUG] Batch request summary:`, body.batch.map((group, i) => ({
          index: i,
          lessonDate: group.lessonDate,
          timeSlot: group.timeSlot,
          subject: group.subject,
          studentCount: group.students?.length || 0
        })));
        
        const startTime = Date.now();
        
        // Get teacher's role from profile once
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        
        const defaultTeacherRole = isValidTeacherRole(profile?.role) ? profile.role : 'resource';
        
        // Collect all unique student IDs for batch enrichment
        const allStudentIds = new Set<string>();
        body.batch.forEach((group: any) => {
          if (group.students && Array.isArray(group.students)) {
            group.students.forEach((student: any) => {
              const id = student.id || student.studentId;
              if (id) allStudentIds.add(id);
            });
          }
        });
        
        // Batch fetch all student data
        const studentDataMap = new Map<string, any>();
        if (allStudentIds.size > 0) {
          const { data: studentsData } = await supabase
            .from('students')
            .select('id, grade_level, iep_goals, accommodations, student_details(reading_level)')
            .in('id', Array.from(allStudentIds));
          
          if (studentsData) {
            studentsData.forEach((sd: any) => {
              studentDataMap.set(sd.id, sd);
            });
          }
        }
        
        // Process all lesson requests in parallel
        const lessonPromises = body.batch.map(async (group: any, groupIndex: number) => {
          try {
            // Debug logging for each group in the batch
            console.log(`[DEBUG] Processing batch group ${groupIndex}:`, {
              lessonDate: group.lessonDate,
              timeSlot: group.timeSlot,
              subject: group.subject,
              studentCount: group.students?.length || 0,
              groupData: JSON.stringify(group, null, 2)
            });
            
            // Validate each group request
            const validation = validateRequest(group);
            if (!validation.isValid) {
              console.error(`[DEBUG] Validation failed for group ${groupIndex}:`, validation.errors);
              return {
                success: false,
                error: 'Invalid request',
                details: validation.errors,
                group
              };
            }
            
            const teacherRole = group.teacherRole || defaultTeacherRole;
            
            if (!isValidTeacherRole(teacherRole)) {
              console.error(`[DEBUG] Invalid teacher role for group ${groupIndex}:`, teacherRole);
              return {
                success: false,
                error: 'Invalid teacher role',
                details: `Role "${teacherRole}" is not supported`,
                group
              };
            }
            
            // Enrich student data from cached map
            const students = await enrichStudentDataFromMap(group.students, studentDataMap);
            
            // Create lesson request
            const lessonRequest: LessonRequest = {
              students,
              teacherRole: teacherRole as LessonRequest['teacherRole'],
              subject: group.subject,
              topic: group.topic,
              duration: group.duration || 30,
              focusSkills: group.focusSkills,
              lessonDate: group.lessonDate,
              timeSlot: group.timeSlot
            };
            
            // Debug logging for duplicate key investigation
            console.log(`[DEBUG] Processing batch group ${index}:`, {
              lessonDate: group.lessonDate,
              timeSlot: group.timeSlot,
              subject: group.subject,
              topic: group.topic,
              studentCount: students.length
            });
            
            // Debug logging for lesson request
            console.log(`[DEBUG] Created lesson request for group ${groupIndex}:`, {
              lessonDate: lessonRequest.lessonDate,
              timeSlot: lessonRequest.timeSlot,
              subject: lessonRequest.subject,
              studentCount: students.length,
              duration: lessonRequest.duration
            });
            
            // Generate lesson
            console.log('Generating lesson for group:', {
              studentCount: students.length,
              role: teacherRole,
              subject: group.subject,
              duration: lessonRequest.duration
            });
            
            const { lesson, validation: lessonValidation, metadata: safeMetadata } = await lessonGenerator.generateLesson(lessonRequest);
            
            // Get full metadata for database logging (server-side only)
            const fullMetadata = lessonGenerator.getFullMetadataForLogging();
            
            // Save lesson to database
            const savedLesson = await saveLessonToDatabase(
              lesson,
              lessonRequest,
              userId,
              supabase,
              fullMetadata
            );
            
            return {
              success: true,
              lessonId: savedLesson.id,
              lesson,
              validation: lessonValidation,
              generationMetadata: safeMetadata,
              renderUrl: `/api/lessons/${savedLesson.id}/render`,
              group
            };
          } catch (error) {
            console.error('Error generating lesson for group:', error);
            return {
              success: false,
              error: 'Failed to generate lesson',
              details: error instanceof Error ? error.message : 'Unknown error',
              group
            };
          }
        });
        
        // Wait for all lessons to complete
        console.log(`[DEBUG] Waiting for ${lessonPromises.length} lesson generation promises to complete...`);
        const results = await Promise.allSettled(lessonPromises);
        console.log(`[DEBUG] All lesson generation promises completed. Processing results...`);
        
        const lessons = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              success: false,
              error: 'Generation failed',
              details: result.reason?.message || 'Unknown error',
              group: body.batch[index]
            };
          }
        });
        
        const successful = lessons.filter(l => l.success).length;
        const failed = lessons.length - successful;
        const totalTime = Date.now() - startTime;
        
        console.log(`Batch generation completed: ${successful} succeeded, ${failed} failed in ${totalTime}ms`);
        
        return NextResponse.json({
          success: failed === 0,
          batch: true,
          lessons,
          summary: {
            total: lessons.length,
            successful,
            failed,
            timeMs: totalTime
          }
        });
      }
      
      // Single lesson request (original logic)
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
      
      const { lesson, validation: lessonValidation, metadata: safeMetadata } = await lessonGenerator.generateLesson(lessonRequest);
      
      // Get full metadata for server-side storage only (contains PII)
      const fullMetadataForLogging = lessonGenerator.getFullMetadataForLogging();
      
      // Save lesson to database with full metadata
      const savedLesson = await saveLessonToDatabase(
        lesson,
        lessonRequest,
        userId,
        supabase,
        fullMetadataForLogging  // Use full metadata for database storage
      );
      
      // Return response with only safe metadata
      // Note: renderUrl removed since we're now saving to ai_generated_lessons table
      // and the render endpoint expects lessons table
      return NextResponse.json({
        success: true,
        lessonId: savedLesson.id,
        lesson,
        validation: lessonValidation,
        generationMetadata: safeMetadata  // Only expose safe metadata to client
      });
      
    } catch (error) {
      console.error('Lesson generation error:', error);
      
      // Add timeout handling
      const errorName = (error as any)?.name;
      const errorCode = (error as any)?.code;
      const errorMsg = String((error as any)?.message || '');
      
      if (errorName === 'AbortError' || errorCode === 'ETIMEDOUT' || /timeout/i.test(errorMsg)) {
        return NextResponse.json(
          { 
            error: 'Request timeout', 
            details: 'The lesson generation took too long. Please try with fewer students or shorter duration.' 
          },
          { status: 504 }
        );
      }
      
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
      // Grade is optional - will be enriched from DB or defaulted later
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Enriches student data with information from a pre-fetched map
 */
async function enrichStudentDataFromMap(
  students: any[],
  studentDataMap: Map<string, any>
): Promise<StudentProfile[]> {
  return students.map((student: any) => {
    const studentId = student.id || student.studentId;
    const studentData = studentDataMap.get(studentId);
    
    // Parse grade with support for Kindergarten (grade 0)
    let grade: number | undefined = 
      typeof student.grade === 'number' ? student.grade : undefined;
    if (grade == null && studentData?.grade_level) {
      grade = parseGradeLevel(studentData.grade_level);
    }
    
    // Parse reading level as number when possible
    let readingLevel: number | undefined = 
      typeof student.readingLevel === 'number' 
        ? student.readingLevel
        : studentData?.student_details?.reading_level != null
        ? Number(studentData.student_details.reading_level)
        : undefined;
    if (Number.isNaN(readingLevel)) {
      readingLevel = undefined;
    }
    
    // Parse IEP goals with fallback to database
    const iepGoals: string[] = student.iepGoals ||
      (Array.isArray(studentData?.iep_goals) 
        ? studentData.iep_goals 
        : studentData?.iep_goals 
        ? [studentData.iep_goals] 
        : []);
    
    // Parse accommodations with fallback to database
    const accommodations: string[] = student.accommodations ||
      (Array.isArray(studentData?.accommodations)
        ? studentData.accommodations
        : studentData?.accommodations
        ? String(studentData.accommodations).split(',').map((a: string) => a.trim()).filter(Boolean)
        : []);
    
    return {
      id: studentId,
      grade: grade ?? 3, // Default to grade 3 if not specified
      readingLevel,
      iepGoals,
      accommodations
    } as StudentProfile;
  });
}

/**
 * Enriches student data with information from the database
 */
async function enrichStudentData(
  students: any[],
  supabase: any
): Promise<StudentProfile[]> {
  // Collect all student IDs for batch query, filtering out invalid ones
  const studentIds = students
    .map(s => s.id || s.studentId)
    .filter(Boolean);
  
  // Batch fetch all student data in one query
  const { data: studentsData } = await supabase
    .from('students')
    .select('id, grade_level, iep_goals, accommodations, student_details(reading_level)')
    .in('id', studentIds);
  
  // Create a map for quick lookup
  const studentDataMap = new Map<string, any>();
  if (studentsData) {
    studentsData.forEach((sd: any) => {
      studentDataMap.set(sd.id, sd);
    });
  }
  
  return enrichStudentDataFromMap(students, studentDataMap);
}

/**
 * Saves the generated lesson to the database
 */
async function saveLessonToDatabase(
  lesson: any,
  request: LessonRequest,
  userId: string,
  supabase: any,
  generationMetadata?: any
): Promise<{ id: string }> {
  // Get current user's school context
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, district_id, state_id')
    .eq('id', userId)
    .single();

  // Prepare the lesson data for insertion
  const lessonDate = request.lessonDate || new Date().toISOString().split('T')[0];
  const timeSlot = request.timeSlot || 'structured';
  
  // Debug logging before database insertion
  console.log(`[DEBUG] Saving lesson to database:`, {
    provider_id: userId,
    lesson_date: lessonDate,
    time_slot: timeSlot,
    school_id: profile?.school_id,
    district_id: profile?.district_id,
    state_id: profile?.state_id,
    subject: request.subject,
    topic: request.topic,
    studentCount: request.students.length
  });

  // Save to ai_generated_lessons with full metadata
  const { data: lessonRecord, error } = await supabase
    .from('ai_generated_lessons')
    .insert({
      provider_id: userId,
      lesson_date: lessonDate,
      time_slot: timeSlot, // Use provided time slot or default to 'structured'
      content: JSON.stringify(lesson), // Store entire JSON structure as string
      prompt: request.topic || `${request.duration}-minute ${request.subject} lesson`,
      session_data: request.students.map(s => ({ student_id: s.id })), // Simplified to avoid redundancy
      school_id: profile?.school_id || null,
      district_id: profile?.district_id || null,
      state_id: profile?.state_id || null,
      // Add the new logging fields if metadata is available
      full_prompt_sent: generationMetadata?.fullPromptSent || null,
      ai_raw_response: generationMetadata?.aiRawResponse || null,
      model_used: generationMetadata?.modelUsed || lesson?.metadata?.modelUsed || null,
      prompt_tokens: generationMetadata?.promptTokens || null,
      completion_tokens: generationMetadata?.completionTokens || null,
      generation_metadata: generationMetadata?.generationMetadata || {
        teacherRole: request.teacherRole,
        focusSkills: request.focusSkills,
        studentCount: request.students.length,
        generatedAt: lesson?.metadata?.generatedAt || new Date().toISOString(),
        validationStatus: lesson?.metadata?.validationStatus || 'passed'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
    console.error(`[DEBUG] Database error when saving lesson:`, {
      error,
      errorCode: error.code,
      errorMessage: error.message,
      errorHint: error.hint,
      errorDetails: error.details,
      constraintName: error.constraint || 'unknown',
      attemptedData: {
        provider_id: userId,
        lesson_date: lessonDate,
        time_slot: timeSlot,
        school_id: profile?.school_id,
        subject: request.subject
      }
    });
    
    // Check if it's a duplicate key constraint violation
    if (error.code === '23505' && error.constraint === 'ai_generated_lessons_unique_lesson') {
      throw new Error(`Duplicate lesson detected: A lesson already exists for provider ${userId}, school ${profile?.school_id}, date ${lessonDate}, time slot '${timeSlot}'. Constraint: ${error.constraint}`);
    }
    
    throw new Error(`Failed to save lesson to database: ${error.message || 'Unknown error'}`);
  }
  
  return lessonRecord;
}