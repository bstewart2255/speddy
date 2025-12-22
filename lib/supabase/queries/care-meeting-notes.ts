import { createClient } from '@/lib/supabase/client';

export interface CareMeetingNote {
  id: string;
  case_id: string;
  note_text: string;
  created_by: string;
  created_at: string;
  created_by_user?: {
    id: string;
    full_name: string | null;
  };
}

/**
 * Get all notes for a case
 */
export async function getNotesForCase(caseId: string): Promise<CareMeetingNote[]> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_meeting_notes')
    .select(`
      *,
      created_by_user:profiles!created_by(id, full_name)
    `)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notes:', error);
    throw error;
  }

  return (data || []) as CareMeetingNote[];
}

/**
 * Add a new note to a case
 */
export async function addNote(caseId: string, noteText: string): Promise<CareMeetingNote> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_meeting_notes')
    .insert({
      case_id: caseId,
      note_text: noteText,
      created_by: user.id,
    })
    .select(`
      *,
      created_by_user:profiles!created_by(id, full_name)
    `)
    .single();

  if (error) {
    console.error('Error adding note:', error);
    throw error;
  }

  return data as CareMeetingNote;
}

/**
 * Delete a note (only by creator)
 */
export async function deleteNote(noteId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // RLS will enforce that only the creator can delete
  const { error } = await supabase
    .from('care_meeting_notes')
    .delete()
    .eq('id', noteId)
    .eq('created_by', user.id);

  if (error) {
    console.error('Error deleting note:', error);
    throw error;
  }
}
