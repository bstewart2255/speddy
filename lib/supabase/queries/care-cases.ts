import { createClient } from '@/lib/supabase/client';
import type { CareDisposition } from '@/lib/constants/care';

export interface CareCaseWithDetails {
  id: string;
  referral_id: string;
  current_disposition: CareDisposition | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  // Joined referral data
  care_referrals: {
    id: string;
    student_name: string;
    grade: string;
    referral_reason: string;
    category: string | null;
    status: string;
    submitted_at: string;
    school_id: string | null;
    referring_user: {
      id: string;
      full_name: string | null;
    } | null;
  };
  // Assigned user data
  assigned_user?: {
    id: string;
    full_name: string | null;
  } | null;
  // Related data
  care_meeting_notes?: CareMeetingNote[];
  care_action_items?: CareActionItem[];
}

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
 * Get a case by ID with all related data
 */
export async function getCaseWithDetails(caseId: string): Promise<CareCaseWithDetails | null> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_cases')
    .select(`
      *,
      care_referrals!inner(
        id,
        student_name,
        grade,
        referral_reason,
        category,
        status,
        submitted_at,
        school_id,
        referring_user:profiles!referring_user_id(id, full_name)
      ),
      assigned_user:profiles!assigned_to(id, full_name),
      care_meeting_notes(
        *,
        created_by_user:profiles!created_by(id, full_name)
      ),
      care_action_items(
        *,
        assignee:profiles!assignee_id(id, full_name)
      )
    `)
    .eq('id', caseId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching case:', error);
    throw error;
  }

  return data as CareCaseWithDetails;
}

/**
 * Get case by referral ID
 */
export async function getCaseByReferralId(referralId: string): Promise<CareCaseWithDetails | null> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_cases')
    .select(`
      *,
      care_referrals!inner(
        id,
        student_name,
        grade,
        referral_reason,
        category,
        status,
        submitted_at,
        school_id,
        referring_user:profiles!referring_user_id(id, full_name)
      ),
      assigned_user:profiles!assigned_to(id, full_name),
      care_meeting_notes(
        *,
        created_by_user:profiles!created_by(id, full_name)
      ),
      care_action_items(
        *,
        assignee:profiles!assignee_id(id, full_name)
      )
    `)
    .eq('referral_id', referralId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching case by referral:', error);
    throw error;
  }

  return data as CareCaseWithDetails;
}

/**
 * Update a case (disposition, assignment, follow-up date)
 */
export async function updateCase(
  caseId: string,
  updates: {
    current_disposition?: CareDisposition | null;
    assigned_to?: string | null;
    follow_up_date?: string | null;
  }
): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('care_cases')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (error) {
    console.error('Error updating case:', error);
    throw error;
  }

  // If disposition is closed_resolved, also close the referral
  if (updates.current_disposition === 'closed_resolved') {
    // Get the referral_id first
    const { data: caseData } = await supabase
      .from('care_cases')
      .select('referral_id')
      .eq('id', caseId)
      .single();

    if (caseData) {
      await supabase
        .from('care_referrals')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseData.referral_id);
    }
  }
}

/**
 * Create a new case for a referral
 */
export async function createCase(referralId: string): Promise<string> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_cases')
    .insert({
      referral_id: referralId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating case:', error);
    throw error;
  }

  return data.id;
}
