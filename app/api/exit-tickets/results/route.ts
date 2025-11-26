import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';

interface ProblemResult {
  problem_index: number;
  status: 'correct' | 'incorrect' | 'excluded';
  notes?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body = await req.json();
      const { exit_ticket_id, results } = body as {
        exit_ticket_id: string;
        results: ProblemResult[];
      };

      // Validate required fields
      if (!exit_ticket_id) {
        return NextResponse.json(
          { error: 'Exit ticket ID is required' },
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
        if (typeof result.problem_index !== 'number') {
          return NextResponse.json(
            { error: 'Invalid result format: problem_index is required' },
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

      // Fetch the exit ticket to get student and IEP goal info, including content for problem count
      const { data: exitTicket, error: ticketError } = await supabase
        .from('exit_tickets')
        .select('id, student_id, iep_goal_index, iep_goal_text, content')
        .eq('id', exit_ticket_id)
        .single();

      if (ticketError || !exitTicket) {
        console.error('Error fetching exit ticket:', ticketError);
        return NextResponse.json(
          { error: 'Exit ticket not found' },
          { status: 404 }
        );
      }

      // Validate that all problems are graded
      const content = (exitTicket?.content ?? {}) as {
        problems?: unknown[];
      };
      const expectedProblemCount = content.problems?.length || 0;

      if (expectedProblemCount === 0) {
        return NextResponse.json(
          { error: 'Exit ticket has no problems' },
          { status: 400 }
        );
      }

      const submittedIndices = new Set(results.map(r => r.problem_index));
      const expectedIndices = new Set(Array.from({ length: expectedProblemCount }, (_, i) => i));

      if (submittedIndices.size !== expectedIndices.size ||
          [...expectedIndices].some(i => !submittedIndices.has(i))) {
        return NextResponse.json(
          { error: 'Incomplete grading', details: 'All problems must be graded before saving results.' },
          { status: 400 }
        );
      }

      // Prepare upsert data
      const upsertData = results.map(result => ({
        exit_ticket_id,
        student_id: exitTicket.student_id,
        problem_index: result.problem_index,
        status: result.status,
        notes: result.notes || null,
        graded_by: userId,
        graded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        iep_goal_text: exitTicket.iep_goal_text,
        iep_goal_index: exitTicket.iep_goal_index,
      }));

      // Upsert all results
      const { data: savedResults, error: resultsError } = await supabase
        .from('exit_ticket_results')
        .upsert(upsertData, {
          onConflict: 'exit_ticket_id,problem_index',
        })
        .select();

      if (resultsError) {
        console.error('Error saving results:', resultsError);
        return NextResponse.json(
          { error: 'Failed to save results', details: resultsError.message },
          { status: 500 }
        );
      }

      // Update completed_at on the exit ticket
      await supabase
        .from('exit_tickets')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', exit_ticket_id);

      return NextResponse.json({
        success: true,
        results: savedResults,
        message: 'Results saved successfully',
      });

    } catch (error: any) {
      console.error('Error in exit ticket result submission:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to save result' },
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
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      // If filtering by school, get the student IDs for that school first
      let schoolStudentIds: string[] | null = null;
      if (schoolId && !studentId) {
        const { data: schoolStudents } = await supabase
          .from('students')
          .select('id')
          .eq('school_id', schoolId);
        schoolStudentIds = schoolStudents?.map(s => s.id) || [];
      }

      // Fetch exit tickets (optionally filtered by student) with per-problem results
      let query = supabase
        .from('exit_tickets')
        .select(`
          id,
          student_id,
          iep_goal_index,
          iep_goal_text,
          content,
          created_at,
          completed_at,
          discarded_at,
          exit_ticket_results (
            id,
            problem_index,
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
      } else if (schoolStudentIds && schoolStudentIds.length > 0) {
        // Filter by school's students
        query = query.in('student_id', schoolStudentIds);
      } else if (schoolId && (!schoolStudentIds || schoolStudentIds.length === 0)) {
        // School has no students, return empty
        return NextResponse.json({ success: true, tickets: [] });
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data: tickets, error: ticketsError } = await query;

      if (ticketsError) {
        console.error('Error fetching exit tickets:', ticketsError);
        return NextResponse.json(
          { error: 'Failed to fetch exit tickets', details: ticketsError.message },
          { status: 500 }
        );
      }

      if (!tickets) {
        return NextResponse.json({
          success: true,
          tickets: [],
        });
      }

      // Transform results - now returns array of per-problem results
      const transformedTickets = tickets.map(ticket => {
        const results = Array.isArray(ticket.exit_ticket_results)
          ? ticket.exit_ticket_results
          : [];

        return {
          id: ticket.id,
          student_id: ticket.student_id,
          iep_goal_index: ticket.iep_goal_index,
          iep_goal_text: ticket.iep_goal_text,
          content: ticket.content,
          created_at: ticket.created_at,
          completed_at: ticket.completed_at,
          discarded_at: ticket.discarded_at,
          is_graded: Boolean(ticket.completed_at),
          results,  // Array of per-problem results
        };
      });

      // Filter by status if provided
      let filteredTickets = transformedTickets;
      if (status === 'graded') {
        // Only show graded tickets that are not discarded
        filteredTickets = transformedTickets.filter(t => t.is_graded && !t.discarded_at);
      } else if (status === 'needs_grading') {
        // Only show ungraded tickets that are not discarded
        filteredTickets = transformedTickets.filter(t => !t.is_graded && !t.discarded_at);
      } else if (status === 'discarded') {
        // Only show discarded tickets
        filteredTickets = transformedTickets.filter(t => !!t.discarded_at);
      }
      // If status is 'all' or not provided, return all tickets including discarded

      return NextResponse.json({
        success: true,
        tickets: filteredTickets,
      });

    } catch (error: any) {
      console.error('Error fetching exit ticket results:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch results' },
        { status: 500 }
      );
    }
  })(request);
}
