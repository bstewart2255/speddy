import { createClient } from '@/lib/supabase/client';
import { Database } from '../../src/types/database';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];

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
  ): Promise<ScheduleSession[]> {
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

    // Get template sessions (where session_date is NULL)
    let templatesQuery = this.supabase
      .from('schedule_sessions')
      .select('*')
      .is('session_date', null);

    // Include templates assigned to this user based on their role
    templatesQuery = this.applyRoleFilter(templatesQuery, providerId, normalizedRole);

    const { data: templates, error: templatesError } = await templatesQuery;

    if (templatesError) {
      console.error('[SessionGenerator] Failed to fetch templates:', templatesError);
      return instances || [];
    }

    if (!templates || templates.length === 0) {
      return instances || [];
    }

    // For each day in range, check if we need to create instances
    const sessions: ScheduleSession[] = instances || [];
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
          // Create instance from template
          const instance: ScheduleSession = {
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