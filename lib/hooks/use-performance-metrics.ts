'use client';

import { useEffect, useRef, useState } from 'react';

// Chrome-specific performance.memory API
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

interface PerformanceMetrics {
  renderTime: number;
  renderCount: number;
  averageRenderTime: number;
  peakRenderTime: number;
  componentName: string;
  timestamp: number;
  memoryUsage?: number;
}

interface PerformanceReport {
  current: PerformanceMetrics;
  history: PerformanceMetrics[];
  improvements?: {
    renderTimeReduction: number;
    renderCountReduction: number;
  };
}

export function usePerformanceMetrics(componentName: string) {
  const renderStartTime = useRef<number>(performance.now());
  const renderCount = useRef<number>(0);
  const renderTimes = useRef<number[]>([]);
  const [metrics, setMetrics] = useState<PerformanceReport>({
    current: {
      renderTime: 0,
      renderCount: 0,
      averageRenderTime: 0,
      peakRenderTime: 0,
      componentName,
      timestamp: Date.now(),
    },
    history: [],
  });

  useEffect(() => {
    renderCount.current += 1;
    const renderTime = performance.now() - renderStartTime.current;
    renderTimes.current.push(renderTime);

    // Get memory usage if available
    let memoryUsage: number | undefined;
    if ('memory' in performance) {
      const perfWithMemory = performance as PerformanceWithMemory;
      memoryUsage = perfWithMemory.memory?.usedJSHeapSize ? perfWithMemory.memory.usedJSHeapSize / 1048576 : undefined; // Convert to MB
    }

    const averageRenderTime = 
      renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
    
    const peakRenderTime = Math.max(...renderTimes.current);

    const currentMetrics: PerformanceMetrics = {
      renderTime,
      renderCount: renderCount.current,
      averageRenderTime,
      peakRenderTime,
      componentName,
      timestamp: Date.now(),
      memoryUsage,
    };

    setMetrics(prev => ({
      current: currentMetrics,
      history: [...prev.history, currentMetrics].slice(-100), // Keep last 100 measurements
    }));

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${componentName}:`, {
        renderTime: `${renderTime.toFixed(2)}ms`,
        renderCount: renderCount.current,
        averageRenderTime: `${averageRenderTime.toFixed(2)}ms`,
        peakRenderTime: `${peakRenderTime.toFixed(2)}ms`,
        memoryUsage: memoryUsage ? `${memoryUsage.toFixed(2)}MB` : 'N/A',
      });
    }

    renderStartTime.current = performance.now();
  }, [componentName]);

  const getPerformanceScore = (): number => {
    // Score based on average render time
    // Excellent: < 16ms (60fps), Good: < 33ms (30fps), Poor: > 33ms
    const avg = metrics.current.averageRenderTime;
    if (avg < 16) return 100;
    if (avg < 33) return 75;
    if (avg < 50) return 50;
    return 25;
  };

  const compareWithBaseline = (baselineMetrics: PerformanceMetrics) => {
    const improvements = {
      renderTimeReduction: 
        ((baselineMetrics.averageRenderTime - metrics.current.averageRenderTime) / 
          baselineMetrics.averageRenderTime) * 100,
      renderCountReduction:
        ((baselineMetrics.renderCount - metrics.current.renderCount) / 
          baselineMetrics.renderCount) * 100,
    };

    return {
      ...metrics,
      improvements,
    };
  };

  return {
    metrics,
    performanceScore: getPerformanceScore(),
    compareWithBaseline,
  };
}