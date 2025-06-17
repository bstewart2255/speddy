import { StatCard } from '../../components/ui/stats';
import { StatsGrid, StudentStats, SessionStats, CompletionStats } from '../../components/ui/stats';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { TeamWidget } from '../../components/team-widget'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Welcome to your IEP scheduling platform</p>
        </div>

        {/* Main Content Area */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <TeamWidget />
        </div>

      </div>
    </div>
  );
}