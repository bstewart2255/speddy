import { StatCard } from '../../components/ui/stats';
import { StatsGrid, StudentStats, SessionStats, CompletionStats } from '../../components/ui/stats';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your caseload overview.</p>
        </div>

        {/* Stats Overview */}
        <div className="mb-8">
          <StatsGrid columns={4}>
            <StudentStats totalStudents={24} newThisWeek={3} />
            <SessionStats scheduledSessions={67} totalRequired={75} />
            <CompletionStats completionPercentage={89} />
            <StatCard
              title="Unscheduled Sessions"
              value={12}
              description="Need to be placed"
              variant="warning"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </StatsGrid>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">+ Add Student</Button>
                <Button variant="secondary">Import CSV</Button>
                <Button variant="secondary">View Schedule</Button>
                <Button variant="secondary">Export Reports</Button>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">Added student JM to Tuesday 10:00 AM</div>
                    <div className="text-sm text-gray-500">2 minutes ago</div>
                  </div>
                  <div className="text-green-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">Updated bell schedule for Period 3</div>
                    <div className="text-sm text-gray-500">1 hour ago</div>
                  </div>
                  <div className="text-blue-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">Imported 5 new students from CSV</div>
                    <div className="text-sm text-gray-500">Yesterday</div>
                  </div>
                  <div className="text-purple-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

      </div>
    </div>
  );
}