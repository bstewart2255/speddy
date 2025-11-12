import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/src/types/database';
import { DuplicateDetectionService } from './duplicate-detection';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];

export type ImportMode = 'skip_duplicates' | 'replace_existing' | 'import_all';

export type ImportResult = {
  bell_schedules_imported: number;
  special_activities_imported: number;
  duplicates_skipped?: number;
  items_replaced?: number;
  error?: string;
};

/**
 * Service for importing bell schedules and special activities from one provider to another.
 * Handles duplicate detection and provides multiple import strategies.
 */
export class ScheduleImportService {
  private supabase = createClient<Database>();
  private duplicateDetector = new DuplicateDetectionService();

  /**
   * Import schedules from a sharer to a recipient.
   *
   * @param sharerId - UUID of the provider sharing their schedules
   * @param recipientId - UUID of the provider receiving the schedules
   * @param schoolId - UUID of the school where schedules are being shared
   * @param mode - Import strategy: 'skip_duplicates' | 'replace_existing' | 'import_all'
   * @returns ImportResult with counts of imported items, duplicates skipped, and any errors
   *
   * @example
   * ```typescript
   * const result = await service.importSchedules(
   *   'sharer-uuid',
   *   'recipient-uuid',
   *   'school-uuid',
   *   'skip_duplicates'
   * );
   * console.log(`Imported ${result.bell_schedules_imported} bell schedules`);
   * ```
   */
  async importSchedules(
    sharerId: string,
    recipientId: string,
    schoolId: string,
    mode: ImportMode
  ): Promise<ImportResult> {
    try {
      // Fetch sharer's schedules for this school
      const [sharerBellSchedules, sharerSpecialActivities] = await Promise.all([
        this.fetchBellSchedules(sharerId, schoolId),
        this.fetchSpecialActivities(sharerId, schoolId),
      ]);

      // Fetch recipient's existing schedules for this school
      const [recipientBellSchedules, recipientSpecialActivities] = await Promise.all([
        this.fetchBellSchedules(recipientId, schoolId),
        this.fetchSpecialActivities(recipientId, schoolId),
      ]);

      let bellSchedulesToImport: Partial<BellSchedule>[] = [];
      let specialActivitiesToImport: Partial<SpecialActivity>[] = [];
      let duplicatesSkipped = 0;
      let itemsReplaced = 0;

      // Process based on import mode
      switch (mode) {
        case 'replace_existing':
          // Delete all recipient's existing schedules for this school
          await this.deleteExistingSchedules(recipientId, schoolId);
          itemsReplaced = recipientBellSchedules.length + recipientSpecialActivities.length;

          // Import all sharer's schedules
          bellSchedulesToImport = this.prepareSchedulesForImport(sharerBellSchedules, recipientId);
          specialActivitiesToImport = this.prepareActivitiesForImport(sharerSpecialActivities, recipientId);
          break;

        case 'skip_duplicates':
          // Detect duplicates and import only unique items
          const bellDuplicates = this.duplicateDetector.detectBellScheduleDuplicates(
            recipientBellSchedules,
            sharerBellSchedules
          );
          const activityDuplicates = this.duplicateDetector.detectSpecialActivityDuplicates(
            recipientSpecialActivities,
            sharerSpecialActivities
          );

          bellSchedulesToImport = this.prepareSchedulesForImport(bellDuplicates.unique, recipientId);
          specialActivitiesToImport = this.prepareActivitiesForImport(activityDuplicates.unique, recipientId);
          duplicatesSkipped = bellDuplicates.duplicates.length + activityDuplicates.duplicates.length;
          break;

        case 'import_all':
          // Import everything, allow duplicates
          bellSchedulesToImport = this.prepareSchedulesForImport(sharerBellSchedules, recipientId);
          specialActivitiesToImport = this.prepareActivitiesForImport(sharerSpecialActivities, recipientId);
          break;
      }

      // Insert the schedules
      const [bellSchedulesImported, specialActivitiesImported] = await Promise.all([
        this.insertBellSchedules(bellSchedulesToImport),
        this.insertSpecialActivities(specialActivitiesToImport),
      ]);

      // Remove the share request
      await this.removeShareRequest(sharerId, schoolId);

      return {
        bell_schedules_imported: bellSchedulesImported,
        special_activities_imported: specialActivitiesImported,
        duplicates_skipped: duplicatesSkipped,
        items_replaced: itemsReplaced,
      };
    } catch (error) {
      console.error('Error importing schedules:', error);
      return {
        bell_schedules_imported: 0,
        special_activities_imported: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Fetch bell schedules for a provider and school
   */
  private async fetchBellSchedules(providerId: string, schoolId: string): Promise<BellSchedule[]> {
    const { data, error } = await this.supabase
      .from('bell_schedules')
      .select('*')
      .eq('provider_id', providerId)
      .eq('school_id', schoolId);

    if (error) {
      console.error('Error fetching bell schedules:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Fetch special activities for a provider and school
   */
  private async fetchSpecialActivities(providerId: string, schoolId: string): Promise<SpecialActivity[]> {
    const { data, error } = await this.supabase
      .from('special_activities')
      .select('*')
      .eq('provider_id', providerId)
      .eq('school_id', schoolId);

    if (error) {
      console.error('Error fetching special activities:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Delete existing schedules for a provider and school
   */
  private async deleteExistingSchedules(providerId: string, schoolId: string): Promise<void> {
    const [bellResult, activityResult] = await Promise.all([
      this.supabase
        .from('bell_schedules')
        .delete()
        .eq('provider_id', providerId)
        .eq('school_id', schoolId),
      this.supabase
        .from('special_activities')
        .delete()
        .eq('provider_id', providerId)
        .eq('school_id', schoolId),
    ]);

    if (bellResult.error) {
      console.error('Error deleting bell schedules:', bellResult.error);
      throw bellResult.error;
    }

    if (activityResult.error) {
      console.error('Error deleting special activities:', activityResult.error);
      throw activityResult.error;
    }
  }

  /**
   * Prepare bell schedules for import (remove IDs, set new provider)
   */
  private prepareSchedulesForImport(schedules: BellSchedule[], newProviderId: string): Partial<BellSchedule>[] {
    return schedules.map(schedule => ({
      ...schedule,
      id: undefined,
      provider_id: newProviderId,
      created_at: undefined,
    }));
  }

  /**
   * Prepare special activities for import (remove IDs, set new provider)
   */
  private prepareActivitiesForImport(activities: SpecialActivity[], newProviderId: string): Partial<SpecialActivity>[] {
    return activities.map(activity => ({
      ...activity,
      id: undefined,
      provider_id: newProviderId,
      created_at: undefined,
    }));
  }

  /**
   * Insert bell schedules and return count
   */
  private async insertBellSchedules(schedules: Partial<BellSchedule>[]): Promise<number> {
    if (schedules.length === 0) return 0;

    // Prepare schedules for insert by ensuring all required fields are present
    const schedulesToInsert = schedules.map(schedule => {
      const { id, created_at, ...rest } = schedule as BellSchedule;
      return rest;
    });

    const { error } = await this.supabase
      .from('bell_schedules')
      .insert(schedulesToInsert);

    if (error) {
      console.error('Error inserting bell schedules:', error);
      throw error;
    }

    return schedules.length;
  }

  /**
   * Insert special activities and return count
   */
  private async insertSpecialActivities(activities: Partial<SpecialActivity>[]): Promise<number> {
    if (activities.length === 0) return 0;

    // Prepare activities for insert by ensuring all required fields are present
    const activitiesToInsert = activities.map(activity => {
      const { id, created_at, ...rest } = activity as SpecialActivity;
      return rest;
    });

    const { error } = await this.supabase
      .from('special_activities')
      .insert(activitiesToInsert);

    if (error) {
      console.error('Error inserting special activities:', error);
      throw error;
    }

    return activities.length;
  }

  /**
   * Remove a share request
   */
  private async removeShareRequest(sharerId: string, schoolId: string): Promise<void> {
    const { error } = await this.supabase
      .from('schedule_share_requests')
      .delete()
      .eq('sharer_id', sharerId)
      .eq('school_id', schoolId);

    if (error) {
      console.error('Error removing share request:', error);
      // Don't throw here, as the import was successful even if cleanup failed
    }
  }
}