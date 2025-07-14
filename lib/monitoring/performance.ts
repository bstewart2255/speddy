// lib/monitoring/performance.ts
import { log } from './logger';

interface PerformanceMetadata {
  [key: string]: any;
}

export function measurePerformance(operationName: string) {
  const startTime = performance.now();

  return {
    end: (metadata?: PerformanceMetadata) => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      log.info(`Performance: ${operationName}`, {
        duration: Math.round(duration),
        ...metadata
      });

      // Alert on slow operations
      if (duration > 3000) {
        log.warn(`Slow operation detected: ${operationName}`, {
          duration: Math.round(duration),
          ...metadata
        });
      }

      return duration;
    }
  };
}

// Utility to measure async operations
export async function measureAsync<T>(
  operationName: string,
  operation: () => Promise<T>,
  metadata?: PerformanceMetadata
): Promise<T> {
  const perf = measurePerformance(operationName);

  try {
    const result = await operation();
    perf.end({ ...metadata, success: true });
    return result;
  } catch (error) {
    perf.end({ ...metadata, success: false, error: true });
    throw error;
  }
}