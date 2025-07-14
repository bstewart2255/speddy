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
    return { 
      data: null, 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
}