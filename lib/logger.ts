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
    Sentry.setContext('logger', this.context);
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
    
    // Send important info logs to Sentry as breadcrumbs
    Sentry.addBreadcrumb({
      message,
      level: 'info',
      data: meta,
    });
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage(LogLevel.WARN, message, meta));
    
    // Send warnings to Sentry as breadcrumbs
    Sentry.addBreadcrumb({
      message,
      level: 'warning',
      data: meta,
    });
  }

  error(message: string, error?: unknown, meta?: any) {
    const formattedMessage = this.formatMessage(LogLevel.ERROR, message, meta);
    console.error(formattedMessage, error);
    
    // Send errors to Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: {
          message,
          ...meta,
          context: this.context,
        },
      });
    } else {
      Sentry.captureMessage(formattedMessage, 'error');
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