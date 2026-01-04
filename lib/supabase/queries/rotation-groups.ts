import { createClient } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

export interface SchoolYearConfig {
  id: string;
  school_id: string;
  start_date: string;
  end_date: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface RotationActivityPair {
  id: string;
  school_id: string;
  activity_type_a: string;
  activity_type_b: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface RotationGroup {
  id: string;
  pair_id: string;
  name: string;
  created_at: string | null;
}

export interface RotationGroupMember {
  id: string;
  group_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string | null;
}

export interface RotationWeekAssignment {
  id: string;
  pair_id: string;
  week_start_date: string;
  group_id: string;
  activity_type: string;
  created_at: string | null;
}

// Extended types with related data
export interface RotationGroupWithMembers extends RotationGroup {
  members: RotationGroupMemberWithTeacher[];
}

export interface RotationGroupMemberWithTeacher extends RotationGroupMember {
  teacher: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface RotationPairWithGroups extends RotationActivityPair {
  groups: RotationGroupWithMembers[];
}

// Input types for creation
export interface CreateRotationPairInput {
  school_id: string;
  activity_type_a: string;
  activity_type_b: string;
}

export interface CreateRotationGroupInput {
  pair_id: string;
  name: string;
}

export interface CreateRotationGroupMemberInput {
  group_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface CreateWeekAssignmentInput {
  pair_id: string;
  week_start_date: string;
  group_id: string;
  activity_type: string;
}

// ============================================================================
// School Year Config
// ============================================================================

/**
 * Get school year configuration for a school.
 * Returns null if no configuration exists.
 */
export async function getSchoolYearConfig(
  schoolId: string
): Promise<SchoolYearConfig | null> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('school_year_config')
    .select('*')
    .eq('school_id', schoolId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching school year config:', error);
    throw error;
  }

  return data || null;
}

/**
 * Create or update school year configuration for a school.
 */
export async function upsertSchoolYearConfig(
  schoolId: string,
  startDate: string,
  endDate: string
): Promise<SchoolYearConfig> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('school_year_config')
    .upsert(
      {
        school_id: schoolId,
        start_date: startDate,
        end_date: endDate,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'school_id',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting school year config:', error);
    throw error;
  }

  return data;
}

// ============================================================================
// Rotation Activity Pairs
// ============================================================================

/**
 * Get all rotation activity pairs for a school.
 */
export async function getRotationPairs(
  schoolId: string
): Promise<RotationActivityPair[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_activity_pairs')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching rotation pairs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get all rotation pairs with their groups and members.
 */
export async function getRotationPairsWithGroups(
  schoolId: string
): Promise<RotationPairWithGroups[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_activity_pairs')
    .select(`
      *,
      rotation_groups (
        *,
        rotation_group_members (
          *,
          teacher:teachers (
            id,
            first_name,
            last_name
          )
        )
      )
    `)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching rotation pairs with groups:', error);
    throw error;
  }

  // Transform the data to match our types
  return (data || []).map((pair) => ({
    ...pair,
    groups: (pair.rotation_groups || []).map((group: RotationGroup & { rotation_group_members: (RotationGroupMember & { teacher: { id: string; first_name: string; last_name: string } })[] }) => ({
      ...group,
      members: (group.rotation_group_members || []).map((member) => ({
        ...member,
        teacher: member.teacher,
      })),
    })),
  }));
}

/**
 * Create a new rotation activity pair.
 */
export async function createRotationPair(
  input: CreateRotationPairInput
): Promise<RotationActivityPair> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_activity_pairs')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error creating rotation pair:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a rotation activity pair and all related data.
 */
export async function deleteRotationPair(pairId: string): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('rotation_activity_pairs')
    .delete()
    .eq('id', pairId);

  if (error) {
    console.error('Error deleting rotation pair:', error);
    throw error;
  }
}

// ============================================================================
// Rotation Groups
// ============================================================================

/**
 * Get all rotation groups for a pair.
 */
export async function getRotationGroups(
  pairId: string
): Promise<RotationGroup[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_groups')
    .select('*')
    .eq('pair_id', pairId)
    .order('name');

  if (error) {
    console.error('Error fetching rotation groups:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a new rotation group.
 */
export async function createRotationGroup(
  input: CreateRotationGroupInput
): Promise<RotationGroup> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_groups')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error creating rotation group:', error);
    throw error;
  }

  return data;
}

/**
 * Update a rotation group name.
 */
export async function updateRotationGroup(
  groupId: string,
  name: string
): Promise<RotationGroup> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_groups')
    .update({ name })
    .eq('id', groupId)
    .select()
    .single();

  if (error) {
    console.error('Error updating rotation group:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a rotation group.
 */
export async function deleteRotationGroup(groupId: string): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('rotation_groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    console.error('Error deleting rotation group:', error);
    throw error;
  }
}

// ============================================================================
// Rotation Group Members
// ============================================================================

/**
 * Get all members of a rotation group.
 */
export async function getRotationGroupMembers(
  groupId: string
): Promise<RotationGroupMemberWithTeacher[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_group_members')
    .select(`
      *,
      teacher:teachers (
        id,
        first_name,
        last_name
      )
    `)
    .eq('group_id', groupId)
    .order('day_of_week')
    .order('start_time');

  if (error) {
    console.error('Error fetching rotation group members:', error);
    throw error;
  }

  return (data || []).map((member) => ({
    ...member,
    teacher: member.teacher,
  }));
}

/**
 * Add a teacher to a rotation group.
 */
export async function addRotationGroupMember(
  input: CreateRotationGroupMemberInput
): Promise<RotationGroupMember> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_group_members')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error adding rotation group member:', error);
    throw error;
  }

