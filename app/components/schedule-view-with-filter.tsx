"use client";

import React, { useState } from 'react';
import { WeeklyView } from './weekly-view';

export function ScheduleViewWithFilter() {
  const [viewMode, setViewMode] = useState<'provider' | 'sea'>('provider');

  return (
    <div className="space-y-4">
      {/* Filter Toggle */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Today's Schedule</h2>

          {/* Toggle Buttons */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('provider')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'provider'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Me
            </button>
            <button
              onClick={() => setViewMode('sea')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'sea'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              SEA
            </button>
          </div>
        </div>

        {/* Show who's schedule is being viewed */}
        <p className="text-sm text-gray-600">
          {viewMode === 'provider' 
            ? "Showing sessions you will deliver" 
            : "Showing sessions assigned to SEAs"}
        </p>
      </div>

      {/* Schedule View */}
      <WeeklyView viewMode={viewMode} />
    </div>
  );
}