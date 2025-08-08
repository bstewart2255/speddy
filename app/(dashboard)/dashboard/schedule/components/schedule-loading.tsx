'use client';

import React from 'react';

export function ScheduleLoading() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="h-9 w-48 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-5 w-72 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="flex gap-3">
              <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Controls skeleton */}
        <div className="mb-4 bg-white rounded-lg shadow-sm p-4">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Grade levels skeleton */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="flex gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-8 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Schedule grid skeleton */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Grid header */}
          <div className="grid grid-cols-6 bg-gray-50 border-b">
            <div className="p-3 border-r">
              <div className="h-5 w-12 bg-gray-200 rounded animate-pulse mx-auto" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 border-r last:border-r-0">
                <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mx-auto" />
              </div>
            ))}
          </div>

          {/* Grid body */}
          <div className="grid grid-cols-6">
            <div className="border-r">
              {[...Array(15)].map((_, i) => (
                <div key={i} className="h-20 border-b p-2">
                  <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
            {[...Array(5)].map((_, dayIndex) => (
              <div key={dayIndex} className="border-r last:border-r-0">
                {[...Array(15)].map((_, timeIndex) => (
                  <div key={timeIndex} className="h-20 border-b relative">
                    {/* Random session placeholders */}
                    {Math.random() > 0.7 && (
                      <div 
                        className="absolute bg-gray-200 rounded animate-pulse"
                        style={{
                          top: `${Math.random() * 10}px`,
                          left: '2px',
                          right: '2px',
                          height: `${40 + Math.random() * 40}px`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="mt-4 flex justify-between items-center">
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-36 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}