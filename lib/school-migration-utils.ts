import { SupabaseClient } from '@supabase/supabase-js';
import { SchoolIdentifier } from './school-helpers';

/**
 * Utilities to help with the school data migration process
 * and handle mixed migration states gracefully
 */

export interface MigrationStatus {
  userId: string;
  isMigrated: boolean;
  hasSchoolId: boolean;
  hasDistrictId: boolean;
  hasStateId: boolean;
  schoolSite?: string;
  schoolDistrict?: string;
  schoolId?: string;
  districtId?: string;
  stateId?: string;
  migrationDate?: string;
}

export class SchoolMigrationHelper {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Check the migration status of a user
   */
  async getUserMigrationStatus(userId: string): Promise<MigrationStatus | null> {
    try {
      const { data: profile, error } = await this.supabase
        .from('profiles')
        .select('school_site, school_district, school_id, district_id, state_id, updated_at')
        .eq('id', userId)
        .single();

      if (error || !profile) {
        console.error('[MigrationHelper] Error fetching user profile:', error);
        return null;
      }

      return {
        userId,
        isMigrated: !!profile.school_id,
        hasSchoolId: !!profile.school_id,
        hasDistrictId: !!profile.district_id,
        hasStateId: !!profile.state_id,
        schoolSite: profile.school_site,
        schoolDistrict: profile.school_district,
        schoolId: profile.school_id,
        districtId: profile.district_id,
        stateId: profile.state_id,
        migrationDate: profile.school_id ? profile.updated_at : undefined
      };
    } catch (error) {
      console.error('[MigrationHelper] Error checking migration status:', error);
      return null;
    }
  }

  /**
   * Get migration statistics for a school
   */
  async getSchoolMigrationStats(school: SchoolIdentifier): Promise<{
    totalUsers: number;
    migratedUsers: number;
    percentMigrated: number;
    tables: Record<string, { total: number; withIds: number }>;
  }> {
    const stats = {
      totalUsers: 0,
      migratedUsers: 0,
      percentMigrated: 0,
      tables: {} as Record<string, { total: number; withIds: number }>
    };

    try {
      // Get user migration stats
      let userQuery = this.supabase
        .from('profiles')
        .select('id, school_id', { count: 'exact' });

      if (school.school_site) {
        userQuery = userQuery.eq('school_site', school.school_site);
      }
      if (school.school_district) {
        userQuery = userQuery.eq('school_district', school.school_district);
      }

      const { data: users, count } = await userQuery;

      if (users && count) {
        stats.totalUsers = count;
        stats.migratedUsers = users.filter(u => u.school_id).length;
        stats.percentMigrated = Math.round((stats.migratedUsers / stats.totalUsers) * 100);
      }

      // Check migration status of related tables
      // Note: These checks will be more meaningful when school_id columns are added
      const tablesToCheck = ['students', 'bell_schedules', 'special_activities'];
      
      for (const table of tablesToCheck) {
        let tableQuery = this.supabase.from(table).select('id', { count: 'exact' });
        
        if (school.school_site) {
          tableQuery = tableQuery.eq('school_site', school.school_site);
        }
        
        const { count: totalCount } = await tableQuery;
        
        stats.tables[table] = {
          total: totalCount || 0,
          withIds: 0 // Will be populated when school_id columns are added
        };
      }

    } catch (error) {
      console.error('[MigrationHelper] Error getting migration stats:', error);
    }

    return stats;
  }

