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
    // Ensure we always return a proper Error object
    let errorObj: Error;
    if (error instanceof Error) {
      errorObj = error;
    } else if (typeof error === 'string') {
      errorObj = new Error(error);
    } else if (error && typeof error === 'object' && 'message' in error) {
      const rawMessage = (error as { message?: unknown }).message;
      let message: string;
      if (typeof rawMessage === 'string') {
        message = rawMessage;
      } else if (rawMessage != null) {
        try {
          message = JSON.stringify(rawMessage);
        } catch {
          message = 'Unknown database error';
        }
      } else {
        message = 'Unknown database error';
      }
      errorObj = new Error(message);
      // Preserve any additional properties
      Object.assign(errorObj, error);
    } else {
      errorObj = new Error('Unknown database error');
    }

    // Check if this is a user validation error (duplicate key, foreign key violations)
    // These are expected errors that don't need error-level logging
    const isUserValidationError =
      errorObj.message?.includes('duplicate key') ||
      errorObj.message?.includes('violates foreign key constraint') ||
      errorObj.message?.includes('violates check constraint');

    // Only log system/unexpected errors, not user validation errors
    if (!isUserValidationError) {
      log.error(`Database operation failed: ${context.operation}`, error, context);
    }

    return {
      data: null,
      error: errorObj
    };
  }
}