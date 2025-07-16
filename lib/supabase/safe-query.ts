// lib/supabase/safe-query.ts
import { log } from '@/lib/monitoring/logger';

interface SafeQueryResult<T> {
  data: T | null;
  error: Error | null;
}

interface QueryContext {
  operation: string;
  userId?: string;
  [key: string]: any;
}

export async function safeQuery<T>(
  queryFn: () => Promise<T>,
  context: QueryContext
): Promise<SafeQueryResult<T>> {
  try {
    const data = await queryFn();
    return { data, error: null };
  } catch (error) {
    log.error(`Database operation failed: ${context.operation}`, error, context);
    
    // Ensure we always return a proper Error object
    let errorObj: Error;
    if (error instanceof Error) {
      errorObj = error;
    } else if (typeof error === 'string') {
      errorObj = new Error(error);
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorObj = new Error(error.message);
      // Preserve any additional properties
      Object.assign(errorObj, error);
    } else {
      errorObj = new Error('Unknown database error');
    }
    
    return { 
      data: null, 
      error: errorObj
    };
  }
}