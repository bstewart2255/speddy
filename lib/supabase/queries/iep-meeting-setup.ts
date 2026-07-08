import { createClient } from '@/lib/supabase/client';
import type {
  Database,
  SiteMeetingRules,
  TeacherAvailabilityPref,
} from '@/src/types';
import type { Json } from '@/src/types/database';

export interface MeetingWindow {
  day_of_week: number; // 1 = Monday … 5 = Friday
  start_time: string; // 'HH:MM'
  end_time: string; // 'HH:MM'
}

export interface BlackoutRange {
  start_date: string; // 'YYYY-MM-DD'
  end_date: string; // 'YYYY-MM-DD'
  label: string;
}

export async function getSiteMeetingRules(
  schoolId: string
): Promise<SiteMeetingRules | null> {
  const supabase = createClient<Database>();
  const { data, error } = await supabase
    .from('site_meeting_rules')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching site meeting rules:', error);
    throw error;
  }
  return data;
}

export async function upsertSiteMeetingRules(
  schoolId: string,
  updates: {
    allowed_windows: MeetingWindow[];
    blackout_ranges: BlackoutRange[];
    rooms: string[] | null;
    max_meetings_per_day: number | null;
    external_iep_calendar_id: string | null;
  }
): Promise<SiteMeetingRules> {
  const supabase = createClient<Database>();
  const { data, error } = await supabase
    .from('site_meeting_rules')
    .upsert(
      {
        school_id: schoolId,
        allowed_windows: updates.allowed_windows as unknown as Json,
        blackout_ranges: updates.blackout_ranges as unknown as Json,
        rooms: updates.rooms,
        max_meetings_per_day: updates.max_meetings_per_day,
        external_iep_calendar_id: updates.external_iep_calendar_id,
      },
      { onConflict: 'school_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error saving site meeting rules:', error);
    throw error;
  }
  return data;
}

export async function getMyTeacherAvailabilityPref(
  schoolYear: string
): Promise<TeacherAvailabilityPref | null> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('teacher_availability_prefs')
    .select('*')
    .eq('profile_id', user.id)
    .eq('school_year', schoolYear)
    .maybeSingle();

  if (error) {
    console.error('Error fetching teacher availability pref:', error);
    throw error;
  }
  return data;
}

export async function upsertMyTeacherAvailabilityPref(pref: {
  school_year: string;
  meeting_time_preference: 'before_school' | 'after_school' | 'prep' | 'any';
  prep_start: string | null; // 'HH:MM'
  prep_end: string | null;
  prep_description: string | null;
}): Promise<TeacherAvailabilityPref> {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // school_id denormalized from the teacher's own profile for RLS reads
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    // Without school_id the pref would be invisible to organizers' scoped reads
    console.error('Error fetching profile for availability pref:', profileError);
    throw profileError;
  }

  const { data, error } = await supabase
    .from('teacher_availability_prefs')
    .upsert(
      {
        profile_id: user.id,
        school_id: profile?.school_id ?? null,
        school_year: pref.school_year,
        meeting_time_preference: pref.meeting_time_preference,
        prep_start: pref.prep_start,
        prep_end: pref.prep_end,
        prep_description: pref.prep_description,
      },
      { onConflict: 'profile_id,school_year' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error saving teacher availability pref:', error);
    throw error;
  }
  return data;
}
