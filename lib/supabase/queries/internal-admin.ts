import { createClient } from '@/lib/supabase/client';

/**
 * Check if the current user is a Speddy admin
 */
export async function isSpeddyAdmin(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('profiles')
    .select('is_speddy_admin')
    .eq('id', user.id)
    .single();

  return data?.is_speddy_admin === true;
}

/**
 * Get all states for the dropdown
 */
export async function getAllStates() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('states')
    .select('id, name, full_name')
    .order('name');

  if (error) throw error;
  return data;
}

/**
 * Get districts by state with optional search and pagination
 */
export async function getDistrictsByState(
  stateId: string,
  searchQuery: string = '',
  page: number = 0,
  pageSize: number = 20
) {
  const supabase = createClient();
  const offset = page * pageSize;

  let query = supabase
    .from('districts')
    .select('id, name, city, state_id, phone, website', { count: 'exact' })
    .eq('state_id', stateId);

  if (searchQuery) {
    query = query.ilike('name', `%${searchQuery}%`);
  }

  const { data, count, error } = await query
    .range(offset, offset + pageSize - 1)
    .order('name');

  if (error) throw error;
  return { districts: data, totalCount: count ?? 0 };
}

/**
 * Get all schools in a district
 */
export async function getSchoolsByDistrict(districtId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, city, grade_span_low, grade_span_high, enrollment')
    .eq('district_id', districtId)
    .order('name');

  if (error) throw error;
  return data;
}

/**
 * Get full details for a district
 */
export async function getDistrictDetails(districtId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('districts')
    .select('*, states(name, full_name)')
    .eq('id', districtId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get full details for a school
 */
export async function getSchoolDetails(schoolId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('schools')
    .select('*, districts(id, name, state_id, states(name, full_name))')
    .eq('id', schoolId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Check if an email is already in use
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/**
 * Get existing admins for a district (for display purposes)
 */
export async function getDistrictAdmins(districtId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('admin_permissions')
    .select(`
      id,
      role,
      school_id,
      granted_at,
      profiles:admin_id (
        id,
        email,
        full_name
      )
    `)
    .eq('district_id', districtId);

  if (error) throw error;
  return data;
}

/**
 * Get existing admins for a school
 */
export async function getSchoolAdmins(schoolId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('admin_permissions')
    .select(`
      id,
      role,
      granted_at,
      profiles:admin_id (
        id,
        email,
        full_name
      )
    `)
    .eq('school_id', schoolId)
    .eq('role', 'site_admin');

  if (error) throw error;
  return data;
}
