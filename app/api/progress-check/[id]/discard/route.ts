import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';

export const PATCH = withRoute<{ id: string }>({}, async ({ params }) => {
  const supabase = await createClient();
  const checkId = params.id;

  // Fetch the current progress check to confirm it exists and read discarded_at
  const { data: existingCheck, error: fetchError } = await supabase
    .from('progress_checks')
    .select('id, discarded_at, provider_id')
    .eq('id', checkId)
    .single();

  if (fetchError || !existingCheck) {
    console.error('Error fetching progress check:', fetchError);
    return NextResponse.json({ error: 'Progress check not found' }, { status: 404 });
  }

  // Toggle discard status (ownership is enforced by RLS).
  const newDiscardedAt = existingCheck.discarded_at ? null : new Date().toISOString();

  const { data: updatedCheck, error: updateError } = await supabase
    .from('progress_checks')
    .update({ discarded_at: newDiscardedAt })
    .eq('id', checkId)
    .select('id, discarded_at')
    .single();

  if (updateError) {
    console.error('Error updating progress check:', updateError);
    return NextResponse.json(
      { error: 'Failed to update progress check', details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    check: updatedCheck,
    message: newDiscardedAt ? 'Progress check discarded' : 'Progress check restored',
  });
});
