import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';

const studentIdQuerySchema = z.object({
  student_id: z.string().min(1),
});

const idQuerySchema = z.object({
  id: z.string().min(1),
});

const createSchema = z
  .object({
    student_id: z.string().min(1),
    iep_goal_index: z.number().min(0),
    score: z.number().min(0).max(100),
    observation_date: z.string().min(1),
    source: z.string().nullish(),
    notes: z.string().nullish(),
    school_id: z.string().nullish(),
    district_id: z.string().nullish(),
    state_id: z.string().nullish(),
  })
  .passthrough();

const updateSchema = z
  .object({
    id: z.string().min(1),
    iep_goal_index: z.number().min(0).optional(),
    score: z.number().min(0).max(100).optional(),
    observation_date: z.string().optional(),
    source: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .passthrough();

function isFutureDate(observationDate: string): boolean {
  const [year, month, day] = observationDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date > today;
}

// GET: Fetch manual progress for a student
export const GET = withRoute({ query: studentIdQuerySchema }, async ({ query }) => {
  try {
    const supabase = await createClient();
    const studentId = query.student_id;

    // Verify user has access to this student (RLS enforces ownership)
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found or access denied' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('manual_goal_progress')
      .select('*')
      .eq('student_id', studentId)
      .order('observation_date', { ascending: false });

    if (error) {
      console.error('Error fetching manual progress:', error);
      return NextResponse.json({ error: 'Failed to fetch manual progress', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in manual progress GET:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch manual progress' }, { status: 500 });
  }
});

// POST: Create new manual progress entry
export const POST = withRoute({ body: createSchema }, async ({ userId, body }) => {
  try {
    const supabase = await createClient();

    // Validate date is not in the future (parse as local date)
    if (isFutureDate(body.observation_date)) {
      return NextResponse.json({ error: 'observation_date cannot be in the future' }, { status: 400 });
    }

    // Verify user has access to this student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('id', body.student_id)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found or access denied' }, { status: 403 });
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
      return NextResponse.json({ error: 'Failed to create manual progress', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: 'Manual progress created successfully' });
  } catch (error: any) {
    console.error('Error in manual progress POST:', error);
    return NextResponse.json({ error: error.message || 'Failed to create manual progress' }, { status: 500 });
  }
});

// PUT: Update existing manual progress entry
export const PUT = withRoute({ body: updateSchema }, async ({ userId, body }) => {
  try {
    const supabase = await createClient();
    const { id, ...updateData } = body;

    // Validate date if provided (parse as local date)
    if (updateData.observation_date && isFutureDate(updateData.observation_date)) {
      return NextResponse.json({ error: 'observation_date cannot be in the future' }, { status: 400 });
    }

    // Verify ownership before update (RLS will also enforce this)
    const { data: existing, error: fetchError } = await supabase
      .from('manual_goal_progress')
      .select('provider_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Manual progress entry not found' }, { status: 404 });
    }

    if (existing.provider_id !== userId) {
      return NextResponse.json({ error: 'You can only edit your own entries' }, { status: 403 });
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
      return NextResponse.json({ error: 'Failed to update manual progress', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: 'Manual progress updated successfully' });
  } catch (error: any) {
    console.error('Error in manual progress PUT:', error);
    return NextResponse.json({ error: error.message || 'Failed to update manual progress' }, { status: 500 });
  }
});

// DELETE: Remove manual progress entry
export const DELETE = withRoute({ query: idQuerySchema }, async ({ userId, query }) => {
  try {
    const supabase = await createClient();
    const id = query.id;

    // Verify ownership before delete (RLS will also enforce this)
    const { data: existing, error: fetchError } = await supabase
      .from('manual_goal_progress')
      .select('provider_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Manual progress entry not found' }, { status: 404 });
    }

    if (existing.provider_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own entries' }, { status: 403 });
    }

    const { error } = await supabase
      .from('manual_goal_progress')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting manual progress:', error);
      return NextResponse.json({ error: 'Failed to delete manual progress', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Manual progress deleted successfully' });
  } catch (error: any) {
    console.error('Error in manual progress DELETE:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete manual progress' }, { status: 500 });
  }
});