  return data;
}

/**
 * Update a rotation group member's schedule.
 */
export async function updateRotationGroupMember(
  memberId: string,
  updates: Partial<Pick<RotationGroupMember, 'day_of_week' | 'start_time' | 'end_time'>>
): Promise<RotationGroupMember> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_group_members')
    .update(updates)
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    console.error('Error updating rotation group member:', error);
    throw error;
  }

  return data;
}

/**
 * Remove a teacher from a rotation group.
 */
export async function removeRotationGroupMember(memberId: string): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('rotation_group_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    console.error('Error removing rotation group member:', error);
    throw error;
  }
}

/**
 * Bulk add members to a rotation group.
 */
export async function bulkAddRotationGroupMembers(
  inputs: CreateRotationGroupMemberInput[]
): Promise<RotationGroupMember[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_group_members')
    .insert(inputs)
    .select();

  if (error) {
    console.error('Error bulk adding rotation group members:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// Rotation Week Assignments
// ============================================================================

/**
 * Get all week assignments for a rotation pair.
 */
export async function getWeekAssignments(
  pairId: string
): Promise<RotationWeekAssignment[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_week_assignments')
    .select('*')
    .eq('pair_id', pairId)
    .order('week_start_date')
    .order('group_id');

  if (error) {
    console.error('Error fetching week assignments:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create or update a week assignment.
 */
export async function upsertWeekAssignment(
  input: CreateWeekAssignmentInput
): Promise<RotationWeekAssignment> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_week_assignments')
    .upsert(input, {
      onConflict: 'pair_id,week_start_date,group_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting week assignment:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a week assignment.
 */
export async function deleteWeekAssignment(assignmentId: string): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('rotation_week_assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) {
    console.error('Error deleting week assignment:', error);
    throw error;
  }
}

/**
 * Delete a week assignment by pair, week, and group.
 */
export async function deleteWeekAssignmentByKey(
  pairId: string,
  weekStartDate: string,
  groupId: string
): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('rotation_week_assignments')
    .delete()
    .eq('pair_id', pairId)
    .eq('week_start_date', weekStartDate)
    .eq('group_id', groupId);

  if (error) {
    console.error('Error deleting week assignment:', error);
    throw error;
  }
}

/**
 * Bulk upsert week assignments.
 */
export async function bulkUpsertWeekAssignments(
  inputs: CreateWeekAssignmentInput[]
): Promise<RotationWeekAssignment[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('rotation_week_assignments')
    .upsert(inputs, {
      onConflict: 'pair_id,week_start_date,group_id',
    })
    .select();

  if (error) {
    console.error('Error bulk upserting week assignments:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the Monday of a given week.
 */
export function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

/**
 * Generate all week start dates between two dates.
 */
export function generateWeekDates(startDate: string, endDate: string): string[] {
  const weeks: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Start from the first Monday on or after startDate
  let current = new Date(start);
  const dayOfWeek = current.getDay();
  if (dayOfWeek !== 1) {
    // Move to next Monday
    const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    current.setDate(current.getDate() + daysToAdd);
  }

  while (current <= end) {
    weeks.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

/**
 * Format a date as "Month Day" (e.g., "Sept 8").
 */
export function formatWeekDate(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Format a week range as "Month Day - Day" (e.g., "Sept 8-12").
 */
export function formatWeekRange(weekStartDate: string): string {
  const start = new Date(weekStartDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 4); // Friday

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

  if (start.getMonth() === end.getMonth()) {
    return `${months[start.getMonth()]} ${start.getDate()}-${end.getDate()}`;
  } else {
    return `${months[start.getMonth()]} ${start.getDate()}-${months[end.getMonth()]} ${end.getDate()}`;
  }
}

/**
 * Get day name from day of week number.
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return days[dayOfWeek] || '';
}

/**
 * Format time from HH:MM:SS to HH:MM AM/PM.
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
