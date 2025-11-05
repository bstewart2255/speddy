import { log } from './logger';

export interface PerformanceThresholds {
  warning: number;
  critical: number;
}

export const PERFORMANCE_THRESHOLDS = {
  api: {
    warning: 1000,  // 1 second
    critical: 5000  // 5 seconds
  },
  database: {
    warning: 500,   // 500ms
    critical: 2000  // 2 seconds
  },
  render: {
    warning: 100,   // 100ms
    critical: 500   // 500ms
  },
  storage: {
    warning: 2000,  // 2 seconds
    critical: 10000 // 10 seconds
  }
} as const;

export function checkPerformanceThreshold(
  operationType: keyof typeof PERFORMANCE_THRESHOLDS,
  duration: number,
  operationName: string,
  metadata?: Record<string, any>
): void {
  const thresholds = PERFORMANCE_THRESHOLDS[operationType];
  
  if (duration >= thresholds.critical) {
    log.error(`Critical performance threshold exceeded: ${operationName}`, null, {
      duration: Math.round(duration),
      threshold: thresholds.critical,
      operationType,
      ...metadata
    });
  } else if (duration >= thresholds.warning) {
    log.warn(`Performance warning: ${operationName}`, {
      duration: Math.round(duration),
      threshold: thresholds.warning,
      operationType,
      ...metadata
    });
  }
}

export function measurePerformanceWithAlerts(
  operationName: string,
  operationType: keyof typeof PERFORMANCE_THRESHOLDS
) {
  const startTime = performance.now();

  return {
    end: (metadata?: Record<string, any>) => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      log.info(`Performance: ${operationName}`, {
        duration: Math.round(duration),
        operationType,
        ...metadata
      });

      checkPerformanceThreshold(operationType, duration, operationName, metadata);

      return duration;
    }
  };
}

export async function measureAsyncWithAlerts<T>(
  operationName: string,
  operationType: keyof typeof PERFORMANCE_THRESHOLDS,
  operation: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const perf = measurePerformanceWithAlerts(operationName, operationType);

  try {
    const result = await operation();
    perf.end({ ...metadata, success: true });
    return result;
  } catch (error) {
    perf.end({ ...metadata, success: false, error: true });
    throw error;
  }
}