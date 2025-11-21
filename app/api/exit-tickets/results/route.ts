import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body = await req.json();
      const { exit_ticket_id, rating, notes } = body;

      // Validate required fields
      if (!exit_ticket_id) {
        return NextResponse.json(
          { error: 'Exit ticket ID is required' },
          { status: 400 }
        );
      }

      if (!rating || rating < 1 || rating > 10) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 10' },
          { status: 400 }
        );
      }

      // Fetch the exit ticket to get student and IEP goal info
      const { data: exitTicket, error: ticketError } = await supabase
        .from('exit_tickets')
        .select('id, student_id, iep_goal_index, iep_goal_text')
        .eq('id', exit_ticket_id)
        .single();

      if (ticketError || !exitTicket) {
        console.error('Error fetching exit ticket:', ticketError);
        return NextResponse.json(
          { error: 'Exit ticket not found' },
          { status: 404 }
        );
      }

      // Check if result already exists (prevent duplicates)
      const { data: existingResult } = await supabase
        .from('exit_ticket_results')
        .select('id')
        .eq('exit_ticket_id', exit_ticket_id)
        .single();

      if (existingResult) {
        // Update existing result
        const { data: updatedResult, error: updateError } = await supabase
          .from('exit_ticket_results')
          .update({
            rating,
            notes: notes || null,
            graded_at: new Date().toISOString(),
          })
          .eq('exit_ticket_id', exit_ticket_id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating result:', updateError);
          return NextResponse.json(
            { error: 'Failed to update result', details: updateError.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          result: updatedResult,
          message: 'Result updated successfully',
        });
      }

      // Create new result
      const { data: result, error: resultError } = await supabase
        .from('exit_ticket_results')
        .insert({
          exit_ticket_id,
          student_id: exitTicket.student_id,
          rating,
          notes: notes || null,
          graded_by: userId,
          iep_goal_text: exitTicket.iep_goal_text,
          iep_goal_index: exitTicket.iep_goal_index,
        })
        .select()
        .single();

      if (resultError) {
        console.error('Error creating result:', resultError);
        return NextResponse.json(
          { error: 'Failed to create result', details: resultError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        result,
        message: 'Result saved successfully',
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

      // Fetch exit tickets (optionally filtered by student)
      let query = supabase
        .from('exit_tickets')
        .select(`
          id,
          student_id,
          iep_goal_index,
          iep_goal_text,
          content,
          created_at,
          discarded_at,
          students!inner (
            school_id
          ),
          exit_ticket_results (
            id,
            rating,
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

      // Transform and filter results based on status
      const transformedTickets = tickets.map(ticket => {
        // Supabase returns an object (not array) when there's a unique constraint
        // and returns null when there's no related row
        // TypeScript infers this as an array, so we handle both cases
        const rawResult = ticket.exit_ticket_results;
        const result = rawResult
          ? (Array.isArray(rawResult) ? rawResult[0] : rawResult)
          : null;

        return {
          id: ticket.id,
          student_id: ticket.student_id,
          iep_goal_index: ticket.iep_goal_index,
          iep_goal_text: ticket.iep_goal_text,
          content: ticket.content,
          created_at: ticket.created_at,
          discarded_at: ticket.discarded_at,
          is_graded: !!result,
          result: result ? {
            id: result.id,
            rating: result.rating,
            notes: result.notes,
            graded_at: result.graded_at,
            graded_by: result.graded_by,
          } : null,
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
