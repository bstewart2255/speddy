/**
 * Connectivity and Network Debugging Utilities
 * 
 * Enhanced debugging tools for QR upload connectivity issues.
 * Helps identify specific network failure points and provides 
 * better error reporting for "can't connect to server" scenarios.
 */

// Define NetworkInformation interface if not available
interface NetworkInformation {
  effectiveType?: string;
  type?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

// Extend Navigator interface for Network Information API
declare global {
  interface Navigator {
    connection?: NetworkInformation;
  }
}

export interface ConnectivityTestResult {
  isOnline: boolean;
  latency?: number;
  supabaseReachable?: boolean;
  apiReachable?: boolean;
  error?: string;
  networkType?: string;
  timestamp: string;
}

export interface DetailedNetworkError {
  type: 'network' | 'timeout' | 'cors' | 'rate_limit' | 'server' | 'unknown';
  message: string;
  userFriendlyMessage: string;
  retryable: boolean;
  details: {
    originalError: any;
    url?: string;
    statusCode?: number;
    networkInfo?: NetworkInformation;
    timestamp: string;
  };
}

/**
 * Test connectivity to essential services
 */
export async function testConnectivity(): Promise<ConnectivityTestResult> {
  const timestamp = new Date().toISOString();
  
  // Check basic online status
  const isOnline = navigator.onLine;
  
  if (!isOnline) {
    return {
      isOnline: false,
      error: 'Device is offline',
      timestamp
    };
  }

  const result: ConnectivityTestResult = {
    isOnline: true,
    timestamp
  };

  try {
    // Test API endpoint connectivity with timeout
    const apiStartTime = Date.now();
    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 5000);

    try {
      const apiResponse = await fetch('/api/health', {
        method: 'GET',
        signal: apiController.signal,
        cache: 'no-cache'
      });
      clearTimeout(apiTimeout);
      
      result.apiReachable = apiResponse.ok;
      result.latency = Date.now() - apiStartTime;
    } catch (apiError) {
      clearTimeout(apiTimeout);
      result.apiReachable = false;
      result.error = `API unreachable: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`;
    }

    // Test Supabase connectivity
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        const supabaseController = new AbortController();
        const supabaseTimeout = setTimeout(() => supabaseController.abort(), 5000);
        
        const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'HEAD',
          signal: supabaseController.signal,
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
          }
        });
        clearTimeout(supabaseTimeout);
        
        result.supabaseReachable = supabaseResponse.status < 500;
      }
    } catch (supabaseError) {
      result.supabaseReachable = false;
      if (!result.error) {
        result.error = `Supabase unreachable: ${supabaseError instanceof Error ? supabaseError.message : 'Unknown error'}`;
      }
    }

    // Get network type if available
    if (navigator.connection) {
      const connection = navigator.connection;
      result.networkType = connection.effectiveType || connection.type || 'unknown';
    }

  } catch (error) {
    result.error = `Connectivity test failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }

  return result;
}

/**
 * Analyze a network error and provide detailed information
 */
export function analyzeNetworkError(error: any, url?: string): DetailedNetworkError {
  const timestamp = new Date().toISOString();
  let networkInfo: NetworkInformation | undefined;

  if (navigator.connection) {
    networkInfo = navigator.connection;
  }

  // Default error structure
  const baseDetails = {
    originalError: error,
    url,
    networkInfo,
    timestamp
  };

  // Analyze specific error types
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return {
      type: 'network',
      message: 'Network request failed',
      userFriendlyMessage: 'Connection failed. Check your internet connection and try again.',
      retryable: true,
      details: {
        ...baseDetails,
        statusCode: 0
      }
    };
  }

  if (error.name === 'AbortError') {
    return {
      type: 'timeout',
      message: 'Request timed out',
      userFriendlyMessage: 'Upload is taking too long. Check your connection and try again.',
      retryable: true,
      details: baseDetails
    };
  }

  if (error.status === 429) {
    return {
      type: 'rate_limit',
      message: 'Rate limit exceeded',
      userFriendlyMessage: 'Too many uploads recently. Please wait before trying again.',
      retryable: false,
      details: {
        ...baseDetails,
        statusCode: 429
      }
    };
  }

  if (error.status >= 500) {
    return {
      type: 'server',
      message: 'Server error',
      userFriendlyMessage: 'Server is experiencing issues. Please try again in a few minutes.',
      retryable: true,
      details: {
        ...baseDetails,
        statusCode: error.status
      }
    };
  }

  if (error.status === 0 || !error.status) {
    return {
      type: 'cors',
      message: 'CORS or network configuration error',
      userFriendlyMessage: 'Connection blocked. Try refreshing the page or checking your network settings.',
      retryable: true,
      details: {
        ...baseDetails,
        statusCode: 0
      }
    };
  }

  // Generic error fallback
  return {
    type: 'unknown',
    message: error.message || 'Unknown error occurred',
    userFriendlyMessage: 'Upload failed. Please try again or contact support if the problem persists.',
    retryable: true,
    details: {
      ...baseDetails,
      statusCode: error.status
    }
  };
}

/**
 * Enhanced fetch with retry logic and detailed error reporting
 */
export async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries: number = 2,
  baseDelay: number = 1000
): Promise<Response> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to each request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const requestOptions: RequestInit = {
        ...options,
        signal: controller.signal
      };

      const response = await fetch(url, requestOptions);
      clearTimeout(timeout);

      // Don't retry on client errors (400-499) except for specific cases
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const httpError: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
        httpError.status = response.status;
        throw httpError;
      }

      // Don't retry on successful responses
      if (response.ok) {
        return response;
      }

      // For server errors or rate limits, prepare for retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      lastError.status = response.status;

    } catch (error) {
      lastError = error;
      
      // Don't retry on non-retryable errors
      const analyzedError = analyzeNetworkError(error, url);
      if (!analyzedError.retryable || attempt === maxRetries) {
        throw error;
      }
    }

    // Wait before retrying with exponential backoff
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Log detailed connectivity information for debugging
 */
export function logConnectivityDebugInfo(error: DetailedNetworkError, additionalContext?: any) {
  const debugInfo = {
    error: {
      type: error.type,
      message: error.message,
      retryable: error.retryable
    },
    network: {
      isOnline: navigator.onLine,
      userAgent: navigator.userAgent,
      connection: navigator.connection || null
    },
    timestamp: new Date().toISOString(),
    context: additionalContext
  };

  console.group('🔍 Connectivity Debug Information');
  console.error('Error Details:', error);
  console.info('Debug Info:', debugInfo);
  console.groupEnd();

  return debugInfo;
}

/**
 * Get user-friendly error message with troubleshooting tips
 */
export function getErrorMessageWithTips(error: DetailedNetworkError): string {
  const tips: Record<string, string[]> = {
    network: [
      'Check your internet connection',
      'Try switching between WiFi and mobile data',
      'Refresh the page and try again'
    ],
    timeout: [
      'Your connection might be slow',
      'Try uploading a smaller image',
      'Check if you\'re on a stable network'
    ],
    cors: [
      'Clear your browser cache and cookies',
      'Try using an incognito/private window',
      'Disable browser extensions temporarily'
    ],
    server: [
      'The server is temporarily unavailable',
      'Try again in a few minutes',
      'Contact support if the problem persists'
    ],
    rate_limit: [
      'You\'ve uploaded many worksheets recently',
      'Wait an hour before trying again',
      'Contact your teacher if this seems incorrect'
    ]
  };

  const errorTips = tips[error.type] || tips.network;
  const tipsText = errorTips.map(tip => `• ${tip}`).join('\n');
  
  return `${error.userFriendlyMessage}\n\nTroubleshooting tips:\n${tipsText}`;
}