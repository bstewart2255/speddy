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
      const ticketId = params.id;

      if (!ticketId) {
        return NextResponse.json(
          { error: 'Exit ticket ID is required' },
          { status: 400 }
        );
      }

      // Fetch the current exit ticket to check if it exists and get current discarded_at value
      const { data: existingTicket, error: fetchError } = await supabase
        .from('exit_tickets')
        .select('id, discarded_at, provider_id')
        .eq('id', ticketId)
        .single();

      if (fetchError || !existingTicket) {
        console.error('Error fetching exit ticket:', fetchError);
        return NextResponse.json(
          { error: 'Exit ticket not found' },
          { status: 404 }
        );
      }

      // Verify user has permission to discard this ticket
      // (either they created it, or RLS policies will handle it)

      // Toggle discard status
      const newDiscardedAt = existingTicket.discarded_at ? null : new Date().toISOString();

      const { data: updatedTicket, error: updateError } = await supabase
        .from('exit_tickets')
        .update({ discarded_at: newDiscardedAt })
        .eq('id', ticketId)
        .select('id, discarded_at')
        .single();

      if (updateError) {
        console.error('Error updating exit ticket:', updateError);
        return NextResponse.json(
          { error: 'Failed to update exit ticket', details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        ticket: updatedTicket,
        message: newDiscardedAt ? 'Exit ticket discarded' : 'Exit ticket restored',
      });

    } catch (error: any) {
      console.error('Error toggling exit ticket discard status:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update exit ticket' },
        { status: 500 }
      );
    }
  })(request);
}
