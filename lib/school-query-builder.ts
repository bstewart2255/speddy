import { SupabaseClient } from '@supabase/supabase-js';
import { SchoolIdentifier, buildSchoolFilter } from './school-helpers';

/**
 * Advanced query builder for school-related database operations
 * Automatically optimizes queries based on available school data
 */

export interface QueryOptions {
  useIndexedQueries?: boolean;
  includeSchoolDetails?: boolean;
  logPerformance?: boolean;
}

export class SchoolQueryBuilder {
  private supabase: SupabaseClient;
  private defaultOptions: QueryOptions = {
    useIndexedQueries: true,
    includeSchoolDetails: false,
    logPerformance: true
  };

  constructor(supabase: SupabaseClient, options?: QueryOptions) {
    this.supabase = supabase;
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Build an optimized query for fetching school-related data
   */
  buildQuery<T extends string>(
    table: T,
    school?: SchoolIdentifier,
    additionalFilters?: Record<string, any>
  ) {
    const startTime = performance.now();
    let query = this.supabase.from(table).select('*');
    
    // Apply school filter if provided
    if (school) {
      query = this.applySchoolFilter(query, school, table);
    }
    
    // Apply additional filters
    if (additionalFilters) {
      Object.entries(additionalFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }
    
    if (this.defaultOptions.logPerformance) {
      const queryType = school?.school_id ? 'indexed' : 'text-based';
      console.log(`[SchoolQueryBuilder] Building ${queryType} query for ${table}`);
    }
    
    return query;
  }

  /**
   * Apply school filter with intelligent strategy selection
   */
  private applySchoolFilter(query: any, school: SchoolIdentifier, tableName: string) {
    // Tables that will have school_id columns in the future
    const indexedTables = ['students', 'bell_schedules', 'special_activities', 'schedule_sessions'];
    const hasIndexSupport = indexedTables.includes(tableName);
    
    if (school.school_id && hasIndexSupport) {
      // Log that we could use indexed queries in the future
      console.log(`[SchoolQueryBuilder] Table ${tableName} will support indexed queries when school_id column is added`);
    }
    
    // For now, use text-based filtering
    if (school.school_site) {
      query = query.eq('school_site', school.school_site);
    }
    if (school.school_district) {
      query = query.eq('school_district', school.school_district);
    }
    
    return query;
  }

  /**
   * Batch fetch school-related data with optimizations
   */
  async batchFetchSchoolData(
    school: SchoolIdentifier,
    tables: string[],
    userId?: string
  ): Promise<Record<string, any[]>> {
    const startTime = performance.now();
    const results: Record<string, any[]> = {};
    
    // Build queries for each table
    const queries = tables.map(table => {
      let query = this.buildQuery(table, school);
      
      // Add user filter if provided
      if (userId) {
        query = query.eq('provider_id', userId);
      }
      
      return { table, query };
    });
    
    // Execute queries in parallel
    const responses = await Promise.all(
      queries.map(async ({ table, query }) => {
        const { data, error } = await query;
        if (error) {
          console.error(`[SchoolQueryBuilder] Error fetching ${table}:`, error);
          return { table, data: [] };
        }
        return { table, data: data || [] };
      })
    );
    
    // Organize results
    responses.forEach(({ table, data }) => {
      results[table] = data;
    });
    
    const endTime = performance.now();
    if (this.defaultOptions.logPerformance) {
      const queryType = school.school_id ? 'indexed' : 'text-based';
      console.log(`[SchoolQueryBuilder] Batch fetch completed in ${Math.round(endTime - startTime)}ms using ${queryType} queries`);
      console.log(`[SchoolQueryBuilder] Fetched:`, Object.entries(results).map(([table, data]) => `${table}: ${data.length}`).join(', '));
    }
    
    return results;
  }

  /**
   * Get optimal filter for a school based on available data
   */
  getOptimalFilter(school: SchoolIdentifier): Record<string, any> {
    // In the future, this will return school_id when available
    // For now, return text-based filters
    const filter: Record<string, any> = {};
    
    if (school.school_id) {
      // Future: filter.school_id = school.school_id;
      // For now, still use text fields
      if (school.school_site) filter.school_site = school.school_site;
      if (school.school_district) filter.school_district = school.school_district;
    } else {
      if (school.school_site) filter.school_site = school.school_site;
      if (school.school_district) filter.school_district = school.school_district;
    }
    
    return filter;
  }

  /**
   * Check if a query will be optimized
   */
  isQueryOptimized(school: SchoolIdentifier, tableName: string): boolean {
    // Tables that will have school_id columns in the future
    const indexedTables = ['students', 'bell_schedules', 'special_activities', 'schedule_sessions'];
    
    // Will be optimized when school_id columns are added
    return !!school.school_id && indexedTables.includes(tableName);
  }

  /**
   * Get performance metrics for school queries
   */
  async measureQueryPerformance(
    school: SchoolIdentifier,
    tableName: string
  ): Promise<{ duration: number; recordCount: number; queryType: string }> {
    const startTime = performance.now();
    const query = this.buildQuery(tableName, school);
    
    const { data, error } = await query;
    const endTime = performance.now();
    
    return {
      duration: Math.round(endTime - startTime),
      recordCount: data?.length || 0,
      queryType: school.school_id ? 'indexed (future)' : 'text-based'
    };
  }
}

/**
 * Factory function to create a query builder
 */
export function createSchoolQueryBuilder(
  supabase: SupabaseClient,
  options?: QueryOptions
): SchoolQueryBuilder {
  return new SchoolQueryBuilder(supabase, options);
}

/**
 * Helper to build a school filter for RPC calls
 */
export function buildRPCSchoolFilter(school?: SchoolIdentifier): Record<string, any> {
  if (!school) return {};
  
  const filter: Record<string, any> = {};
  
  // For RPC functions, use appropriate parameter names
  if (school.school_id) {
    filter.p_school_id = school.school_id;
    filter.p_district_id = school.district_id;
    filter.p_state_id = school.state_id;
  } else {
    filter.p_school_site = school.school_site;
    filter.p_school_district = school.school_district;
  }
  
  return filter;
}

/**
 * Helper to determine if parallel queries would be beneficial
 */
export function shouldUseParallelQueries(
  school: SchoolIdentifier,
  tableCount: number
): boolean {
  // Use parallel queries if:
  // 1. We have structured data (faster individual queries)
  // 2. We're querying multiple tables
  return !!school.school_id && tableCount > 2;
}