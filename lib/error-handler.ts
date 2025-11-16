import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

// Type for Supabase/PostgrestError
interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

// Error types
export enum ErrorCode {
  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  NOT_FOUND = 'NOT_FOUND',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  STRIPE_ERROR = 'STRIPE_ERROR',
  SUPABASE_ERROR = 'SUPABASE_ERROR',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Generic errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error response interface
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

// Central error handler for API routes
export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', error);
  }

  // Handle known AppError instances
  if (error instanceof AppError) {
    // Log to Sentry if not operational
    if (!error.isOperational) {
      Sentry.captureException(error, {
        tags: {
          errorCode: error.code,
          statusCode: error.statusCode,
        },
        extra: {
          details: error.details,
        },
      });
    }

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: process.env.NODE_ENV === 'development' ? error.details : undefined,
        },
        timestamp: new Date().toISOString(),
      },
      { status: error.statusCode }
    );
  }

  // Handle Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    const supabaseError = error as SupabaseErrorLike;

    // Map common Supabase error codes
    let statusCode = 500;
    let errorCode = ErrorCode.SUPABASE_ERROR;
    
    switch (supabaseError.code) {
      case '23505': // Unique constraint violation
        statusCode = 409;
        errorCode = ErrorCode.DUPLICATE_ENTRY;
        break;
      case 'PGRST116': // No rows found
        statusCode = 404;
        errorCode = ErrorCode.NOT_FOUND;
        break;
      case '42501': // Insufficient privileges
        statusCode = 403;
        errorCode = ErrorCode.FORBIDDEN;
        break;
    }

    // Log to Sentry
    Sentry.captureException(error, {
      tags: {
        errorType: 'supabase',
        errorCode: supabaseError.code,
      },
    });

    return NextResponse.json(
      {
        error: {
          code: errorCode,
          message: supabaseError.message || 'Database operation failed',
          details: process.env.NODE_ENV === 'development' ? supabaseError : undefined,
        },
        timestamp: new Date().toISOString(),
      },
      { status: statusCode }
    );
  }

  // Handle unknown errors
  const unknownError = error instanceof Error ? error : new Error('Unknown error occurred');
  
  // Always log unknown errors to Sentry
  Sentry.captureException(unknownError);

  return NextResponse.json(
    {
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred' 
          : unknownError.message,
        details: process.env.NODE_ENV === 'development' ? unknownError.stack : undefined,
      },
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}

// Async error wrapper for API routes
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  }) as T;
}

// Client-side error handler
export function handleClientError(error: unknown, context?: string): void {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`Client Error${context ? ` in ${context}` : ''}:`, error);
  }

  // Send to Sentry
  Sentry.captureException(error, {
    tags: {
      errorLocation: 'client',
      context,
    },
  });
}

// Common error factories
export const ErrorFactory = {
  unauthorized: (message = 'Unauthorized access') => 
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),
    
  forbidden: (message = 'Access forbidden') => 
    new AppError(ErrorCode.FORBIDDEN, message, 403),
    
  notFound: (resource: string) => 
    new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404),
    
  validationError: (message: string, details?: any) => 
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, true, details),
    
  databaseError: (message: string, details?: any) => 
    new AppError(ErrorCode.DATABASE_ERROR, message, 500, false, details),
    
  rateLimitExceeded: (message = 'Rate limit exceeded') => 
    new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429),
    
  internalError: (message = 'Internal server error', details?: any) => 
    new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500, false, details),
};