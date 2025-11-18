'use client';

import React from 'react';
import { log } from '@/lib/monitoring/logger';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

// Next.js error object may include digest for tracking
interface ErrorWithDigest extends Error {
  digest?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void; errorInfo?: React.ErrorInfo }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class DashboardErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error with context
    log.error('Dashboard Error Boundary caught error', error, {
      componentStack: errorInfo.componentStack,
      digest: (error as ErrorWithDigest).digest,
      location: window.location.href,
      userAgent: navigator.userAgent
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Store errorInfo in state for detailed error display
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      const Fallback = this.props.fallback || DashboardErrorFallback;
      return (
        <Fallback 
          error={this.state.error!} 
          reset={this.handleReset}
          errorInfo={this.state.errorInfo}
        />
      );
    }

    return this.props.children;
  }
}

function DashboardErrorFallback({ 
  error, 
  reset, 
  errorInfo 
}: { 
  error: Error; 
  reset: () => void; 
  errorInfo?: React.ErrorInfo;
}) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 space-y-6">
        {/* Error Icon and Title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Oops! Something went wrong
          </h1>
          <p className="text-gray-600">
            We encountered an unexpected error while loading this page.
          </p>
        </div>

        {/* Error Details (only in development) */}
        {isDevelopment && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h3 className="font-medium text-gray-900">Error Details:</h3>
            <p className="text-sm text-red-600 font-mono break-all">
              {error.message}
            </p>
            {errorInfo && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                  Component Stack
                </summary>
                <pre className="mt-2 text-xs text-gray-600 overflow-auto max-h-40 p-2 bg-white rounded">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          
          <Link
            href="/dashboard"
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* Support Link */}
        <div className="text-center text-sm text-gray-600">
          <p>
            If this problem persists, please{' '}
            <a href="mailto:support@example.com" className="text-blue-600 hover:text-blue-700">
              contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// Async Error Boundary for handling promise rejections
export function AsyncErrorBoundary({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      log.error('Unhandled promise rejection in dashboard', event.reason, {
        promise: event.promise,
        location: window.location.href
      });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}