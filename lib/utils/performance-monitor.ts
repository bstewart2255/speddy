export class PerformanceMonitor {
  private static measurements: Map<string, number[]> = new Map();
  private static enabled = true;

  static start(label: string): () => void {
    if (!this.enabled) {
      return () => {};
    }

    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (!this.measurements.has(label)) {
        this.measurements.set(label, []);
      }
      
      this.measurements.get(label)!.push(duration);
      
      // Log if over threshold
      if (duration > 100) {
        console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms`);
      }
    };
  }

  static measure<T>(label: string, fn: () => T): T {
    const end = this.start(label);
    try {
      const result = fn();
      return result;
    } finally {
      end();
    }
  }

  static async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const end = this.start(label);
    try {
      const result = await fn();
      return result;
    } finally {
      end();
    }
  }

  static getStats(label: string): { 
    count: number; 
    avg: number; 
    min: number; 
    max: number; 
    total: number; 
  } | null {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const total = measurements.reduce((sum, val) => sum + val, 0);
    const avg = total / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);

    return { count: measurements.length, avg, min, max, total };
  }

  static logAllStats(): void {
    console.log('=== Performance Statistics ===');
    for (const [label, measurements] of this.measurements) {
      const stats = this.getStats(label);
      if (stats) {
        console.log(`${label}:`, {
          count: stats.count,
          avg: `${stats.avg.toFixed(2)}ms`,
          min: `${stats.min.toFixed(2)}ms`,
          max: `${stats.max.toFixed(2)}ms`,
          total: `${stats.total.toFixed(2)}ms`
        });
      }
    }
  }

  static clear(): void {
    this.measurements.clear();
  }

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}