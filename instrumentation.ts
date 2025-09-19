import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }

  // Development-only log filter to suppress HEAD /api spam from monitoring tools
  if (process.env.NODE_ENV === 'development') {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    // Filter out HEAD /api log entries in development
    const filterHeadApiLogs = (originalMethod: any) => {
      return (...args: any[]) => {
        const message = args.join(' ');
        // Suppress only HEAD /api logs to keep other important logs visible
        if (message.includes('HEAD /api')) {
          return; // Skip logging this line entirely
        }
        originalMethod.apply(console, args);
      };
    };

    console.log = filterHeadApiLogs(originalConsoleLog);
    console.error = filterHeadApiLogs(originalConsoleError);
    console.warn = filterHeadApiLogs(originalConsoleWarn);
  }
}

export const onRequestError = Sentry.captureRequestError;
