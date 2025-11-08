"use client";

import { WeeklyView } from "../../../components/weekly-view";
import { TodoWidget } from "../../../components/todo-widget";
import { ToastProvider } from "../../../contexts/toast-context";
import { OnboardingNotifications } from "../../../components/onboarding/onboarding-notifications";

export default function SEADashboard() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          </div>

          {/* Onboarding Notifications */}
          <OnboardingNotifications />

          {/* Main Content Area */}
          <div className="space-y-4">
            <WeeklyView viewMode="provider" />

            <TodoWidget />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}