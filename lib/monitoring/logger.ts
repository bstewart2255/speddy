// lib/monitoring/logger.ts
interface LogContext {
  userId?: string;
  school?: string;
  [key: string]: any;
}

export const log = {
  error: (message: string, error: unknown, context?: LogContext) => {
    const errorObj = error as Error;
    const errorMessage = `${message}: ${errorObj?.message || String(error)}`;
    
    // Log the error message first (for Next.js console interceptor)
    console.error(errorMessage);
    
    // Then log the detailed object
    if (process.env.NODE_ENV === 'development') {
      console.error({
        timestamp: new Date().toISOString(),
        level: 'error',
        message,
        error: errorObj?.message || String(error),
        stack: errorObj?.stack,
        context,
        userId: context?.userId,
        school: context?.school
      });
    }
  },

  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log({
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        data
      });
    }
  },

  warn: (message: string, data?: any) => {
    console.warn({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      data
    });
  }
};

// Debug utilities for development
export const debug = {
  table: (label: string, data: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔍 ${label}`);
      console.table(data);
      console.groupEnd();
    }
  },

  time: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(label);
    }
  }
};