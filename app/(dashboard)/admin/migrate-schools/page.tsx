'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Badge } from '@/app/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { AlertCircle, Check, X, Search, RefreshCw, Download, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { fuzzyMatchSchool } from './fuzzy-matcher';
import { MigrationReviewDialog } from './migration-review-dialog';
import { BatchProcessingPanel } from './batch-processing-panel';

interface MigrationStats {
  total_users: number;
  migrated_users: number;
  unmigrated_users: number;
  migration_percentage: number;
}

interface UnmigratedUser {
  id: string;
  email: string;
  display_name: string;
  school_district: string;
  school_site: string;
  created_at: string;
}

interface SchoolMatch {
  school_id: string;
  school_name: string;
  district_id: string;
  district_name: string;
  state_id: string;
  state_name: string;
  confidence_score: number;
  match_reason: string;
}

export default function MigrateSchoolsPage() {
  const supabase = createClientComponentClient();
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [unmigratedUsers, setUnmigratedUsers] = useState<UnmigratedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UnmigratedUser | null>(null);
  const [suggestedMatches, setSuggestedMatches] = useState<SchoolMatch[]>([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [states, setStates] = useState<Array<{id: string, name: string}>>([]);
  const [districts, setDistricts] = useState<Array<{id: string, name: string}>>([]);

  const itemsPerPage = 20;

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_school_migration_stats');
    if (error) {
      console.error('Error loading stats:', error);
      return;
    }
    if (data && data.length > 0) {
      setStats(data[0]);
    }
  }, [supabase]);

  const loadUnmigratedUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, school_district, school_site, created_at')
      .is('school_id', null)
      .not('school_site', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading unmigrated users:', error);
      return;
    }
    setUnmigratedUsers(data || []);
  }, [supabase]);

  const loadStates = useCallback(async () => {
    const { data, error } = await supabase
      .from('states')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error loading states:', error);
      return;
    }
    setStates(data || []);
  }, [supabase]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadUnmigratedUsers(),
        loadStates()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadStats, loadUnmigratedUsers, loadStates]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const loadDistricts = async (stateId: string) => {
    if (stateId === 'all') {
      setDistricts([]);
      return;
    }

    const { data, error } = await supabase
      .from('districts')
      .select('id, name')
      .eq('state_id', stateId)
      .order('name');

    if (error) {
      console.error('Error loading districts:', error);
      return;
    }
    setDistricts(data || []);
  };

  const findMatchesForUser = async (user: UnmigratedUser) => {
    setSelectedUser(user);
    setProcessing(true);

    try {
      const matches = await fuzzyMatchSchool(
        supabase,
        user.school_site,
        user.school_district,
        selectedState !== 'all' ? selectedState : undefined
      );
      setSuggestedMatches(matches);
      setReviewDialogOpen(true);
    } catch (error) {
      console.error('Error finding matches:', error);
    } finally {
      setProcessing(false);
    }
  };

  const approveMigration = async (
    userId: string,
    schoolId: string,
    districtId: string,
    stateId: string,
    confidence: number,
    notes?: string
  ) => {
    setProcessing(true);
    try {
      // Get current user for audit
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      // Update profile with new IDs
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          school_id: schoolId,
          district_id: districtId,
          state_id: stateId,
          school_district_original: selectedUser?.school_district,
          school_site_original: selectedUser?.school_site
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Log the migration
      const { error: logError } = await supabase
        .from('school_migration_log')
        .insert({
          profile_id: userId,
          original_district: selectedUser?.school_district,
          original_school: selectedUser?.school_site,
          matched_school_id: schoolId,
          matched_district_id: districtId,
          matched_state_id: stateId,
          confidence_score: confidence,
          migration_type: confidence >= 0.95 ? 'auto' : 'admin_approved',
          migrated_by: currentUser?.id,
          notes
        });

      if (logError) throw logError;

      // Refresh data
      await loadInitialData();
      setReviewDialogOpen(false);
      setSelectedUser(null);
      setSuggestedMatches([]);
    } catch (error) {
      console.error('Error approving migration:', error);
    } finally {
      setProcessing(false);
    }
  };

  const filteredUsers = unmigratedUsers.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.school_site?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.school_district?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">School Migration Dashboard</h1>
        <p className="text-gray-600">
          Migrate users from text-based school entries to structured school IDs
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Migrated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.migrated_users || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Unmigrated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats?.unmigrated_users || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {stats?.migration_percentage || 0}%
            </div>
            <Progress value={stats?.migration_percentage || 0} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Review</TabsTrigger>
          <TabsTrigger value="batch">Batch Processing</TabsTrigger>
          <TabsTrigger value="logs">Migration Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by school, district, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                    icon={<Search className="h-4 w-4" />}
                  />
                </div>
                <Select
                  value={selectedState}
                  onValueChange={(value) => {
                    setSelectedState(value);
                    loadDistricts(value);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {states.map(state => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {districts.length > 0 && (
                  <Select
                    value={selectedDistrict}
                    onValueChange={setSelectedDistrict}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Districts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Districts</SelectItem>
                      {districts.map(district => (
                        <SelectItem key={district.id} value={district.id}>
                          {district.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  onClick={loadInitialData}
                  variant="outline"
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <CardTitle>Unmigrated Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">User</th>
                      <th className="text-left py-2">School Site</th>
                      <th className="text-left py-2">School District</th>
                      <th className="text-left py-2">Created</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map(user => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="py-2">
                          <div>
                            <div className="font-medium">{user.display_name}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </td>
                        <td className="py-2">{user.school_site}</td>
                        <td className="py-2">{user.school_district}</td>
                        <td className="py-2 text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          <Button
                            size="sm"
                            onClick={() => findMatchesForUser(user)}
                            disabled={processing}
                          >
                            Find Matches
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <div className="text-sm text-gray-500">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                    {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of{' '}
                    {filteredUsers.length} users
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batch">
          <BatchProcessingPanel
            unmigratedUsers={unmigratedUsers}
            onProcessComplete={loadInitialData}
          />
        </TabsContent>

        <TabsContent value="logs">
          <MigrationLogsPanel />
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {selectedUser && (
        <MigrationReviewDialog
          open={reviewDialogOpen}
          onClose={() => {
            setReviewDialogOpen(false);
            setSelectedUser(null);
            setSuggestedMatches([]);
          }}
          user={selectedUser}
          matches={suggestedMatches}
          onApprove={approveMigration}
        />
      )}
    </div>
  );
}

function MigrationLogsPanel() {
  const supabase = createClientComponentClient();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('school_migration_log')
        .select(`
          *,
          profile:profiles!profile_id(email, display_name),
          migrator:profiles!migrated_by(email, display_name)
        `)
        .order('migrated_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const exportLogs = () => {
    const csv = [
      ['Date', 'User', 'Original School', 'Original District', 'Matched School ID', 'Confidence', 'Type', 'Migrated By'],
      ...logs.map(log => [
        new Date(log.migrated_at).toISOString(),
        log.profile?.email,
        log.original_school,
        log.original_district,
        log.matched_school_id,
        log.confidence_score,
        log.migration_type,
        log.migrator?.email
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) return <div>Loading logs...</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Migration Logs</CardTitle>
        <Button onClick={exportLogs} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">User</th>
                <th className="text-left py-2">Original School</th>
                <th className="text-left py-2">Confidence</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Migrated By</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 text-sm">
                    {new Date(log.migrated_at).toLocaleString()}
                  </td>
                  <td className="py-2">
                    <div className="text-sm">
                      <div>{log.profile?.display_name}</div>
                      <div className="text-gray-500">{log.profile?.email}</div>
                    </div>
                  </td>
                  <td className="py-2 text-sm">
                    <div>{log.original_school}</div>
                    <div className="text-gray-500">{log.original_district}</div>
                  </td>
                  <td className="py-2">
                    <Badge variant={
                      log.confidence_score >= 0.95 ? 'success' :
                      log.confidence_score >= 0.8 ? 'warning' : 'secondary'
                    }>
                      {Math.round(log.confidence_score * 100)}%
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant="outline">{log.migration_type}</Badge>
                  </td>
                  <td className="py-2 text-sm">
                    {log.migrator?.email}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}