  /**
   * Prepare data for migration by ensuring consistency
   */
  async prepareDataForMigration(
    userId: string,
    newSchoolData: { school_id: string; district_id: string; state_id: string }
  ): Promise<{
    success: boolean;
    tablesReady: string[];
    issues: string[];
  }> {
    const result = {
      success: true,
      tablesReady: [] as string[],
      issues: [] as string[]
    };

    try {
      // Get current user data
      const status = await this.getUserMigrationStatus(userId);
      if (!status) {
        result.success = false;
        result.issues.push('Could not fetch user profile');
        return result;
      }

      // Check if already migrated
      if (status.isMigrated) {
        result.issues.push('User already migrated');
        return result;
      }

      // Tables that need to be checked/prepared
      const tablesToPrepare = [
        { name: 'students', userField: 'provider_id' },
        { name: 'bell_schedules', userField: 'provider_id' },
        { name: 'special_activities', userField: 'provider_id' },
        { name: 'schedule_sessions', userField: 'provider_id' }
      ];

      for (const table of tablesToPrepare) {
        // Check if table has consistent school data
        const { data, error } = await this.supabase
          .from(table.name)
          .select('id, school_site, school_district')
          .eq(table.userField, userId);

        if (error) {
          result.issues.push(`Error checking ${table.name}: ${error.message}`);
          continue;
        }

        if (data && data.length > 0) {
          // Check for consistency
          const inconsistent = data.filter(record => 
            record.school_site !== status.schoolSite || 
            record.school_district !== status.schoolDistrict
          );

          if (inconsistent.length > 0) {
            result.issues.push(`${table.name} has ${inconsistent.length} records with inconsistent school data`);
          } else {
            result.tablesReady.push(table.name);
          }
        } else {
          result.tablesReady.push(table.name); // No data to migrate
        }
      }

      result.success = result.issues.length === 0;

    } catch (error) {
      console.error('[MigrationHelper] Error preparing data:', error);
      result.success = false;
      result.issues.push('Unexpected error during preparation');
    }

    return result;
  }

  /**
   * Generate a migration report for display
   */
  generateMigrationReport(status: MigrationStatus): string[] {
    const report: string[] = [];

    if (status.isMigrated) {
      report.push('✅ User has been migrated to structured school data');
      report.push(`   School ID: ${status.schoolId}`);
      report.push(`   District ID: ${status.districtId}`);
      report.push(`   State ID: ${status.stateId}`);
      if (status.migrationDate) {
        report.push(`   Migrated on: ${new Date(status.migrationDate).toLocaleDateString()}`);
      }
    } else {
      report.push('⏳ User is using legacy text-based school data');
      report.push(`   School: ${status.schoolSite}`);
      report.push(`   District: ${status.schoolDistrict}`);
      report.push('   Performance: Normal (text matching)');
      report.push('   Recommendation: Migrate for 2-3x faster queries');
    }

    return report;
  }

  /**
   * Estimate performance improvement from migration
   */
  estimatePerformanceGain(recordCounts: Record<string, number>): {
    currentLoadTime: number;
    optimizedLoadTime: number;
    improvement: string;
  } {
    // Rough estimates based on typical query performance
    const TEXT_QUERY_MS_PER_RECORD = 0.5;
    const INDEXED_QUERY_MS_PER_RECORD = 0.15;
    const BASE_QUERY_TIME = 50;

    let totalRecords = 0;
    Object.values(recordCounts).forEach(count => {
      totalRecords += count;
    });

    const currentLoadTime = BASE_QUERY_TIME + (totalRecords * TEXT_QUERY_MS_PER_RECORD);
    const optimizedLoadTime = BASE_QUERY_TIME + (totalRecords * INDEXED_QUERY_MS_PER_RECORD);
    const improvementFactor = currentLoadTime / optimizedLoadTime;

    return {
      currentLoadTime: Math.round(currentLoadTime),
      optimizedLoadTime: Math.round(optimizedLoadTime),
      improvement: `${improvementFactor.toFixed(1)}x faster`
    };
  }
}

/**
 * Factory function to create a migration helper
 */
export function createMigrationHelper(supabase: SupabaseClient): SchoolMigrationHelper {
  return new SchoolMigrationHelper(supabase);
}

/**
 * Check if a batch of users should be migrated together
 */
export async function shouldBatchMigrate(
  supabase: SupabaseClient,
  school: SchoolIdentifier
): Promise<boolean> {
  // Check if enough users at this school would benefit from migration
  try {
    let query = supabase
      .from('profiles')
      .select('id, school_id', { count: 'exact' });

    if (school.school_site) {
      query = query.eq('school_site', school.school_site);
    }
    if (school.school_district) {
      query = query.eq('school_district', school.school_district);
    }

    const { data, count } = await query;

    if (!data || !count) return false;

    const migratedCount = data.filter(u => u.school_id).length;
    const unmigrated = count - migratedCount;

    // Recommend batch migration if:
    // 1. More than 5 unmigrated users
    // 2. Less than 50% are migrated
    return unmigrated > 5 && (migratedCount / count) < 0.5;

  } catch (error) {
    console.error('[MigrationHelper] Error checking batch migration:', error);
    return false;
  }
}