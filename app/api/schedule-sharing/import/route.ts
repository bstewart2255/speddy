import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/src/types/database';

type ImportMode = 'skip_duplicates' | 'replace_existing' | 'import_all';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { sharer_id, school_id, mode } = await request.json() as {
      sharer_id: string;
      school_id: string;
      mode: ImportMode;
    };

    if (!sharer_id || !school_id || !mode) {
      return NextResponse.json(
        { error: 'sharer_id, school_id, and mode are required' },
        { status: 400 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fetch sharer's schedules for this school
    const { data: sharerBellSchedules, error: bellError } = await supabase
      .from('bell_schedules')
      .select('*')
      .eq('provider_id', sharer_id)
      .eq('school_id', school_id);

    const { data: sharerSpecialActivities, error: specialError } = await supabase
      .from('special_activities')
      .select('*')
      .eq('provider_id', sharer_id)
      .eq('school_id', school_id);

    if (bellError || specialError) {
      console.error('Error fetching sharer schedules:', bellError || specialError);
      return NextResponse.json(
        { error: 'Failed to fetch sharer schedules' },
        { status: 500 }
      );
    }

    // Fetch recipient's existing schedules for this school
    const { data: recipientBellSchedules, error: recipientBellError } = await supabase
      .from('bell_schedules')
      .select('*')
      .eq('provider_id', user.id)
      .eq('school_id', school_id);

    const { data: recipientSpecialActivities, error: recipientSpecialError } = await supabase
      .from('special_activities')
      .select('*')
      .eq('provider_id', user.id)
      .eq('school_id', school_id);

    if (recipientBellError || recipientSpecialError) {
      console.error('Error fetching recipient schedules:', recipientBellError || recipientSpecialError);
      return NextResponse.json(
        { error: 'Failed to fetch recipient schedules' },
        { status: 500 }
      );
    }

    let bellSchedulesToImport: Partial<BellSchedule>[] = [];
    let specialActivitiesToImport: Partial<SpecialActivity>[] = [];
    let duplicatesSkipped = 0;
    let itemsReplaced = 0;

    // Helper function to check bell schedule duplicates
    const isBellScheduleDuplicate = (existing: BellSchedule, incoming: BellSchedule) => {
      return existing.grade_level === incoming.grade_level &&
             existing.period_name?.toLowerCase() === incoming.period_name?.toLowerCase() &&
             existing.school_id === incoming.school_id;
    };

    // Helper function to check special activity duplicates
    const isSpecialActivityDuplicate = (existing: SpecialActivity, incoming: SpecialActivity) => {
      return existing.teacher_name === incoming.teacher_name &&
             existing.activity_name?.toLowerCase() === incoming.activity_name?.toLowerCase() &&
             existing.school_id === incoming.school_id;
    };

    // Process based on import mode
    if (mode === 'replace_existing') {
      // Delete all recipient's existing schedules for this school
      await supabase
        .from('bell_schedules')
        .delete()
        .eq('provider_id', user.id)
        .eq('school_id', school_id);

      await supabase
        .from('special_activities')
        .delete()
        .eq('provider_id', user.id)
        .eq('school_id', school_id);

      itemsReplaced = (recipientBellSchedules?.length || 0) + (recipientSpecialActivities?.length || 0);

      // Import all sharer's schedules
      bellSchedulesToImport = sharerBellSchedules?.map(schedule => ({
        ...schedule,
        id: undefined,
        provider_id: user.id,
        created_at: undefined,
      })) || [];

      specialActivitiesToImport = sharerSpecialActivities?.map(activity => ({
        ...activity,
        id: undefined,
        provider_id: user.id,
        created_at: undefined,
      })) || [];

    } else if (mode === 'skip_duplicates') {
      // Import only non-duplicates
      sharerBellSchedules?.forEach(sharerSchedule => {
        const isDuplicate = recipientBellSchedules?.some(recipientSchedule => 
          isBellScheduleDuplicate(recipientSchedule, sharerSchedule)
        );
        if (!isDuplicate) {
          bellSchedulesToImport.push({
            ...sharerSchedule,
            id: undefined,
            provider_id: user.id,
            created_at: undefined,
          });
        } else {
          duplicatesSkipped++;
        }
      });

      sharerSpecialActivities?.forEach(sharerActivity => {
        const isDuplicate = recipientSpecialActivities?.some(recipientActivity => 
          isSpecialActivityDuplicate(recipientActivity, sharerActivity)
        );
        if (!isDuplicate) {
          specialActivitiesToImport.push({
            ...sharerActivity,
            id: undefined,
            provider_id: user.id,
            created_at: undefined,
          });
        } else {
          duplicatesSkipped++;
        }
      });

    } else if (mode === 'import_all') {
      // Import everything, allow duplicates
      bellSchedulesToImport = sharerBellSchedules?.map(schedule => ({
        ...schedule,
        id: undefined,
        provider_id: user.id,
        created_at: undefined,
      })) || [];

      specialActivitiesToImport = sharerSpecialActivities?.map(activity => ({
        ...activity,
        id: undefined,
        provider_id: user.id,
        created_at: undefined,
      })) || [];
    }

    // Insert the schedules to import
    let bellSchedulesImported = 0;
    let specialActivitiesImported = 0;

    if (bellSchedulesToImport.length > 0) {
      const { error: insertBellError } = await supabase
        .from('bell_schedules')
        .insert(bellSchedulesToImport);

      if (insertBellError) {
        console.error('Error inserting bell schedules:', insertBellError);
        return NextResponse.json(
          { error: 'Failed to import bell schedules' },
          { status: 500 }
        );
      }
      bellSchedulesImported = bellSchedulesToImport.length;
    }

    if (specialActivitiesToImport.length > 0) {
      const { error: insertSpecialError } = await supabase
        .from('special_activities')
        .insert(specialActivitiesToImport);

      if (insertSpecialError) {
        console.error('Error inserting special activities:', insertSpecialError);
        return NextResponse.json(
          { error: 'Failed to import special activities' },
          { status: 500 }
        );
      }
      specialActivitiesImported = specialActivitiesToImport.length;
    }

    // Remove the share request
    await supabase
      .from('schedule_share_requests')
      .delete()
      .eq('sharer_id', sharer_id)
      .eq('school_id', school_id);

    return NextResponse.json({
      success: true,
      result: {
        bell_schedules_imported: bellSchedulesImported,
        special_activities_imported: specialActivitiesImported,
        duplicates_skipped: duplicatesSkipped,
        items_replaced: itemsReplaced,
      }
    });

  } catch (error) {
    console.error('Error in import schedules:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}