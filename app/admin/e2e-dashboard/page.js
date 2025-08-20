// app/admin/e2e-dashboard/page.js
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function E2EDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [recentTests, setRecentTests] = useState([]);
  const [performanceTrends, setPerformanceTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  const loadDashboardData = useCallback(async () => {
    try {
      // Get dashboard summary
      const { data: dashData } = await supabase
        .from('e2e_dashboard')
        .select('*')
        .eq('id', 'current')
        .single();

      setDashboardData(dashData?.data || {});

      // Get recent test results
      const { data: tests } = await supabase
        .from('e2e_test_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentTests(tests || []);

      // Get performance trends (last 24 hours)
      const { data: trends } = await supabase
        .from('e2e_test_results')
        .select('created_at, duration, performance_metrics, success')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      setPerformanceTrends(processTrends(trends || []));
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadDashboardData();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('e2e-dashboard')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'e2e_test_results'
      }, () => {
        loadDashboardData();
      })
      .subscribe();

    // Refresh every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [loadDashboardData, supabase]);

  function processTrends(trends) {
    return trends.map(t => ({
      time: new Date(t.created_at).toLocaleTimeString(),
      duration: Math.round(t.duration / 1000),
      success: t.success ? 1 : 0,
      pageLoadHome: t.performance_metrics?.pageLoadTimes?.home || 0,
      pageLoadLogin: t.performance_metrics?.pageLoadTimes?.login || 0,
      pageLoadDashboard: t.performance_metrics?.pageLoadTimes?.dashboard || 0
    }));
  }

  const getStatusColor = (status) => {
    return status === 'healthy' ? '#10B981' : status === 'degraded' ? '#F59E0B' : '#EF4444';
  };

  const successRate = recentTests.length > 0 
    ? (recentTests.filter(t => t.success).length / recentTests.length * 100).toFixed(1)
    : 0;

  const avgDuration = recentTests.length > 0
    ? (recentTests.reduce((acc, t) => acc + t.duration, 0) / recentTests.length / 1000).toFixed(2)
    : 0;

  const pieData = [
    { name: 'Passed', value: recentTests.filter(t => t.success).length, color: '#10B981' },
    { name: 'Failed', value: recentTests.filter(t => !t.success).length, color: '#EF4444' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">E2E Test Monitoring Dashboard</h1>
        <p className="text-gray-600 mt-2">Real-time monitoring of end-to-end tests</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">System Status</h3>
            <div 
              className={`h-3 w-3 rounded-full ${
                dashboardData.status === 'healthy' ? 'bg-green-500' : 
                dashboardData.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
              } animate-pulse`}
            />
          </div>
          <p className={`text-2xl font-bold mt-2 ${
            dashboardData.status === 'healthy' ? 'text-green-600' : 
            dashboardData.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {dashboardData.status?.toUpperCase() || 'UNKNOWN'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Last checked: {dashboardData.lastRun ? new Date(dashboardData.lastRun).toLocaleString() : 'Never'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-600">Success Rate (24h)</h3>
          <p className="text-2xl font-bold mt-2">{successRate}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
            <div 
              className="bg-green-600 h-2 rounded-full" 
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-600">Avg Test Duration</h3>
          <p className="text-2xl font-bold mt-2">{avgDuration}s</p>
          <p className="text-xs text-gray-500 mt-1">
            {avgDuration < 30 ? '✅ Good' : avgDuration < 60 ? '⚠️ Slow' : '❌ Too Slow'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-600">Consecutive Failures</h3>
          <p className={`text-2xl font-bold mt-2 ${
            dashboardData.consecutiveFailures > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {dashboardData.consecutiveFailures || 0}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Alert threshold: 3
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Test Duration Trend */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Test Duration Trend (24h)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="duration" 
                stroke="#3B82F6" 
                name="Duration (s)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Success/Failure Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Test Results Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Page Load Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Page Load Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pageLoadHome" stroke="#10B981" name="Home" strokeWidth={2} />
              <Line type="monotone" dataKey="pageLoadLogin" stroke="#F59E0B" name="Login" strokeWidth={2} />
              <Line type="monotone" dataKey="pageLoadDashboard" stroke="#EF4444" name="Dashboard" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Success Rate Trend */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Success Rate Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="success" fill="#10B981" name="Success (1=Pass, 0=Fail)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Insights */}
      {dashboardData.aiSummary && (
        <div className="bg-blue-50 rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <span className="mr-2">🤖</span> AI Insights
          </h3>
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-gray-700">
              {dashboardData.aiSummary}
            </pre>
          </div>
        </div>
      )}

      {/* Recent Test Results */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Recent Test Results</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tests
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Failed Tests
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentTests.map((test) => (
                <tr key={test.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(test.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      test.success 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {test.success ? 'PASSED' : 'FAILED'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(test.duration / 1000).toFixed(2)}s
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {test.test_count || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {test.failed_tests?.length > 0 
                      ? test.failed_tests.map(ft => ft.name).join(', ')
                      : '-'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}