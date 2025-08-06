'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';

interface SchoolStats {
  total_users: number;
  total_schools: number;
  total_districts: number;
  total_states: number;
  avg_users_per_school: number;
  system_status: string;
}

interface SchoolDetail {
  school_id: string;
  school_name: string;
  district_name: string;
  state_code: string;
  total_staff: number;
  total_students: number;
  active_providers: number;
}

export default function SchoolManagementPage() {
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [schools, setSchools] = useState<SchoolDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);
  const supabase = createClient();

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // Check if user is admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('User not authenticated');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        console.error('Access denied: Admin only');
        return;
      }

      // Load system stats
      const { data: systemStats } = await supabase.rpc('get_system_health_stats');
      if (systemStats && systemStats[0]) {
        setStats(systemStats[0]);
      }

      // Load school statistics
      const { data: schoolStats } = await supabase
        .from('school_statistics')
        .select('*')
        .order('total_staff', { ascending: false })
        .limit(20);

      if (schoolStats) {
        setSchools(schoolStats);
      }

      // Load performance metrics - fetch raw data and aggregate in memory
      const { data: perfData } = await supabase
        .from('query_performance_log')
        .select('query_type, execution_time_ms')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Aggregate the data in memory
      if (perfData) {
        const aggregated = perfData.reduce((acc: any, curr) => {
          if (!acc[curr.query_type]) {
            acc[curr.query_type] = {
              query_type: curr.query_type,
              total_time: 0,
              query_count: 0,
              avg_time: 0
            };
          }
          acc[curr.query_type].total_time += curr.execution_time_ms || 0;
          acc[curr.query_type].query_count += 1;
          return acc;
        }, {});

        // Calculate averages
        const metrics = Object.values(aggregated).map((item: any) => ({
          ...item,
          avg_time: item.query_count > 0 ? item.total_time / item.query_count : 0
        }));

        setPerformanceMetrics(metrics);
      } else {
        setPerformanceMetrics([]);
      }

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const refreshStatistics = async () => {
    try {
      setRefreshing(true);
      
      // Refresh materialized view
      await supabase.rpc('refresh_school_statistics');
      
      // Reload data
      await loadDashboardData();
      
      alert('Statistics refreshed successfully');
    } catch (error) {
      console.error('Error refreshing statistics:', error);
      alert('Failed to refresh statistics');
    } finally {
      setRefreshing(false);
    }
  };

  const runDataQualityCheck = async () => {
    try {
      const checks: Array<{check: string; status: string; details: string}> = [];
      
      // Check for orphaned school IDs
      const { data: orphaned } = await supabase
        .from('profiles')
        .select('id, school_id')
        .not('school_id', 'is', null)
        .limit(100);

      if (orphaned) {
        const schoolIds = [...new Set(orphaned.map(p => p.school_id))];
        const { data: validSchools } = await supabase
          .from('schools')
          .select('id')
          .in('id', schoolIds);

        const validIds = new Set(validSchools?.map(s => s.id) || []);
        const orphanedIds = schoolIds.filter(id => !validIds.has(id));
        
        checks.push({
          check: 'Orphaned School IDs',
          status: orphanedIds.length === 0 ? 'Pass' : 'Fail',
          details: orphanedIds.length === 0 ? 'No orphaned IDs' : `Found ${orphanedIds.length} orphaned IDs`
        });
      }

      // Check for missing required fields
      const { count: missingFields } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .or('school_id.is.null,district_id.is.null,state_id.is.null');

      checks.push({
        check: 'Required Fields',
        status: missingFields === 0 ? 'Pass' : 'Warning',
        details: missingFields === 0 ? 'All required fields present' : `${missingFields} profiles missing required fields`
      });

      // Display results
      const message = checks.map(c => `${c.check}: ${c.status} - ${c.details}`).join('\\n');
      alert(`Data Quality Check Results:\\n\\n${message}`);
      
    } catch (error) {
      console.error('Error running data quality check:', error);
      alert('Failed to run data quality check');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">School System Management</h1>
        <p className="text-gray-600">Monitor and manage the structured school system</p>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Users</h3>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_users || 0}</p>
        </Card>
        
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Schools</h3>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_schools || 0}</p>
        </Card>
        
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Districts</h3>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_districts || 0}</p>
        </Card>
        
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-500">System Status</h3>
          <p className="text-2xl font-bold text-green-600">
            {stats?.system_status === 'optimized' ? '✓ Optimized' : stats?.system_status}
          </p>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-8">
        <Button 
          onClick={refreshStatistics}
          disabled={refreshing}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Statistics'}
        </Button>
        
        <Button 
          onClick={runDataQualityCheck}
          className="bg-green-600 hover:bg-green-700"
        >
          Run Data Quality Check
        </Button>
      </div>

      {/* Top Schools */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Top Schools by Staff Count</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  School
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  District
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Staff
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Students
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Providers
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {schools.map((school) => (
                <tr 
                  key={school.school_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedSchool(school.school_id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {school.school_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {school.district_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {school.state_code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {school.total_staff}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {school.total_students}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {school.active_providers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Performance Metrics */}
      {performanceMetrics && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Query Performance (Last 24h)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {performanceMetrics.map((metric: any) => (
              <div key={metric.query_type} className="bg-gray-50 p-4 rounded">
                <p className="text-sm font-medium text-gray-600">{metric.query_type}</p>
                <p className="text-xl font-bold text-gray-900">
                  {Math.round(metric.avg_time)}ms
                </p>
                <p className="text-xs text-gray-500">{metric.query_count} queries</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}