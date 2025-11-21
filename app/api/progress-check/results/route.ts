import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';

interface QuestionResult {
  iep_goal_index: number;
  question_index: number;
  status: 'correct' | 'incorrect' | 'excluded';
  notes?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body = await req.json();
      const { progress_check_id, results } = body as {
        progress_check_id: string;
        results: QuestionResult[];
      };

      // Validate required fields
      if (!progress_check_id) {
        return NextResponse.json(
          { error: 'Progress check ID is required' },
          { status: 400 }
        );
      }

      if (!results || !Array.isArray(results) || results.length === 0) {
        return NextResponse.json(
          { error: 'Results array is required' },
          { status: 400 }
        );
      }

      // Validate each result
      for (const result of results) {
        if (typeof result.iep_goal_index !== 'number' || typeof result.question_index !== 'number') {
          return NextResponse.json(
            { error: 'Invalid result format: iep_goal_index and question_index are required' },
            { status: 400 }
          );
        }

        if (!['correct', 'incorrect', 'excluded'].includes(result.status)) {
          return NextResponse.json(
            { error: 'Invalid status: must be correct, incorrect, or excluded' },
            { status: 400 }
          );
        }

        // Require notes for incorrect answers
        if (result.status === 'incorrect' && (!result.notes || result.notes.trim() === '')) {
          return NextResponse.json(
            { error: 'Notes are required for incorrect answers' },
            { status: 400 }
          );
        }
      }

      // Fetch the progress check to get student info and content
      const { data: progressCheck, error: checkError } = await supabase
        .from('progress_checks')
        .select('id, student_id, content')
        .eq('id', progress_check_id)
        .single();

      if (checkError || !progressCheck) {
        console.error('Error fetching progress check:', checkError);
        return NextResponse.json(
          { error: 'Progress check not found' },
          { status: 404 }
        );
      }

      // Validate that all questions are graded
      const content = (progressCheck?.content ?? {}) as {
        iepGoals?: Array<{ assessmentItems?: unknown[] }>;
      };

      const expectedKeys = new Set<string>();
      content.iepGoals?.forEach((goal, goalIndex) => {
        goal.assessmentItems?.forEach((_, questionIndex) => {
          expectedKeys.add(`${goalIndex}-${questionIndex}`);
        });
      });

      const submittedKeys = new Set(
        results.map(result => `${result.iep_goal_index}-${result.question_index}`)
      );

      if (
        expectedKeys.size === 0 ||
        submittedKeys.size !== expectedKeys.size ||
        [...expectedKeys].some(key => !submittedKeys.has(key))
      ) {
        return NextResponse.json(
          { error: 'Incomplete grading', details: 'All questions must be graded before saving results.' },
          { status: 400 }
        );
      }

      // Prepare upsert data
      const upsertData = results.map(result => ({
        progress_check_id,
        student_id: progressCheck.student_id,
        iep_goal_index: result.iep_goal_index,
        question_index: result.question_index,
        status: result.status,
        notes: result.notes || null,
        graded_by: userId,
        graded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Upsert all results
      const { data: savedResults, error: resultsError } = await supabase
        .from('progress_check_results')
        .upsert(upsertData, {
          onConflict: 'progress_check_id,iep_goal_index,question_index',
        })
        .select();

      if (resultsError) {
        console.error('Error saving results:', resultsError);
        return NextResponse.json(
          { error: 'Failed to save results', details: resultsError.message },
          { status: 500 }
        );
      }

      // Update completed_at on the progress check
      await supabase
        .from('progress_checks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', progress_check_id);

      return NextResponse.json({
        success: true,
        results: savedResults,
        message: 'Results saved successfully',
      });

    } catch (error: any) {
      console.error('Error in progress check result submission:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to save results' },
        { status: 500 }
      );
    }
  })(request);
}

export async function GET(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const { searchParams } = new URL(req.url);
      const studentId = searchParams.get('student_id');
      const schoolId = searchParams.get('school_id');
      const status = searchParams.get('status'); // 'graded', 'needs_grading', 'discarded', or 'all'

      // Fetch progress checks (optionally filtered by student) with their results
      let query = supabase
        .from('progress_checks')
        .select(`
          id,
          student_id,
          content,
          created_at,
          completed_at,
          discarded_at,
          students!inner (
            school_id
          ),
          progress_check_results (
            id,
            iep_goal_index,
            question_index,
            status,
            notes,
            graded_at,
            graded_by
          )
        `)
        .order('created_at', { ascending: false });

      // Filter by student if provided
      if (studentId) {
        query = query.eq('student_id', studentId);
      }

      // Filter by school if provided (for "All Students" view)
      if (schoolId) {
        query = query.eq('students.school_id', schoolId);
      }

      const { data: checks, error: checksError } = await query;

      if (checksError) {
        console.error('Error fetching progress checks:', checksError);
        return NextResponse.json(
          { error: 'Failed to fetch progress checks', details: checksError.message },
          { status: 500 }
        );
      }

      if (!checks) {
        return NextResponse.json({
          success: true,
          checks: [],
        });
      }

      // Transform results
      const transformedChecks = checks.map(check => {
        const results = Array.isArray(check.progress_check_results)
          ? check.progress_check_results
          : [];

        return {
          id: check.id,
          student_id: check.student_id,
          content: check.content,
          created_at: check.created_at,
          completed_at: check.completed_at,
          discarded_at: check.discarded_at,
          is_graded: Boolean(check.completed_at),
          results,
        };
      });

      // Filter by status if provided
      let filteredChecks = transformedChecks;
      if (status === 'graded') {
        // Only show graded checks that are not discarded
        filteredChecks = transformedChecks.filter(c => c.is_graded && !c.discarded_at);
      } else if (status === 'needs_grading') {
        // Only show ungraded checks that are not discarded
        filteredChecks = transformedChecks.filter(c => !c.is_graded && !c.discarded_at);
      } else if (status === 'discarded') {
        // Only show discarded checks
        filteredChecks = transformedChecks.filter(c => !!c.discarded_at);
      }
      // If status is 'all' or not provided, return all checks including discarded

      return NextResponse.json({
        success: true,
        checks: filteredChecks,
      });

    } catch (error: any) {
      console.error('Error fetching progress check results:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch results' },
        { status: 500 }
      );
    }
  })(request);
}
