import { createClient } from '@/lib/supabase/client';
import type { CareCategory, CareStatus } from '@/lib/constants/care';

export interface CareReferral {
  id: string;
  student_name: string;
  grade: string;
  teacher_id: string | null;
  teacher_name: string | null;
  referring_user_id: string;
  referral_reason: string;
  category: CareCategory | null;
  school_id: string | null;
  district_id: string | null;
  state_id: string | null;
  status: CareStatus;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined data
  referring_user?: {
    id: string;
    full_name: string | null;
  };
  care_cases?: CareCase[];
}

export interface CareCase {
  id: string;
  referral_id: string;
  current_disposition: string | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all CARE referrals for a school, optionally filtered by status
 */
export async function getCareReferrals(
  schoolId: string,
  status?: CareStatus
): Promise<CareReferral[]> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  let query = supabase
    .from('care_referrals')
    .select(`
      *,
      referring_user:profiles!referring_user_id(id, full_name),
      care_cases(*)
    `)
    .eq('school_id', schoolId)
    .is('deleted_at', null);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('submitted_at', { ascending: false });

  if (error) {
    console.error('Error fetching CARE referrals:', error);
    throw error;
  }

  return (data || []) as CareReferral[];
}

/**
 * Add a new CARE referral
 */
export async function addCareReferral(referral: {
  student_name: string;
  grade: string;
  teacher_id?: string;
  teacher_name?: string;
  referral_reason: string;
  category?: CareCategory;
  school_id: string;
  district_id?: string;
  state_id?: string;
}): Promise<CareReferral> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_referrals')
    .insert({
      ...referral,
      referring_user_id: user.id,
      status: 'pending',
    })
    .select(`
      *,
      referring_user:profiles!referring_user_id(id, full_name),
      care_cases(*)
    `)
    .single();

  if (error) {
    console.error('Error adding CARE referral:', error);
    throw error;
  }

  return data as CareReferral;
}

/**
 * Update referral status and optionally create a case
 */
export async function updateReferralStatus(
  referralId: string,
  status: CareStatus
): Promise<CareReferral> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Update referral status
  const { data: referral, error } = await supabase
    .from('care_referrals')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', referralId)
    .is('deleted_at', null)
    .select(`
      *,
      referring_user:profiles!referring_user_id(id, full_name),
      care_cases(*)
    `)
    .single();

  if (error) {
    console.error('Error updating referral status:', error);
    throw error;
  }

  // If status changed to 'active' and no case exists, create one
  if (status === 'active' && (!referral.care_cases || referral.care_cases.length === 0)) {
    const { error: caseError } = await supabase
      .from('care_cases')
      .insert({
        referral_id: referralId,
      });

    if (caseError) {
      // Handle race condition: if unique constraint violation (23505),
      // another user already created the case - this is OK
      if (caseError.code === '23505') {
        console.log('Case already exists for referral (created by concurrent request)');
      } else {
        console.error('Error creating case:', caseError);
        // Don't throw - the referral was updated successfully
      }
    }

    // Refetch to get the case data (whether we created it or someone else did)
    const { data: updatedReferral } = await supabase
      .from('care_referrals')
      .select(`
        *,
        referring_user:profiles!referring_user_id(id, full_name),
        care_cases(*)
      `)
      .eq('id', referralId)
      .single();

    if (updatedReferral) {
      return updatedReferral as CareReferral;
    }
  }

  return referral as CareReferral;
}

/**
 * Soft delete a referral
 */
export async function softDeleteReferral(referralId: string): Promise<void> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('care_referrals')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', referralId)
    .is('deleted_at', null);

  if (error) {
    console.error('Error soft-deleting referral:', error);
    throw error;
  }
}

/**
 * Get a single referral by ID with full details
 */
export async function getReferralById(referralId: string): Promise<CareReferral | null> {
  const supabase = createClient();

  // Verify auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('care_referrals')
    .select(`
      *,
      referring_user:profiles!referring_user_id(id, full_name),
      care_cases(*)
    `)
    .eq('id', referralId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching referral:', error);
    throw error;
  }

  return data as CareReferral;
}
