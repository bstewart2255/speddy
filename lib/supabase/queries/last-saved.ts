import { createClient } from '@/lib/supabase/client';
import { type SchoolIdentifier } from '@/lib/school-helpers';

// These are "when did you last save?" probes for the LastSaved badge, and having
// saved nothing yet is the normal starting state. `.single()` asks PostgREST for
// a single-object response, which answers 406 on zero rows, so every provider
// with no rows at a school tripped an error instead of reading "nothing saved"
// (SPE-542). `.maybeSingle()` returns null for zero rows; `.limit(1)` already
// rules out the many-rows case.

export async function getLastSavedBellSchedule(school: SchoolIdentifier | undefined) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !school) return null;

  let query = supabase
    .from('bell_schedules')
    .select('updated_at')
    .eq('provider_id', user.id);

  // Add school filtering
  if (school.school_id) {
    query = query.eq('school_id', school.school_id);
  } else if (school.school_site) {
    query = query.eq('school_site', school.school_site);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.updated_at;
}

export async function getLastSavedSpecialActivity(school: SchoolIdentifier | undefined) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !school) return null;

  let query = supabase
    .from('special_activities')
    .select('updated_at')
    .eq('provider_id', user.id);

  // Add school filtering
  if (school.school_id) {
    query = query.eq('school_id', school.school_id);
  } else if (school.school_site) {
    query = query.eq('school_site', school.school_site);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.updated_at;
}

export async function getLastSavedSchoolHours(school: SchoolIdentifier | undefined) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !school) return null;

  let query = supabase
    .from('school_hours')
    .select('updated_at')
    .eq('provider_id', user.id);

  // Add school filtering - school_hours only has school_site
  if (school.school_site) {
    query = query.eq('school_site', school.school_site);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.updated_at;
}