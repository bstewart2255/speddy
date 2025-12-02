import { createClient } from '@/lib/supabase/client';
import { Database } from '../../src/types/database';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];

// Enriched session type with curriculum tracking data from LEFT JOIN
// Supabase returns joined data as an array
export type SessionWithCurriculum = ScheduleSession & {
  curriculum_tracking?: {
    curriculum_type: string;
    curriculum_level: string;
  }[] | null;
};

// Interface for Supabase query builder methods we use
// Note: This is a simplified interface for our specific use case.
// Supabase's actual types use specialized builder classes (PostgrestFilterBuilder, etc.)
// but for method chaining in applyRoleFilter, this abstraction is sufficient.
// Using generic constraint with 'as T' is safer than 'as any' as it preserves the caller's type.
interface SupabaseQueryBuilder {
  or: (filters: string) => SupabaseQueryBuilder;
  eq: (column: string, value: string) => SupabaseQueryBuilder;
}


/**
 * Format a Date object as a local YYYY-MM-DD string
 * Avoids timezone issues with toISOString() which uses UTC
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class SessionGenerator {
  private supabase = createClient();

  /**
   * Apply role-based filters to a Supabase query
   * This adds OR conditions for assigned sessions based on user role
   */
  private applyRoleFilter<T extends SupabaseQueryBuilder>(
    query: T,
    providerId: string,
    normalizedRole: string
  ): T {
    if (isSpecialistSourceRole(normalizedRole)) {
      return query.or(`provider_id.eq.${providerId},assigned_to_specialist_id.eq.${providerId}`) as T;
    } else if (normalizedRole === 'sea') {
      return query.or(`provider_id.eq.${providerId},assigned_to_sea_id.eq.${providerId}`) as T;
    } else {
      return query.eq('provider_id', providerId) as T;
    }
  }

  /**
   * Get sessions for a specific date range
   * This will return template sessions (from Main Schedule) if no instances exist
   * Or actual instances if they've been created
   */
  async getSessionsForDateRange(
    providerId: string,
    startDate: Date,
    endDate: Date,
    userRole?: string
  ): Promise<SessionWithCurriculum[]> {
    // First, get all instance sessions (where session_date is NOT NULL)
    let instancesQuery = this.supabase
      .from('schedule_sessions')
      .select('*')
      .gte('session_date', formatLocalDate(startDate))
      .lte('session_date', formatLocalDate(endDate))
      .not('session_date', 'is', null);

    // Include sessions assigned to this user based on their role
    const normalizedRole = (userRole || '').toLowerCase().trim();
    instancesQuery = this.applyRoleFilter(instancesQuery, providerId, normalizedRole);

    const { data: instances, error: instancesError } = await instancesQuery;

    if (instancesError) {
      console.error('[SessionGenerator] Failed to fetch instances:', instancesError);
      return [];
    }

    // Calculate which days of week we need templates for
    const neededDays = new Set<number>();
    const currentDay = new Date(startDate);
    while (currentDay <= endDate) {
      neededDays.add(currentDay.getDay() || 7); // Convert Sunday (0) to 7
      currentDay.setDate(currentDay.getDate() + 1);
    }

    // Get template sessions (where session_date is NULL)
    // Only fetch templates for days we actually need (performance optimization)
    let templatesQuery = this.supabase
      .from('schedule_sessions')
      .select('*')
      .is('session_date', null)
      .in('day_of_week', Array.from(neededDays));

    // Include templates assigned to this user based on their role
    templatesQuery = this.applyRoleFilter(templatesQuery, providerId, normalizedRole);

    const { data: templates, error: templatesError } = await templatesQuery;

    if (templatesError) {
      console.error('[SessionGenerator] Failed to fetch templates:', templatesError);
      return instances || [];
    }

    if (!templates || templates.length === 0) {
      // No templates found - return all instances as-is
      // We can't determine orphans without templates to compare against
      return instances || [];
    }

    // AUTO-CLEANUP: Detect and remove orphaned instances
    // An instance is orphaned if its start_time doesn't match any template for that student+day
    const orphanedInstanceIds: string[] = [];
    const validInstances: SessionWithCurriculum[] = [];
    const today = formatLocalDate(new Date());

    for (const instance of (instances || [])) {
      // Skip completed instances and past instances - preserve history
      if (instance.completed_at || (instance.session_date && instance.session_date < today)) {
        validInstances.push(instance);
        continue;
      }

      // Check if a matching template exists
      const hasMatchingTemplate = templates.some(t =>
        t.student_id === instance.student_id &&
        t.provider_id === instance.provider_id &&
        t.day_of_week === instance.day_of_week &&
        t.start_time === instance.start_time
      );

      if (hasMatchingTemplate) {
        validInstances.push(instance);
      } else {
        // This is an orphaned instance - mark for deletion
        orphanedInstanceIds.push(instance.id);
        console.log('[SessionGenerator] Detected orphaned instance:', {
          id: instance.id,
          student_id: instance.student_id,
          session_date: instance.session_date,
          start_time: instance.start_time,
          day_of_week: instance.day_of_week
        });
      }
    }

    // Delete orphaned instances asynchronously
    if (orphanedInstanceIds.length > 0) {
      console.log('[SessionGenerator] Cleaning up', orphanedInstanceIds.length, 'orphaned instances');
      this.supabase
        .from('schedule_sessions')
        .delete()
        .in('id', orphanedInstanceIds)
        .then(({ error }) => {
          if (error) {
            console.error('[SessionGenerator] Error deleting orphaned instances:', error);
          } else {
            console.log('[SessionGenerator] Successfully deleted orphaned instances');
          }
        });
    }

    // For each day in range, check if we need to create instances
    const sessions: SessionWithCurriculum[] = validInstances;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay() || 7; // Convert Sunday to 7
      const dateStr = formatLocalDate(currentDate);

      // Find templates for this day
      const dayTemplates = templates.filter(t => t.day_of_week === dayOfWeek);

      for (const template of dayTemplates) {
        // Check if instance already exists
        const existingInstance = sessions.find(s => 
          s.student_id === template.student_id &&
          s.session_date === dateStr &&
          s.start_time === template.start_time
        );

        if (!existingInstance) {
          // Create instance from template (inherit curriculum_tracking from template)
          const instance: SessionWithCurriculum = {
            ...template,
            id: `temp-${Date.now()}-${Math.random()}`, // Temporary ID
            session_date: dateStr,
            created_at: new Date().toISOString()
          };
          sessions.push(instance);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fetch curriculum tracking data separately (no FK relationship exists for implicit joins)
    // Curriculum can be linked via session_id (individual) or group_id (group sessions)
    const sessionIds = sessions.map(s => s.id).filter(id => !id.startsWith('temp-'));
    const groupIds = sessions.map(s => s.group_id).filter((id): id is string => id !== null && id !== undefined);

    // Only fetch if we have IDs to look up
    if (sessionIds.length > 0 || groupIds.length > 0) {
      // Build OR query for session_id and group_id
      let curriculumQuery = this.supabase
        .from('curriculum_tracking')
        .select('session_id, group_id, curriculum_type, curriculum_level');

      if (sessionIds.length > 0 && groupIds.length > 0) {
        // Both individual and group sessions
        curriculumQuery = curriculumQuery.or(`session_id.in.(${sessionIds.join(',')}),group_id.in.(${groupIds.join(',')})`);
      } else if (sessionIds.length > 0) {
        curriculumQuery = curriculumQuery.in('session_id', sessionIds);
      } else if (groupIds.length > 0) {
        curriculumQuery = curriculumQuery.in('group_id', groupIds);
      }

      const { data: curriculumData, error: curriculumError } = await curriculumQuery;

      if (curriculumError) {
        console.error('[SessionGenerator] Failed to fetch curriculum tracking:', curriculumError);
      } else if (curriculumData && curriculumData.length > 0) {
        // Create lookup maps for efficient merging
        const curriculumBySessionId = new Map<string, { curriculum_type: string; curriculum_level: string }[]>();
        const curriculumByGroupId = new Map<string, { curriculum_type: string; curriculum_level: string }[]>();

        for (const ct of curriculumData) {
          const entry = { curriculum_type: ct.curriculum_type, curriculum_level: ct.curriculum_level };
          if (ct.session_id) {
            const existing = curriculumBySessionId.get(ct.session_id) || [];
            existing.push(entry);
            curriculumBySessionId.set(ct.session_id, existing);
          }
          if (ct.group_id) {
            const existing = curriculumByGroupId.get(ct.group_id) || [];
            existing.push(entry);
            curriculumByGroupId.set(ct.group_id, existing);
          }
        }

        // Merge curriculum data into sessions
        for (const session of sessions) {
          // Check group_id first (for group sessions), then session_id (for individual)
          if (session.group_id && curriculumByGroupId.has(session.group_id)) {
            session.curriculum_tracking = curriculumByGroupId.get(session.group_id);
          } else if (!session.id.startsWith('temp-') && curriculumBySessionId.has(session.id)) {
            session.curriculum_tracking = curriculumBySessionId.get(session.id);
          }
        }
      }
    }

    return sessions;
  }

  /**
   * Save session instances that were generated
   * This is called when user makes changes (completes, adds notes, etc)
   */
  async saveSessionInstance(session: ScheduleSession): Promise<ScheduleSession | null> {
    // NEVER modify a template (session without session_date)
    if (!session.session_date) {
      console.error('Cannot save instance without session_date');
      return null;
    }

    // If this is a temporary instance, create it in the database
    if (session.id.startsWith('temp-')) {
      const insertData: ScheduleSessionInsert = {
        student_id: session.student_id,
        provider_id: session.provider_id,
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        service_type: session.service_type,
        assigned_to_sea_id: session.assigned_to_sea_id,
        assigned_to_specialist_id: session.assigned_to_specialist_id,
        delivered_by: session.delivered_by,
        session_date: session.session_date, // This ensures it's an instance
        completed_at: session.completed_at,
        completed_by: session.completed_by,
        session_notes: session.session_notes,
        group_id: session.group_id || null,
        group_name: session.group_name || null
      };

      console.log('Inserting session instance:', insertData);

      const { data, error } = await this.supabase
        .from('schedule_sessions')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating session instance:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return null;
      }

      console.log('Successfully created session instance:', data);
      return data;
    }

    // Otherwise update existing instance (ONLY if it has a session_date)
    const { data, error } = await this.supabase
      .from('schedule_sessions')
      .update({
        completed_at: session.completed_at,
        completed_by: session.completed_by,
        session_notes: session.session_notes,
        // Don't update structural fields for instances
      })
      .eq('id', session.id)
      .not('session_date', 'is', null) // IMPORTANT: Only update instances
      .select()
      .single();

    if (error) {
      console.error('Error updating session instance:', error);
      return null;
    }

    return data;
  }
}