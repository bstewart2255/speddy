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
  // Initial assessment tracking fields
  ap_received_date: string | null;
  iep_due_date: string | null;
  academic_testing_completed: boolean;
  academic_testing_date: string | null;
  speech_testing_needed: boolean;
  speech_testing_completed: boolean;
  speech_testing_date: string | null;
  psych_testing_completed: boolean;
  psych_testing_date: string | null;
  ot_testing_needed: boolean;
  ot_testing_completed: boolean;
  ot_testing_date: string | null;
  // Joined referral data
  care_referrals: {
    id: string;
    student_name: string;
    grade: string;
    teacher_id: string | null;
    teacher_name: string | null;
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

export interface StatusHistoryEntry {
  id: string;
  case_id: string;
  status: string;
  changed_by: string;
  created_at: string;
  changed_by_user?: {
    id: string;
    full_name: string | null;
  };
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
        teacher_id,
        teacher_name,
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
        teacher_id,
        teacher_name,
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
 * Automatically logs status changes to history
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
    .eq('id', caseId)
    .select('id, referral_id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Case not found');
    }
    console.error('Error updating case:', error);
    throw error;
  }

  // Log status change to history if disposition was updated (and not null/cleared)
  if (updates.current_disposition && updates.current_disposition !== 'move_to_initials') {
    await addStatusHistory(caseId, updates.current_disposition, user.id);
  }
}

export interface AssignableUser {
  id: string;
  full_name: string | null;
  role: string | null;
  type: 'provider' | 'admin';
}

/**
 * Get users who can be assigned to CARE cases at a school
 * Returns providers (specialists) and site admins
 * Uses a SECURITY DEFINER function to bypass RLS on profiles
 */
export async function getAssignableUsers(schoolId: string): Promise<AssignableUser[]> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Use RPC function that bypasses RLS
  const { data, error } = await supabase.rpc('get_care_assignable_users', {
    p_school_id: schoolId,
  });

  if (error) {
    console.error('Error fetching assignable users:', error);
    throw error;
  }

  return (data || []).map((row: { id: string; full_name: string | null; role: string | null; user_type: string }) => ({
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    type: row.user_type as 'provider' | 'admin',
  }));
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

/**
 * Add a status history entry
 * Verifies that the userId matches the authenticated user for security
 */
export async function addStatusHistory(
  caseId: string,
  status: string,
  userId: string
): Promise<void> {
  const supabase = createClient();

  // Verify auth and that userId matches the authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }
  if (user.id !== userId) {
    throw new Error('Cannot add status history for another user');
  }

  const { error } = await supabase
    .from('care_case_status_history')
    .insert({
      case_id: caseId,
      status,
      changed_by: userId,
    });

  if (error) {
    console.error('Error adding status history:', error);
    throw error;
  }
}

/**
 * Get status history for a case
 */
export async function getStatusHistory(caseId: string): Promise<StatusHistoryEntry[]> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_case_status_history')
    .select(`
      *,
      changed_by_user:profiles!changed_by(id, full_name)
    `)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching status history:', error);
    throw error;
  }

  return data as StatusHistoryEntry[];
}

/**
 * Move a case from 'active' to 'initial' stage
 * Clears the current_disposition and updates referral status
 * Includes rollback if any step fails to maintain data consistency
 */
export async function moveToInitialStage(caseId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // 1. Get the case to find the referral_id
  const { data: caseData, error: caseError } = await supabase
    .from('care_cases')
    .select('referral_id')
    .eq('id', caseId)
    .single();

  if (caseError) {
    console.error('Error fetching case:', caseError);
    throw caseError;
  }

  // 2. Update referral status to 'initial'
  const { error: referralError } = await supabase
    .from('care_referrals')
    .update({
      status: 'initial',
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseData.referral_id);

  if (referralError) {
    console.error('Error updating referral status:', referralError);
    throw referralError;
  }

  // 3. Clear the disposition on the case
  const { error: updateError } = await supabase
    .from('care_cases')
    .update({
      current_disposition: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (updateError) {
    console.error('Error clearing case disposition:', updateError);
    // Rollback: revert referral status back to 'active'
    await supabase
      .from('care_referrals')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseData.referral_id);
    throw updateError;
  }

  // 4. Log the stage transition to history (non-critical, don't rollback on failure)
  try {
    await addStatusHistory(caseId, 'Moved to Initial', user.id);
  } catch (historyError) {
    console.warn('Failed to log status history (non-critical):', historyError);
  }
}

/**
 * Close a case - moves from 'active' or 'initial' to 'closed' stage
 * Clears the current_disposition and updates referral status
 * Includes rollback if any step fails to maintain data consistency
 */
export async function closeCase(caseId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // 1. Get the case to find the referral_id and current status
  const { data: caseData, error: caseError } = await supabase
    .from('care_cases')
    .select('referral_id, care_referrals!inner(status)')
    .eq('id', caseId)
    .single();

  if (caseError) {
    console.error('Error fetching case:', caseError);
    throw caseError;
  }

  // Handle both array and single object responses from Supabase
  const referrals = caseData.care_referrals as { status: string } | { status: string }[];
  const previousStatus = Array.isArray(referrals) ? referrals[0]?.status : referrals.status;

  // 2. Update referral status to 'closed'
  const { error: referralError } = await supabase
    .from('care_referrals')
    .update({
      status: 'closed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseData.referral_id);

  if (referralError) {
    console.error('Error updating referral status:', referralError);
    throw referralError;
  }

  // 3. Clear the disposition on the case
  const { error: updateError } = await supabase
    .from('care_cases')
    .update({
      current_disposition: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (updateError) {
    console.error('Error clearing case disposition:', updateError);
    // Rollback: revert referral status back to previous status
    await supabase
      .from('care_referrals')
      .update({
        status: previousStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseData.referral_id);
    throw updateError;
  }

  // 4. Log the stage transition to history (non-critical, don't rollback on failure)
  try {
    await addStatusHistory(caseId, 'Referral Closed', user.id);
  } catch (historyError) {
    console.warn('Failed to log status history (non-critical):', historyError);
  }
}

/**
 * Initial assessment tracking data
 */
export interface InitialAssessmentData {
  ap_received_date?: string | null;
  iep_due_date?: string | null;
  academic_testing_completed?: boolean;
  academic_testing_date?: string | null;
  speech_testing_needed?: boolean;
  speech_testing_completed?: boolean;
  speech_testing_date?: string | null;
  psych_testing_completed?: boolean;
  psych_testing_date?: string | null;
  ot_testing_needed?: boolean;
  ot_testing_completed?: boolean;
  ot_testing_date?: string | null;
}

/**
 * Update initial assessment tracking data for a case
 */
export async function updateInitialAssessment(
  caseId: string,
  data: InitialAssessmentData
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
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (error) {
    console.error('Error updating initial assessment:', error);
    throw error;
  }
}
