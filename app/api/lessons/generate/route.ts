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

// Debug logging only in development
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

// Metadata capture flags - must be explicitly enabled to capture PII
const CAPTURE_FULL_PROMPTS = process.env.CAPTURE_FULL_PROMPTS === 'true';
const CAPTURE_AI_RAW = process.env.CAPTURE_AI_RAW === 'true';
const SHOULD_CAPTURE_METADATA = CAPTURE_FULL_PROMPTS || CAPTURE_AI_RAW;

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      
      // Log metadata capture status on startup (only in debug mode)
      if (DEBUG && SHOULD_CAPTURE_METADATA) {
        console.log('[DEBUG] Full metadata capture is ENABLED:', {
          CAPTURE_FULL_PROMPTS,
          CAPTURE_AI_RAW
        });
      }
      
      // Parse request body
      const body = await req.json();
      
      // Check if this is a batch request
      if (body.batch && Array.isArray(body.batch)) {
        // Handle batch lesson generation
        if (DEBUG) {
          console.log(`[DEBUG] Processing batch request with ${body.batch.length} lesson groups`);
          // Log only non-sensitive summary data
          console.log(`[DEBUG] Batch request summary:`, body.batch.map((group, i) => ({
            index: i,
            lessonDate: group.lessonDate || 'not-provided',
            timeSlot: group.timeSlot || 'not-provided',
            subject: group.subject || 'not-provided',
            studentCount: group.students?.length || 0,
            hasTeacherRole: !!group.teacherRole
          })));
        }
        
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
            .select('id, grade_level, student_details(iep_goals)')
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
            // Debug logging for each group (no PII)
            if (DEBUG) {
              console.log(`[DEBUG] Processing batch group ${groupIndex}:`, {
                lessonDate: group.lessonDate || 'not-provided',
                timeSlot: group.timeSlot || 'not-provided',
                subject: group.subject || 'not-provided',
                studentCount: group.students?.length || 0,
                duration: group.duration || 30
                // Removed: groupData which contained full student details
              });
            }
            
            // Validate each group request
            const validation = validateRequest(group);
            if (!validation.isValid) {
              if (DEBUG) {
                console.error(`[DEBUG] Validation failed for group ${groupIndex}:`, validation.errors);
              }
              return {
                success: false,
                error: 'Invalid request',
                details: validation.errors,
                group
              };
            }
            
            const teacherRole = group.teacherRole || defaultTeacherRole;
            
            if (!isValidTeacherRole(teacherRole)) {
              if (DEBUG) {
                console.error(`[DEBUG] Invalid teacher role for group ${groupIndex}`);
              }
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
              subjectType: group.subjectType,
              topic: group.topic,
              duration: group.duration || 30,
              focusSkills: group.focusSkills,
              lessonDate: group.lessonDate,
              timeSlot: group.timeSlot
            };
            
            // Debug logging for lesson request (no PII)
            if (DEBUG) {
              console.log(`[DEBUG] Lesson request for group ${groupIndex}:`, {
                lessonDate: lessonRequest.lessonDate || 'not-provided',
                timeSlot: lessonRequest.timeSlot || 'not-provided',
                subject: lessonRequest.subject,
                duration: lessonRequest.duration,
                studentCount: students.length
              });
            }
            
            
            // Generate lesson
            console.log('Generating lesson for group:', {
              studentCount: students.length,
              role: teacherRole,
              subject: group.subject,
              duration: lessonRequest.duration
            });
            
            const { lesson, validation: lessonValidation, metadata: safeMetadata } = await lessonGenerator.generateLesson(lessonRequest);
            
            // Only capture full metadata if explicitly enabled via env flags
            const fullMetadata = SHOULD_CAPTURE_METADATA 
              ? lessonGenerator.getFullMetadataForLogging()
              : null;
            
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
              group
              // Note: renderUrl removed since we're now saving to ai_generated_lessons table
              // and the render endpoint expects lessons table
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
        if (DEBUG) {
          console.log(`[DEBUG] Waiting for ${lessonPromises.length} lesson generation promises...`);
        }
        const results = await Promise.allSettled(lessonPromises);
        if (DEBUG) {
          console.log(`[DEBUG] All promises completed. Processing results...`);
        }
        
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
        subjectType: body.subjectType as 'ela' | 'math',
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
      
      // Only capture full metadata if explicitly enabled via env flags
      const fullMetadataForLogging = SHOULD_CAPTURE_METADATA
        ? lessonGenerator.getFullMetadataForLogging()
        : null;
      
      // Save lesson to database with conditional metadata
      const savedLesson = await saveLessonToDatabase(
        lesson,
        lessonRequest,
        userId,
        supabase,
        fullMetadataForLogging  // May be null if capture is disabled
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

  if (!body.subjectType || !['ela', 'math'].includes(body.subjectType)) {
    errors.push('Subject type is required and must be either "ela" or "math"');
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
    
    // Parse reading level from request (not stored in database currently)
    let readingLevel: number | undefined = 
      typeof student.readingLevel === 'number' 
        ? student.readingLevel
        : undefined;
    
    // Parse IEP goals with robust normalization for all possible data shapes
    let iepGoals: string[] = [];
    
    // First try to get from student request object
    if (student.iepGoals) {
      if (Array.isArray(student.iepGoals)) {
        iepGoals = student.iepGoals.filter(g => typeof g === 'string' && g.trim());
      } else if (typeof student.iepGoals === 'string' && student.iepGoals.trim()) {
        iepGoals = [student.iepGoals];
      }
    } 
    
    // If no IEP goals from request, try to get from database
    if (iepGoals.length === 0 && studentData?.student_details) {
      const details = studentData.student_details;
      
      // Handle student_details being either an object or an array
      const detailsArray = Array.isArray(details) ? details : [details];
      
      // Extract and normalize IEP goals from all detail records
      const allGoals: string[] = [];
      for (const detail of detailsArray) {
        if (detail?.iep_goals) {
          if (Array.isArray(detail.iep_goals)) {
            // It's already an array
            allGoals.push(...detail.iep_goals.filter(g => typeof g === 'string' && g.trim()));
          } else if (typeof detail.iep_goals === 'string' && detail.iep_goals.trim()) {
            // It's a single string - check if it needs splitting (e.g., semicolon-separated)
            if (detail.iep_goals.includes(';')) {
              allGoals.push(...detail.iep_goals.split(';').map(g => g.trim()).filter(Boolean));
            } else {
              allGoals.push(detail.iep_goals);
            }
          }
        }
      }
      
      // Deduplicate goals while preserving order
      iepGoals = [...new Set(allGoals)];
    }
    
    // Parse accommodations (currently not stored in database, only from request)
    const accommodations: string[] = student.accommodations || [];
    
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
    .select('id, grade_level, student_details(iep_goals)')
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
  // Re-read environment flags for metadata capture within function scope
  const CAPTURE_FULL_PROMPTS = process.env.CAPTURE_FULL_PROMPTS === 'true';
  const CAPTURE_AI_RAW = process.env.CAPTURE_AI_RAW === 'true';
  const SHOULD_CAPTURE_METADATA = CAPTURE_FULL_PROMPTS || CAPTURE_AI_RAW;
  // Get current user's school context
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, district_id, state_id')
    .eq('id', userId)
    .single();

  // Prepare the lesson data for insertion
  const lessonDate = request.lessonDate || new Date().toISOString().split('T')[0];
  const timeSlot = request.timeSlot || 'structured';
  
  // Debug logging before database insertion (no PII)
  const DEBUG_LOG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
  if (DEBUG_LOG) {
    const debugData: any = {
      lesson_date: lessonDate,
      time_slot: timeSlot,
      subject: request.subject,
      studentCount: request.students.length,
      hasSchoolContext: !!profile?.school_id,
      hasTeacherRole: !!request.teacherRole,
      metadataCaptureEnabled: SHOULD_CAPTURE_METADATA
    };
    
    // Only log sensitive field status if capture is enabled
    if (SHOULD_CAPTURE_METADATA) {
      debugData.willCapturePrompt = CAPTURE_FULL_PROMPTS && !!generationMetadata?.fullPromptSent;
      debugData.willCaptureResponse = CAPTURE_AI_RAW && !!generationMetadata?.aiRawResponse;
    }
    
    console.log(`[DEBUG] Saving lesson to database:`, debugData);
  }

  // Build the database record for unified lessons table
  const dbRecord: any = {
    provider_id: userId,
    lesson_date: lessonDate,
    time_slot: timeSlot,
    content: lesson, // Store as JSONB, not stringified
    title: lesson?.lesson?.title || request.topic,
    subject: request.subject,
    topic: request.topic,
    duration_minutes: request.duration,
    student_ids: request.students.map(s => s.id),
    student_details: request.students, // Store student info at time of generation
    metadata: {
      session_data: request.students.map(s => ({ student_id: s.id })),
      teacherRole: request.teacherRole,
      focusSkills: request.focusSkills,
      generatedAt: lesson?.metadata?.generatedAt || new Date().toISOString(),
      validationStatus: lesson?.metadata?.validationStatus || 'passed'
    },
    school_id: profile?.school_id || null,
    district_id: profile?.district_id || null,
    state_id: profile?.state_id || null,
    ai_model: generationMetadata?.modelUsed || lesson?.metadata?.modelUsed || null,
    prompt_tokens: generationMetadata?.promptTokens || null,
    completion_tokens: generationMetadata?.completionTokens || null,
    generation_metadata: generationMetadata?.generationMetadata || {
      studentCount: request.students.length,
      generationTimeMs: generationMetadata?.generationTimeMs
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Only include sensitive fields if explicitly enabled via environment flags
  // These use the same flags defined at the top of the file
  if (CAPTURE_FULL_PROMPTS && generationMetadata?.fullPromptSent) {
    dbRecord.ai_prompt = generationMetadata.fullPromptSent;
  } else {
    dbRecord.ai_prompt = null;
  }
  
  if (CAPTURE_AI_RAW && generationMetadata?.aiRawResponse) {
    dbRecord.ai_raw_response = generationMetadata.aiRawResponse;
  } else {
    dbRecord.ai_raw_response = null;
  }
  
  // First check if a lesson already exists for this date/timeslot
  const { data: existingLesson } = await supabase
    .from('lessons')
    .select('id')
    .eq('provider_id', userId)
    .eq('lesson_date', lessonDate)
    .eq('time_slot', timeSlot)
    .single();

  let lessonRecord;
  
  if (existingLesson) {
    // Update existing lesson
    const { data: updatedLesson, error: updateError } = await supabase
      .from('lessons')
      .update({
        ...dbRecord,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingLesson.id)
      .select('id')
      .single();
    
    if (updateError) {
      console.error('Failed to update existing lesson:', updateError);
      throw new Error(`Failed to update existing lesson: ${updateError.message || 'Unknown error'}`);
    }
    
    lessonRecord = updatedLesson;
    
    if (DEBUG_LOG) {
      console.log(`[DEBUG] Updated existing lesson with ID: ${existingLesson.id}`);
    }
  } else {
    // Insert new lesson
    const { data: newLesson, error: insertError } = await supabase
      .from('lessons')
      .insert({
        ...dbRecord,
        lesson_source: 'ai_generated'
      })
      .select('id')
      .single();
    
    if (insertError) {
      if (DEBUG_LOG) {
        console.error(`[DEBUG] Database error when saving lesson:`, {
          errorCode: insertError.code,
          errorMessage: insertError.message,
          constraintName: insertError.constraint || 'unknown',
          attemptedData: {
            lesson_date: lessonDate,
            time_slot: timeSlot,
            subject: request.subject,
            studentCount: request.students.length,
            hasSchoolContext: !!profile?.school_id
          }
        });
      } else {
        console.error('Failed to save lesson to database:', insertError.code);
      }
      
      // Check if it's a duplicate key constraint violation (race condition)
      if (insertError.code === '23505') {
        // Try to fetch the existing lesson that was created in the race condition
        const { data: raceLesson } = await supabase
          .from('lessons')
          .select('id')
          .eq('provider_id', userId)
          .eq('lesson_date', lessonDate)
          .eq('time_slot', timeSlot)
          .single();
        
        if (raceLesson) {
          // Update the lesson that won the race
          const { data: raceUpdate, error: raceUpdateError } = await supabase
            .from('lessons')
            .update({
              ...dbRecord,
              updated_at: new Date().toISOString()
            })
            .eq('id', raceLesson.id)
            .select('id')
            .single();
          
          if (raceUpdateError) {
            throw new Error(`Failed to update lesson after race condition: ${raceUpdateError.message}`);
          }
          
          lessonRecord = raceUpdate;
          if (DEBUG_LOG) {
            console.log(`[DEBUG] Handled race condition, updated lesson with ID: ${raceLesson.id}`);
          }
        } else {
          throw new Error(`Duplicate lesson detected but could not recover: date ${lessonDate}, time slot '${timeSlot}'`);
        }
      } else {
        throw new Error(`Failed to save lesson to database: ${insertError.message || 'Unknown error'}`);
      }
    } else {
      lessonRecord = newLesson;
    }
  }
  
  return lessonRecord;
}