import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { generateExitTicket } from '@/lib/exit-tickets/generator';

export const maxDuration = 60; // 1 minute timeout for generation

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body = await req.json();
      const { studentIds } = body;

      if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return NextResponse.json(
          { error: 'Student IDs are required' },
          { status: 400 }
        );
      }

      if (studentIds.length > 7) {
        return NextResponse.json(
          { error: 'Maximum 7 students allowed per batch' },
          { status: 400 }
        );
      }

      // Get user's profile for context
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, school_id, district_id, state_id')
        .eq('id', userId)
        .single();

      if (!profile) {
        return NextResponse.json(
          { error: 'User profile not found' },
          { status: 404 }
        );
      }

      // Fetch students with their IEP goals and last used index
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select(`
          id,
          initials,
          grade_level,
          school_id,
          student_details!inner(
            iep_goals,
            last_exit_ticket_goal_index
          )
        `)
        .in('id', studentIds)
        .eq('provider_id', userId);

      if (studentsError) {
        console.error('Error fetching students:', studentsError);
        return NextResponse.json(
          { error: 'Failed to fetch student data' },
          { status: 500 }
        );
      }

      if (!students || students.length === 0) {
        return NextResponse.json(
          { error: 'No valid students found' },
          { status: 404 }
        );
      }

      // Generate exit tickets for each student
      const tickets: any[] = [];
      const rotationUpdates: { studentId: string; nextIndex: number }[] = [];
      const failedStudents: string[] = [];

      for (const student of students) {
        const studentDetails = student.student_details as any;
        const iepGoals = studentDetails?.iep_goals || [];

        if (iepGoals.length === 0) {
          console.warn(`Student ${student.id} has no IEP goals, skipping`);
          failedStudents.push(student.initials);
          continue;
        }

        // Calculate the next goal index using rotation
        // Ensure lastIndex is within valid range in case goals were removed
        const lastIndex = studentDetails?.last_exit_ticket_goal_index || 0;
        const currentIndex = Math.min(lastIndex, iepGoals.length - 1);
        const selectedGoal = iepGoals[currentIndex];
        const nextIndex = (currentIndex + 1) % iepGoals.length;

        try {
          // Generate exit ticket content using AI
          const ticketContent = await generateExitTicket({
            studentInitials: student.initials,
            gradeLevel: student.grade_level,
            iepGoal: selectedGoal,
          });

          // Save the exit ticket to database
          const { data: exitTicket, error: ticketError } = await supabase
            .from('exit_tickets')
            .insert({
              provider_id: userId,
              student_id: student.id,
              iep_goal_index: currentIndex,
              iep_goal_text: selectedGoal,
              content: ticketContent,
              school_id: student.school_id || profile.school_id,
              district_id: profile.district_id,
              state_id: profile.state_id,
            })
            .select()
            .single();

          if (ticketError) {
            console.error(`Error saving exit ticket for student ${student.initials}:`, ticketError);
            failedStudents.push(student.initials);
            continue;
          }

          // Prepare rotation update
          rotationUpdates.push({
            studentId: student.id,
            nextIndex: nextIndex,
          });

          tickets.push({
            id: exitTicket.id,
            student_id: student.id,
            student_initials: student.initials,
            student_grade: student.grade_level,
            iep_goal_text: selectedGoal,
            content: ticketContent,
            created_at: exitTicket.created_at,
          });
        } catch (error) {
          console.error(`Error generating ticket for student ${student.initials}:`, error);
          failedStudents.push(student.initials);
          continue;
        }
      }

      // Update rotation indexes for all students
      for (const update of rotationUpdates) {
        await supabase
          .from('student_details')
          .update({ last_exit_ticket_goal_index: update.nextIndex })
          .eq('student_id', update.studentId);
      }

      if (tickets.length === 0) {
        return NextResponse.json(
          { error: 'No exit tickets could be generated. Ensure students have IEP goals.' },
          { status: 400 }
        );
      }

      // Prepare response with any warnings about failed students
      const response: any = {
        success: true,
        tickets: tickets,
        message: `Generated ${tickets.length} exit ticket${tickets.length > 1 ? 's' : ''}`,
      };

      if (failedStudents.length > 0) {
        response.warning = `Could not generate tickets for: ${failedStudents.join(', ')}`;
      }

      return NextResponse.json(response);

    } catch (error: any) {
      console.error('Error in exit ticket generation:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to generate exit tickets' },
        { status: 500 }
      );
    }
  })(request);
}