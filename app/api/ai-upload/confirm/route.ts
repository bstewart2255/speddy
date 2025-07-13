// app/api/ai-upload/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Get user's school information
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_site, school_district')
      .eq('id', user.id)
      .single();

    let successCount = 0;
    let failedItems: any[] = [];

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
              school_district: profile?.school_district || ''
            });

          if (error) {
            failedItems.push({
              item: student,
              error: error.message
            });
          } else {
            successCount++;
          }
        } catch (err) {
          failedItems.push({
            item: student,
            error: 'Unexpected error'
          });
        }
      }
    } else if (uploadType === 'bell_schedule') {
      for (const schedule of confirmedData) {
        try {
          // Insert for each day
          const days = schedule.days || [1, 2, 3, 4, 5];

          for (const day of days) {
            const { error } = await supabase
              .from('bell_schedules')
              .insert({
                provider_id: user.id,
                grade_level: schedule.grade_level,
                period_name: schedule.period_name,
                day_of_week: day,
                start_time: schedule.start_time + ':00',
                end_time: schedule.end_time + ':00',
                school_site: profile?.school_site
              });

            if (error) {
              failedItems.push({
                item: { ...schedule, day },
                error: error.message
              });
            } else {
              successCount++;
            }
          }
        } catch (err) {
          failedItems.push({
            item: schedule,
            error: 'Unexpected error'
          });
        }
      }
    } else if (uploadType === 'special_activities') {
      for (const activity of confirmedData) {
        try {
          const { error } = await supabase
            .from('special_activities')
            .insert({
              provider_id: user.id,
              teacher_name: activity.teacher_name,
              activity_name: activity.activity_name,
              day_of_week: activity.day_of_week,
              start_time: activity.start_time + ':00',
              end_time: activity.end_time + ':00',
              school_site: profile?.school_site
            });

          if (error) {
            failedItems.push({
              item: activity,
              error: error.message
            });
          } else {
            successCount++;
          }
        } catch (err) {
          failedItems.push({
            item: activity,
            error: 'Unexpected error'
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      failedCount: failedItems.length,
      failedItems
    });

  } catch (error) {
    console.error('AI Upload confirmation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}