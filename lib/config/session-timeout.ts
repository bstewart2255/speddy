// Helper to parse and validate positive integer environment variables
function parsePositiveIntEnv(envVar: string | undefined, defaultValue: number): number {
  const parsed = parseInt(envVar ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

// Session timeout configuration
export const SESSION_CONFIG = {
  // Default timeout: 45 minutes (in milliseconds)
  TIMEOUT_DURATION: parsePositiveIntEnv(process.env.NEXT_PUBLIC_SESSION_TIMEOUT, 2700000),
  
  // Warning time: 2 minutes before timeout (in milliseconds)
  WARNING_TIME: parsePositiveIntEnv(process.env.NEXT_PUBLIC_SESSION_WARNING_TIME, 120000),
  
  // Activities that should extend the session without user interaction
  KEEP_ALIVE_ACTIVITIES: [
    'ai-upload',
    'lesson-generation',
    'file-upload',
    'worksheet-generation',
  ] as const,

  // Routes that don't require timeout tracking
  EXEMPT_ROUTES: [
    '/login',
    '/signup', 
    '/forgot-password',
    '/reset-password',
    '/api',
    '/_next',
    '/favicon.ico',
  ] as const,

  // Minimum activity interval to prevent excessive updates
  ACTIVITY_THROTTLE: 30000, // 30 seconds
} as const;

export type KeepAliveActivity = typeof SESSION_CONFIG.KEEP_ALIVE_ACTIVITIES[number];

// Check if a route should be exempt from timeout tracking
export function isExemptRoute(pathname: string): boolean {
  return SESSION_CONFIG.EXEMPT_ROUTES.some(route => pathname.startsWith(route));
}

// Check if current activity should trigger keep-alive
export function shouldKeepAlive(activityType?: KeepAliveActivity): boolean {
  if (!activityType) return false;
  return SESSION_CONFIG.KEEP_ALIVE_ACTIVITIES.includes(activityType);
}