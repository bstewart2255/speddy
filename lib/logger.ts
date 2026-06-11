import * as Sentry from '@sentry/nextjs';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

class Logger {
  private context: LogContext = {};

  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
    // Context is retained for console output (Vercel logs) only. It is
    // intentionally NOT pushed to Sentry (no Sentry.setContext): a LogContext
    // is free-form and can carry student PII. See SPE-167.
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(this.context).length
      ? ` [${JSON.stringify(this.context)}]`
      : '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';

    return `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${message}${metaStr}`;
  }

  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, meta));
    }
  }

  info(message: string, meta?: any) {
    console.info(this.formatMessage(LogLevel.INFO, message, meta));

    // Breadcrumb trail to Sentry uses the developer-authored `message` only —
    // never `meta`, which can carry student PII (SPE-167).
    Sentry.addBreadcrumb({
      message,
      level: 'info',
    });
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage(LogLevel.WARN, message, meta));

    // Breadcrumb trail to Sentry uses the developer-authored `message` only —
    // never `meta`, which can carry student PII (SPE-167).
    Sentry.addBreadcrumb({
      message,
      level: 'warning',
    });
  }

  error(message: string, error?: unknown, meta?: any) {
    // Full message + meta + context go to the console (Vercel logs) only.
    console.error(this.formatMessage(LogLevel.ERROR, message, meta), error);

    // To Sentry we send the exception (stack trace) and the developer-authored
    // `message` only — never `meta`/`context`, which can carry student PII (SPE-167).
    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: {
          message,
        },
      });
    } else {
      // No Error instance to capture. Record the value's *type* only — never the
      // value itself, which can carry student PII — so Sentry can distinguish a
      // missing error from a non-Error rejection reason (SPE-167).
      Sentry.captureMessage(message, {
        level: 'error',
        extra: { errorType: typeof error },
      });
    }
  }

  // Create a child logger with additional context
  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();

// Helper for creating request-scoped loggers
export function createRequestLogger(requestId: string, userId?: string): Logger {
  return logger.child({ requestId, userId });
}
