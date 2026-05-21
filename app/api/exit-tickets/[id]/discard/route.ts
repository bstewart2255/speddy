import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';

export const PATCH = withRoute<{ id: string }>({}, async ({ params }) => {
  const supabase = await createClient();
  const ticketId = params.id;

  // Fetch the current exit ticket to check it exists and read its discarded_at value
  const { data: existingTicket, error: fetchError } = await supabase
    .from('exit_tickets')
    .select('id, discarded_at, provider_id')
    .eq('id', ticketId)
    .single();

  if (fetchError || !existingTicket) {
    console.error('Error fetching exit ticket:', fetchError);
    return NextResponse.json({ error: 'Exit ticket not found' }, { status: 404 });
  }

  // Toggle discard status (ownership is enforced by RLS).
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
});
