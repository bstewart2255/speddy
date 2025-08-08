'use client';

import React, { useState, useEffect } from 'react';
import { usePerformanceMetrics } from '../../../lib/hooks/use-performance-metrics';

interface PerformanceMonitorProps {
  componentName: string;
  showInProduction?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function PerformanceMonitor({ 
  componentName, 
  showInProduction = false,
  position = 'bottom-right' 
}: PerformanceMonitorProps) {
  const { metrics, performanceScore } = usePerformanceMetrics(componentName);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show in development by default
    if (process.env.NODE_ENV === 'development' || showInProduction) {
      setIsVisible(true);
    }
  }, [showInProduction]);

  if (!isVisible) return null;

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getPerformanceLabel = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div 
          className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between cursor-pointer"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getScoreColor(performanceScore)} bg-current animate-pulse`} />
            <span className="text-xs font-medium text-gray-700">
              Performance Monitor
            </span>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            {isMinimized ? '▲' : '▼'}
          </button>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Component:</span>
              <span className="font-mono text-gray-900">{componentName}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Score:</span>
              <span className={`font-semibold ${getScoreColor(performanceScore)}`}>
                {performanceScore}/100 ({getPerformanceLabel(performanceScore)})
              </span>
            </div>

            <div className="border-t pt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Render Time:</span>
                <span className="font-mono text-gray-900">
                  {metrics.current.renderTime.toFixed(2)}ms
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Avg Time:</span>
                <span className="font-mono text-gray-900">
                  {metrics.current.averageRenderTime.toFixed(2)}ms
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Peak Time:</span>
                <span className="font-mono text-gray-900">
                  {metrics.current.peakRenderTime.toFixed(2)}ms
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Render Count:</span>
                <span className="font-mono text-gray-900">
                  {metrics.current.renderCount}
                </span>
              </div>

              {metrics.current.memoryUsage && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Memory:</span>
                  <span className="font-mono text-gray-900">
                    {metrics.current.memoryUsage.toFixed(1)}MB
                  </span>
                </div>
              )}
            </div>

            {/* Performance Tips */}
            {performanceScore < 70 && (
              <div className="border-t pt-2">
                <div className="text-xs text-orange-600">
                  ⚠️ Performance could be improved
                </div>
                <ul className="mt-1 text-xs text-gray-600 space-y-1">
                  {metrics.current.averageRenderTime > 33 && (
                    <li>• Consider memoization</li>
                  )}
                  {metrics.current.renderCount > 10 && (
                    <li>• Too many re-renders detected</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}