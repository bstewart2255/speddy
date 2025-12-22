import { createClient } from '@/lib/supabase/client';

export interface CareActionItem {
  id: string;
  case_id: string;
  description: string;
  assignee_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: {
    id: string;
    full_name: string | null;
  } | null;
}

/**
 * Get all action items for a case
 */
export async function getActionItemsForCase(caseId: string): Promise<CareActionItem[]> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_action_items')
    .select(`
      *,
      assignee:profiles!assignee_id(id, full_name)
    `)
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching action items:', error);
    throw error;
  }

  return (data || []) as CareActionItem[];
}

/**
 * Add a new action item to a case
 */
export async function addActionItem(
  caseId: string,
  item: {
    description: string;
    assignee_id?: string | null;
    due_date?: string | null;
  }
): Promise<CareActionItem> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_action_items')
    .insert({
      case_id: caseId,
      description: item.description,
      assignee_id: item.assignee_id || null,
      due_date: item.due_date || null,
    })
    .select(`
      *,
      assignee:profiles!assignee_id(id, full_name)
    `)
    .single();

  if (error) {
    console.error('Error adding action item:', error);
    throw error;
  }

  return data as CareActionItem;
}

/**
 * Mark an action item as complete
 */
export async function completeActionItem(itemId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('care_action_items')
    .update({
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error('Error completing action item:', error);
    throw error;
  }
}

/**
 * Uncomplete an action item
 */
export async function uncompleteActionItem(itemId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('care_action_items')
    .update({
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error('Error uncompleting action item:', error);
    throw error;
  }
}

/**
 * Update an action item
 */
export async function updateActionItem(
  itemId: string,
  updates: {
    description?: string;
    assignee_id?: string | null;
    due_date?: string | null;
  }
): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('care_action_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error('Error updating action item:', error);
    throw error;
  }
}

/**
 * Delete an action item
 */
export async function deleteActionItem(itemId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('care_action_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('Error deleting action item:', error);
    throw error;
  }
}
