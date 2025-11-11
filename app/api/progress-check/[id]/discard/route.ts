import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const checkId = params.id;

      if (!checkId) {
        return NextResponse.json(
          { error: 'Progress check ID is required' },
          { status: 400 }
        );
      }

      // Fetch the current progress check to check if it exists and get current discarded_at value
      const { data: existingCheck, error: fetchError } = await supabase
        .from('progress_checks')
        .select('id, discarded_at, provider_id')
        .eq('id', checkId)
        .single();

      if (fetchError || !existingCheck) {
        console.error('Error fetching progress check:', fetchError);
        return NextResponse.json(
          { error: 'Progress check not found' },
          { status: 404 }
        );
      }

      // Verify user has permission to discard this check
      // (either they created it, or RLS policies will handle it)

      // Toggle discard status
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

    } catch (error: any) {
      console.error('Error toggling progress check discard status:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update progress check' },
        { status: 500 }
      );
    }
  })(request);
}
