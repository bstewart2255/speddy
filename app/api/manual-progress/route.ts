import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';

interface ManualProgressBody {
  student_id: string;
  iep_goal_index: number;
  score: number;
  observation_date: string;
  source?: string;
  notes?: string;
  school_id?: string;
  district_id?: string;
  state_id?: string;
}

// GET: Fetch manual progress for a student
export async function GET(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const { searchParams } = new URL(req.url);
      const studentId = searchParams.get('student_id');

      if (!studentId) {
        return NextResponse.json(
          { error: 'student_id is required' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('manual_goal_progress')
        .select('*')
        .eq('student_id', studentId)
        .order('observation_date', { ascending: false });

      if (error) {
        console.error('Error fetching manual progress:', error);
        return NextResponse.json(
          { error: 'Failed to fetch manual progress', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: data || [],
      });
    } catch (error: any) {
      console.error('Error in manual progress GET:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch manual progress' },
        { status: 500 }
      );
    }
  })(request);
}

// POST: Create new manual progress entry
export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body: ManualProgressBody = await req.json();

      // Validate required fields
      if (!body.student_id) {
        return NextResponse.json(
          { error: 'student_id is required' },
          { status: 400 }
        );
      }

      if (typeof body.iep_goal_index !== 'number' || body.iep_goal_index < 0) {
        return NextResponse.json(
          { error: 'iep_goal_index must be a non-negative number' },
          { status: 400 }
        );
      }

      if (typeof body.score !== 'number' || body.score < 0 || body.score > 100) {
        return NextResponse.json(
          { error: 'score must be a number between 0 and 100' },
          { status: 400 }
        );
      }

      if (!body.observation_date) {
        return NextResponse.json(
          { error: 'observation_date is required' },
          { status: 400 }
        );
      }

      // Validate date is not in the future
      const observationDate = new Date(body.observation_date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (observationDate > today) {
        return NextResponse.json(
          { error: 'observation_date cannot be in the future' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('manual_goal_progress')
        .insert({
          student_id: body.student_id,
          provider_id: userId,
          iep_goal_index: body.iep_goal_index,
          score: body.score,
          observation_date: body.observation_date,
          source: body.source || null,
          notes: body.notes || null,
          school_id: body.school_id || null,
          district_id: body.district_id || null,
          state_id: body.state_id || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating manual progress:', error);
        return NextResponse.json(
          { error: 'Failed to create manual progress', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data,
        message: 'Manual progress created successfully',
      });
    } catch (error: any) {
      console.error('Error in manual progress POST:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create manual progress' },
        { status: 500 }
      );
    }
  })(request);
}

// PUT: Update existing manual progress entry
export async function PUT(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body = await req.json();
      const { id, ...updateData } = body as ManualProgressBody & { id: string };

      if (!id) {
        return NextResponse.json(
          { error: 'id is required for update' },
          { status: 400 }
        );
      }

      // Validate score if provided
      if (updateData.score !== undefined) {
        if (typeof updateData.score !== 'number' || updateData.score < 0 || updateData.score > 100) {
          return NextResponse.json(
            { error: 'score must be a number between 0 and 100' },
            { status: 400 }
          );
        }
      }

      // Validate iep_goal_index if provided
      if (updateData.iep_goal_index !== undefined) {
        if (typeof updateData.iep_goal_index !== 'number' || updateData.iep_goal_index < 0) {
          return NextResponse.json(
            { error: 'iep_goal_index must be a non-negative number' },
            { status: 400 }
          );
        }
      }

      // Validate date if provided
      if (updateData.observation_date) {
        const observationDate = new Date(updateData.observation_date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (observationDate > today) {
          return NextResponse.json(
            { error: 'observation_date cannot be in the future' },
            { status: 400 }
          );
        }
      }

      // Verify ownership before update (RLS will also enforce this)
      const { data: existing, error: fetchError } = await supabase
        .from('manual_goal_progress')
        .select('provider_id')
        .eq('id', id)
        .single();

      if (fetchError || !existing) {
        return NextResponse.json(
          { error: 'Manual progress entry not found' },
          { status: 404 }
        );
      }

      if (existing.provider_id !== userId) {
        return NextResponse.json(
          { error: 'You can only edit your own entries' },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from('manual_goal_progress')
        .update({
          ...(updateData.iep_goal_index !== undefined && { iep_goal_index: updateData.iep_goal_index }),
          ...(updateData.score !== undefined && { score: updateData.score }),
          ...(updateData.observation_date && { observation_date: updateData.observation_date }),
          ...(updateData.source !== undefined && { source: updateData.source || null }),
          ...(updateData.notes !== undefined && { notes: updateData.notes || null }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating manual progress:', error);
        return NextResponse.json(
          { error: 'Failed to update manual progress', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data,
        message: 'Manual progress updated successfully',
      });
    } catch (error: any) {
      console.error('Error in manual progress PUT:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update manual progress' },
        { status: 500 }
      );
    }
  })(request);
}

// DELETE: Remove manual progress entry
export async function DELETE(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json(
          { error: 'id is required' },
          { status: 400 }
        );
      }

      // Verify ownership before delete (RLS will also enforce this)
      const { data: existing, error: fetchError } = await supabase
        .from('manual_goal_progress')
        .select('provider_id')
        .eq('id', id)
        .single();

      if (fetchError || !existing) {
        return NextResponse.json(
          { error: 'Manual progress entry not found' },
          { status: 404 }
        );
      }

      if (existing.provider_id !== userId) {
        return NextResponse.json(
          { error: 'You can only delete your own entries' },
          { status: 403 }
        );
      }

      const { error } = await supabase
        .from('manual_goal_progress')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting manual progress:', error);
        return NextResponse.json(
          { error: 'Failed to delete manual progress', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Manual progress deleted successfully',
      });
    } catch (error: any) {
      console.error('Error in manual progress DELETE:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to delete manual progress' },
        { status: 500 }
      );
    }
  })(request);
}
