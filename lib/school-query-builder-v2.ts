import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Optimized query builder for structured school system
 * All queries use indexed school_id for maximum performance
 */

export class SchoolQueryBuilder {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get students for a specific school
   */
  getStudentsQuery(schoolId: string) {
    return this.supabase
      .from('students')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
  }

  /**
   * Get bell schedules for a specific school
   */
  getBellSchedulesQuery(schoolId: string) {
    return this.supabase
      .from('bell_schedules')
      .select('*')
      .eq('school_id', schoolId)
      .order('start_time', { ascending: true });
  }

  /**
   * Get special activities for a specific school
   */
  getSpecialActivitiesQuery(schoolId: string) {
    return this.supabase
      .from('special_activities')
      .select('*')
      .eq('school_id', schoolId)
      .order('date', { ascending: true });
  }

  /**
   * Get schedule sessions for students in a school
   */
  getScheduleSessionsQuery(schoolId: string, dateRange?: { start: string; end: string }) {
    let query = this.supabase
      .from('schedule_sessions')
      .select(`
        *,
        students!inner(
          id,
          initials,
          grade_level,
          school_id
        )
      `)
      .eq('students.school_id', schoolId);

    if (dateRange) {
      query = query
        .gte('date', dateRange.start)
        .lte('date', dateRange.end);
    }

    return query.order('date', { ascending: true });
  }

  /**
   * Get team members in the same school
   */
  getTeamMembersQuery(userId: string, schoolId: string) {
    return this.supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        display_name,
        role,
        avatar_url,
        grade_level,
        subject,
        bio,
        created_at
      `)
      .eq('school_id', schoolId)
      .neq('id', userId)
      .order('created_at', { ascending: false });
  }

  /**
   * Get comprehensive school data with related counts
   */
  async getSchoolDashboardData(schoolId: string) {
    const [
      { count: studentCount },
      { count: staffCount },
      { count: sessionCount },
      { data: schoolDetails }
    ] = await Promise.all([
      this.supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      
      this.supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      
      this.supabase
        .from('schedule_sessions')
        .select(`
          id,
          students!inner(school_id)
        `, { count: 'exact', head: true })
        .eq('students.school_id', schoolId),
      
      this.supabase
        .from('schools')
        .select(`
          id,
          name,
          nces_id,
          districts!inner(
            id,
            name,
            states!inner(
              id,
              name,
              abbreviation
            )
          )
        `)
        .eq('id', schoolId)
        .single()
    ]);

    return {
      schoolDetails,
      metrics: {
        totalStudents: studentCount || 0,
        totalStaff: staffCount || 0,
        totalSessions: sessionCount || 0,
      }
    };
  }

  /**
   * Batch fetch multiple schools' data
   */
  async batchFetchSchoolData(schoolIds: string[]) {
    if (schoolIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('schools')
      .select(`
        id,
        name,
        nces_id,
        districts!inner(
          id,
          name,
          states!inner(
            id,
            name,
            abbreviation
          )
        )
      `)
      .in('id', schoolIds);

    if (error) {
      console.error('[SchoolQueryBuilder] Batch fetch error:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get activity summary for a school
   */
  async getSchoolActivitySummary(schoolId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await this.supabase
      .from('schedule_sessions')
      .select(`
        id,
        date,
        completed,
        students!inner(school_id)
      `)
      .eq('students.school_id', schoolId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      console.error('[SchoolQueryBuilder] Activity summary error:', error);
      return null;
    }

    const summary = {
      totalSessions: data?.length || 0,
      completedSessions: data?.filter(s => s.completed).length || 0,
      completionRate: 0,
      sessionsByDate: new Map<string, number>()
    };

    if (summary.totalSessions > 0) {
      summary.completionRate = (summary.completedSessions / summary.totalSessions) * 100;
      
      data?.forEach(session => {
        const date = session.date;
        summary.sessionsByDate.set(
          date,
          (summary.sessionsByDate.get(date) || 0) + 1
        );
      });
    }

    return summary;
  }

  /**
   * Search for schools by name or location
   */
  async searchSchools(searchTerm: string, stateId?: string) {
    let query = this.supabase
      .from('schools')
      .select(`
        id,
        name,
        districts!inner(
          id,
          name,
          state_id
        )
      `)
      .ilike('name', `%${searchTerm}%`);

    if (stateId) {
      query = query.eq('districts.state_id', stateId);
    }

    return query.limit(20);
  }
}