'use client';

import React, { Profiler, ProfilerOnRenderCallback, useState } from 'react';

interface ProfileMetrics {
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  interactions?: Set<any>;
}

interface PerformanceProfilerProps {
  children: React.ReactNode;
  id: string;
  onMetricsCollected?: (metrics: ProfileMetrics) => void;
}

export function PerformanceProfiler({ 
  children, 
  id,
  onMetricsCollected 
}: PerformanceProfilerProps) {
  const [profileData, setProfileData] = useState<ProfileMetrics[]>([]);

  const onRender = (
    id: string,
    phase: 'mount' | 'update' | 'nested-update',
    actualDuration: number,
    baseDuration: number,
    startTime: number,
    commitTime: number
  ) => {
    const metrics: ProfileMetrics = {
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime
    };

    setProfileData(prev => [...prev, metrics].slice(-50)); // Keep last 50 measurements

    if (onMetricsCollected) {
      onMetricsCollected(metrics);
    }

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Profiler] ${id} (${phase}):`, {
        actualDuration: `${actualDuration.toFixed(2)}ms`,
        baseDuration: `${baseDuration.toFixed(2)}ms`,
        efficiency: `${((baseDuration / actualDuration) * 100).toFixed(0)}%`,
      });
    }
  };

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

// Hook to use profiler data
export function useProfilerData() {
  const [metrics, setMetrics] = useState<Map<string, ProfileMetrics[]>>(new Map());

  const collectMetrics = (componentId: string) => (data: ProfileMetrics) => {
    setMetrics(prev => {
      const updated = new Map(prev);
      const existing = updated.get(componentId) || [];
      updated.set(componentId, [...existing, data].slice(-100));
      return updated;
    });
  };

  const getAverageMetrics = (componentId: string) => {
    const data = metrics.get(componentId) || [];
    if (data.length === 0) return null;

    const avgActual = data.reduce((sum, m) => sum + m.actualDuration, 0) / data.length;
    const avgBase = data.reduce((sum, m) => sum + m.baseDuration, 0) / data.length;
    const mountCount = data.filter(m => m.phase === 'mount').length;
    const updateCount = data.filter(m => m.phase === 'update').length;

    return {
      averageActualDuration: avgActual,
      averageBaseDuration: avgBase,
      efficiency: (avgBase / avgActual) * 100,
      mountCount,
      updateCount,
      totalRenders: data.length,
    };
  };

  const compareComponents = (componentA: string, componentB: string) => {
    const metricsA = getAverageMetrics(componentA);
    const metricsB = getAverageMetrics(componentB);

    if (!metricsA || !metricsB) return null;

    return {
      renderTimeImprovement: 
        ((metricsA.averageActualDuration - metricsB.averageActualDuration) / 
          metricsA.averageActualDuration) * 100,
      efficiencyImprovement:
        metricsB.efficiency - metricsA.efficiency,
      renderCountDifference:
        metricsA.totalRenders - metricsB.totalRenders,
    };
  };

  return {
    collectMetrics,
    getAverageMetrics,
    compareComponents,
    allMetrics: metrics,
  };
}