// app/api/ai-upload/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { 
  dedupeSpecialActivities, 
  dedupeBellSchedules,
  normalizeSpecialActivity,
  normalizeBellSchedule,
  createImportSummary,
  type ImportSummary
} from '@/lib/utils/dedupe-helpers';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uploadType, confirmedData } = await request.json();

    if (!uploadType || !confirmedData || !Array.isArray(confirmedData)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Get user's school information including school_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_site, school_district, school_id')
      .eq('id', user.id)
      .single();

    const summary = createImportSummary();
    summary.total = confirmedData.length;

    // Process based on upload type
    if (uploadType === 'students') {
      for (const student of confirmedData) {
        try {
          const { error } = await supabase
            .from('students')
            .insert({
              provider_id: user.id,
              initials: student.initials.toUpperCase(),
              grade_level: student.grade_level.toUpperCase(),
              teacher_name: student.teacher_name,
              sessions_per_week: student.sessions_per_week,
              minutes_per_session: student.minutes_per_session,
              school_site: profile?.school_site || '',
              school_district: profile?.school_district || '',
              school_id: profile?.school_id
            });

          if (error) {
            summary.errors.push({
              item: student,
              error: error.message
            });
          } else {
            summary.inserted++;
          }
        } catch (err: any) {
          summary.errors.push({
            item: student,
            error: err.message || 'Unexpected error'
          });
        }
      }
    } else if (uploadType === 'bell_schedule') {
      // Expand schedules for all days and deduplicate
      const expandedSchedules: any[] = [];
      for (const schedule of confirmedData) {
        const days = schedule.days || [1, 2, 3, 4, 5];
        for (const day of days) {
          expandedSchedules.push({
            ...schedule,
            day_of_week: day
          });
        }
      }
      
      // Deduplicate bell schedules
      const dedupedSchedules = dedupeBellSchedules(expandedSchedules);
      
      // Process in a transaction
      const { data: existingSchedules } = await supabase
        .from('bell_schedules')
        .select('*')
        .eq('provider_id', user.id)
        .eq('school_id', profile?.school_id);
      
      // Create a map of existing schedules by normalized key
      const existingMap = new Map();
      if (existingSchedules) {
        for (const schedule of existingSchedules) {
          const normalized = normalizeBellSchedule(schedule);
          existingMap.set(normalized.normalized_key, schedule.id);
        }
      }
      
      // Process deduplicated schedules
      for (const schedule of dedupedSchedules) {
        try {
          const scheduleData = {
            provider_id: user.id,
            grade_level: schedule.grade_level,
            period_name: schedule.period_name,
            day_of_week: schedule.day_of_week,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            school_site: profile?.school_site,
            school_id: profile?.school_id,
            content_hash: schedule.content_hash
          };
          
          if (existingMap.has(schedule.normalized_key)) {
            // Update existing record
            const { error } = await supabase
              .from('bell_schedules')
              .update(scheduleData)
              .eq('id', existingMap.get(schedule.normalized_key));
            
            if (error) {
              summary.errors.push({ item: schedule, error: error.message });
            } else {
              summary.updated++;
            }
          } else {
            // Insert new record
            const { error } = await supabase
              .from('bell_schedules')
              .insert(scheduleData);
            
            if (error) {
              summary.errors.push({ item: schedule, error: error.message });
            } else {
              summary.inserted++;
            }
          }
        } catch (err: any) {
          summary.errors.push({ item: schedule, error: err.message || 'Unexpected error' });
        }
      }
      
      summary.skipped = summary.total - dedupedSchedules.length;
      
    } else if (uploadType === 'special_activities') {
      // Deduplicate special activities
      const dedupedActivities = dedupeSpecialActivities(confirmedData);
      
      // Get existing activities
      const { data: existingActivities } = await supabase
        .from('special_activities')
        .select('*')
        .eq('provider_id', user.id)
        .eq('school_id', profile?.school_id);
      
      // Create a map of existing activities by normalized key
      const existingMap = new Map();
      if (existingActivities) {
        for (const activity of existingActivities) {
          const normalized = normalizeSpecialActivity(activity);
          existingMap.set(normalized.normalized_key, activity.id);
        }
      }
      
      // Process deduplicated activities
      for (const activity of dedupedActivities) {
        try {
          const activityData = {
            provider_id: user.id,
            teacher_name: activity.teacher_name,
            activity_name: activity.activity_name,
            day_of_week: activity.day_of_week,
            start_time: activity.start_time,
            end_time: activity.end_time,
            school_site: profile?.school_site,
            school_id: profile?.school_id,
            content_hash: activity.content_hash
          };
          
          if (existingMap.has(activity.normalized_key)) {
            // Update existing record
            const { error } = await supabase
              .from('special_activities')
              .update(activityData)
              .eq('id', existingMap.get(activity.normalized_key));
            
            if (error) {
              summary.errors.push({ item: activity, error: error.message });
            } else {
              summary.updated++;
            }
          } else {
            // Insert new record
            const { error } = await supabase
              .from('special_activities')
              .insert(activityData);
            
            if (error) {
              summary.errors.push({ item: activity, error: error.message });
            } else {
              summary.inserted++;
            }
          }
        } catch (err: any) {
          summary.errors.push({ item: activity, error: err.message || 'Unexpected error' });
        }
      }
      
      summary.skipped = summary.total - dedupedActivities.length;
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: summary.total,
        inserted: summary.inserted,
        updated: summary.updated,
        skipped: summary.skipped,
        failed: summary.errors.length
      },
      failedItems: summary.errors
    });

  } catch (error) {
    console.error('AI Upload confirmation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}