import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // After Sentry is initialised, so a failure here can actually raise an
    // event. Imported dynamically and only on the nodejs runtime: the check
    // reaches Node crypto, which the edge bundle has no business pulling in.
    // Says once per cold start whether this build can encrypt SIS credentials —
    // the deploy-time signal whose absence let SPE-417 run until a district
    // hit it. Never throws; see lib/sis/key-boot-check.ts.
    const { reportSisKeyStatusOnBoot } = await import('./lib/sis/key-boot-check');
    reportSisKeyStatusOnBoot();
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
