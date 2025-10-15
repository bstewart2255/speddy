import { NextRequest, NextResponse } from 'next/server';
import { generateV2Worksheet } from '@/lib/lessons/v2-generator';
import type { V2GenerationRequest } from '@/lib/lessons/v2-generator';
import { createClient } from '@/lib/supabase/server';
import type { Student } from '@/lib/lessons/ability-detector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.topic || !body.subjectType || !body.grade || !body.duration) {
      return NextResponse.json(
        { error: 'Missing required fields: topic, subjectType, grade, duration' },
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

    if (!['K', '1', '2', '3', '4', '5'].includes(body.grade)) {
      return NextResponse.json(
        { error: 'Invalid grade. Must be K-5' },
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
    const validMathTopics = ['computation', 'word-problems', 'mixed-practice'];
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
        console.error('Error fetching students:', studentsError);
      } else if (studentsData) {
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

    // Return successful result
    return NextResponse.json(result);
  } catch (error) {
    console.error('V2 generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
