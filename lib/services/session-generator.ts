import { createClient } from '@/lib/supabase/client';
import { Database } from '../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];


export class SessionGenerator {
  private supabase = createClient();

  /**
   * Get sessions for a specific date range
   * This will return template sessions (from Main Schedule) if no instances exist
   * Or actual instances if they've been created
   */
  async getSessionsForDateRange(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleSession[]> {
    // First, get all instance sessions (where session_date is NOT NULL)
    const { data: instances } = await this.supabase
      .from('schedule_sessions')
      .select('*')
      .eq('provider_id', providerId)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .lte('session_date', endDate.toISOString().split('T')[0])
      .not('session_date', 'is', null);

    // Get template sessions (where session_date is NULL)
    const { data: templates } = await this.supabase
      .from('schedule_sessions')
      .select('*')
      .eq('provider_id', providerId)
      .is('session_date', null);

    if (!templates || templates.length === 0) {
      return instances || [];
    }

    // For each day in range, check if we need to create instances
    const sessions: ScheduleSession[] = instances || [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay() || 7; // Convert Sunday to 7
      const dateStr = currentDate.toISOString().split('T')[0];

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
      const { data, error } = await this.supabase
        .from('schedule_sessions')
        .insert({
          student_id: session.student_id,
          provider_id: session.provider_id,
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          end_time: session.end_time,
          service_type: session.service_type,
          assigned_to_sea_id: session.assigned_to_sea_id,
          delivered_by: session.delivered_by,
          session_date: session.session_date, // This ensures it's an instance
          completed_at: session.completed_at,
          completed_by: session.completed_by,
          session_notes: session.session_notes
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating session instance:', error);
        return null;
      }

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