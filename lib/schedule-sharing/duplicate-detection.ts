import type { Database } from '@/src/types/database';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];

export class DuplicateDetectionService {
  /**
   * Detect duplicates in bell schedules based on grade level and period name
   * Matches are case-insensitive for period names
   */
  detectBellScheduleDuplicates(
    existing: BellSchedule[], 
    incoming: BellSchedule[]
  ): {
    duplicates: BellSchedule[];
    unique: BellSchedule[];
  } {
    const duplicates: BellSchedule[] = [];
    const unique: BellSchedule[] = [];

    incoming.forEach(incomingSchedule => {
      const isDuplicate = existing.some(existingSchedule => 
        this.isBellScheduleDuplicate(existingSchedule, incomingSchedule)
      );

      if (isDuplicate) {
        duplicates.push(incomingSchedule);
      } else {
        unique.push(incomingSchedule);
      }
    });

    return { duplicates, unique };
  }

  /**
   * Detect duplicates in special activities based on teacher name and activity name
   * Matches are case-insensitive for activity names
   */
  detectSpecialActivityDuplicates(
    existing: SpecialActivity[], 
    incoming: SpecialActivity[]
  ): {
    duplicates: SpecialActivity[];
    unique: SpecialActivity[];
  } {
    const duplicates: SpecialActivity[] = [];
    const unique: SpecialActivity[] = [];

    incoming.forEach(incomingActivity => {
      const isDuplicate = existing.some(existingActivity => 
        this.isSpecialActivityDuplicate(existingActivity, incomingActivity)
      );

      if (isDuplicate) {
        duplicates.push(incomingActivity);
      } else {
        unique.push(incomingActivity);
      }
    });

    return { duplicates, unique };
  }

  /**
   * Check if two bell schedules are duplicates
   * Match criteria: same grade level, case-insensitive period name, and same school
   */
  private isBellScheduleDuplicate(existing: BellSchedule, incoming: BellSchedule): boolean {
    return existing.grade_level === incoming.grade_level &&
           existing.period_name?.toLowerCase() === incoming.period_name?.toLowerCase() &&
           existing.school_id === incoming.school_id;
  }

  /**
   * Check if two special activities are duplicates
   * Match criteria: same teacher name, case-insensitive activity name, and same school
   */
  private isSpecialActivityDuplicate(existing: SpecialActivity, incoming: SpecialActivity): boolean {
    return existing.teacher_name === incoming.teacher_name &&
           existing.activity_name?.toLowerCase() === incoming.activity_name?.toLowerCase() &&
           existing.school_id === incoming.school_id;
  }

  /**
   * Get summary statistics for duplicate detection results
   */
  getSummaryStats(
    bellScheduleResults: { duplicates: BellSchedule[]; unique: BellSchedule[] },
    specialActivityResults: { duplicates: SpecialActivity[]; unique: SpecialActivity[] }
  ) {
    return {
      bell_schedules: {
        total: bellScheduleResults.duplicates.length + bellScheduleResults.unique.length,
        duplicates: bellScheduleResults.duplicates.length,
        unique: bellScheduleResults.unique.length,
      },
      special_activities: {
        total: specialActivityResults.duplicates.length + specialActivityResults.unique.length,
        duplicates: specialActivityResults.duplicates.length,
        unique: specialActivityResults.unique.length,
      },
      totals: {
        total_items: bellScheduleResults.duplicates.length + bellScheduleResults.unique.length +
                    specialActivityResults.duplicates.length + specialActivityResults.unique.length,
        total_duplicates: bellScheduleResults.duplicates.length + specialActivityResults.duplicates.length,
        total_unique: bellScheduleResults.unique.length + specialActivityResults.unique.length,
      }
    };
  }
}