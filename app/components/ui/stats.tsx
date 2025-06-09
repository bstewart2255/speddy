import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  description, 
  trend, 
  icon, 
  variant = 'default',
  className = '' 
}: StatCardProps) {
  const variantClasses = {
    default: 'bg-white border-gray-200',
    primary: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-orange-50 border-orange-200',
    danger: 'bg-red-50 border-red-200',
  };

  const valueColors = {
    default: 'text-gray-900',
    primary: 'text-blue-600',
    success: 'text-green-600',
    warning: 'text-orange-600',
    danger: 'text-red-600',
  };

  return (
    <div className={`${variantClasses[variant]} border rounded-lg p-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${valueColors[variant]} mb-1`}>{value}</p>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
          {trend && (
            <div className={`flex items-center mt-2 text-sm ${
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            }`}>
              <svg
                className={`w-4 h-4 mr-1 ${!trend.isPositive ? 'rotate-180' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              {Math.abs(trend.value)}% {trend.label || 'from last period'}
            </div>
          )}
        </div>
        {icon && (
          <div className={`ml-4 p-3 rounded-lg ${
            variant === 'default' ? 'bg-gray-100 text-gray-600' : 
            variant === 'primary' ? 'bg-blue-100 text-blue-600' :
            variant === 'success' ? 'bg-green-100 text-green-600' :
            variant === 'warning' ? 'bg-orange-100 text-orange-600' :
            'bg-red-100 text-red-600'
          }`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatsGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function StatsGrid({ children, columns = 4, className = '' }: StatsGridProps) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${columnClasses[columns]} gap-6 ${className}`}>
      {children}
    </div>
  );
}

// Specialized stat cards for the IEP Scheduler
interface StudentStatsProps {
  totalStudents: number;
  newThisWeek?: number;
}

export function StudentStats({ totalStudents, newThisWeek }: StudentStatsProps) {
  return (
    <StatCard
      title="Total Students"
      value={totalStudents}
      description="In your caseload"
      trend={newThisWeek ? { value: newThisWeek, isPositive: true, label: 'new this week' } : undefined}
      variant="primary"
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      }
    />
  );
}

interface SessionStatsProps {
  scheduledSessions: number;
  totalRequired: number;
}

export function SessionStats({ scheduledSessions, totalRequired }: SessionStatsProps) {
  const completionPercentage = Math.round((scheduledSessions / totalRequired) * 100);
  const isGood = completionPercentage >= 90;

  return (
    <StatCard
      title="Sessions This Week"
      value={scheduledSessions}
      description={`${completionPercentage}% of required sessions`}
      variant={isGood ? 'success' : 'warning'}
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      }
    />
  );
}

interface CompletionStatsProps {
  completionPercentage: number;
}

export function CompletionStats({ completionPercentage }: CompletionStatsProps) {
  const variant = completionPercentage >= 90 ? 'success' : completionPercentage >= 70 ? 'warning' : 'danger';

  return (
    <StatCard
      title="Schedule Complete"
      value={`${completionPercentage}%`}
      description="Of weekly requirements"
      variant={variant}
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      }
    />
  );
}