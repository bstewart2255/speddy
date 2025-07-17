export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    
    // Only initialize Sentry in production
    if (process.env.NODE_ENV === 'production') {
      init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 1.0,
        debug: false,
        
        // Capture unhandled promise rejections
        integrations: [
          // @ts-ignore
          init.captureConsoleIntegration?.({
            levels: ['error', 'warn'],
          }),
        ].filter(Boolean),
        
        beforeSend(event, hint) {
          // Don't send errors in development
          if (process.env.NODE_ENV === 'development') {
            return null;
          }
          
          // Add server context
          event.contexts = {
            ...event.contexts,
            runtime: {
              name: 'node',
              version: process.version,
            },
          };
          
          return event;
        },
      });
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { init } = await import('@sentry/nextjs');
    
    // Only initialize Sentry in production
    if (process.env.NODE_ENV === 'production') {
      init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 1.0,
        debug: false,
        environment: 'edge',
      });
    }
  }
}