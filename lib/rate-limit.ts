import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/src/types/database';

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remainingUploads?: number;
}

// Rate limit constants
const UPLOADS_PER_IP_PER_HOUR = 20;
const UPLOADS_PER_WORKSHEET_PER_DAY = 5;

/**
 * Check if an upload is allowed based on rate limits
 * @param ip - IP address of the uploader (can be null/undefined)
 * @param worksheetCode - The worksheet code being uploaded
 * @returns Object indicating if upload is allowed and why
 */
export async function checkRateLimit(
  ip: string | null | undefined,
  worksheetCode: string
): Promise<RateLimitResult> {
  try {
    const supabase = await createClient();
    
    // If no IP address is available, we'll be more lenient but still check worksheet limits
    if (!ip) {
      console.warn('No IP address available for rate limiting');
      // Still check worksheet-specific limits
      const worksheetResult = await checkWorksheetLimit(supabase, worksheetCode);
      if (!worksheetResult.allowed) {
        return worksheetResult;
      }
      return { allowed: true, reason: 'No IP restriction applied' };
    }

    // Check IP-based rate limit (20 uploads per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: ipUploads, error: ipError } = await supabase
      .from('upload_rate_limits')
      .select('id')
      .eq('ip_address', ip)
      .gte('uploaded_at', oneHourAgo);

    if (ipError) {
      console.error('Error checking IP rate limit:', ipError);
      // On error, be conservative and allow the upload
      return { allowed: true, reason: 'Rate limit check failed' };
    }

    const ipUploadCount = ipUploads?.length || 0;
    const remainingIpUploads = Math.max(0, UPLOADS_PER_IP_PER_HOUR - ipUploadCount);

    if (ipUploadCount >= UPLOADS_PER_IP_PER_HOUR) {
      return {
        allowed: false,
        reason: `Too many uploads from this IP address. Please try again later.`,
        remainingUploads: 0
      };
    }

    // Check worksheet-specific rate limit
    const worksheetResult = await checkWorksheetLimit(supabase, worksheetCode);
    if (!worksheetResult.allowed) {
      return worksheetResult;
    }

    return {
      allowed: true,
      remainingUploads: Math.min(remainingIpUploads, worksheetResult.remainingUploads || 0)
    };

  } catch (error) {
    console.error('Error in rate limit check:', error);
    // On unexpected error, allow the upload to avoid blocking legitimate users
    return { allowed: true, reason: 'Rate limit check error' };
  }
}

/**
 * Check worksheet-specific rate limits
 */
async function checkWorksheetLimit(
  supabase: any,
  worksheetCode: string
): Promise<RateLimitResult> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: worksheetUploads, error: worksheetError } = await supabase
    .from('upload_rate_limits')
    .select('id')
    .eq('worksheet_code', worksheetCode)
    .gte('uploaded_at', oneDayAgo);

  if (worksheetError) {
    console.error('Error checking worksheet rate limit:', worksheetError);
    return { allowed: true, reason: 'Worksheet limit check failed' };
  }

  const worksheetUploadCount = worksheetUploads?.length || 0;
  const remainingWorksheetUploads = Math.max(0, UPLOADS_PER_WORKSHEET_PER_DAY - worksheetUploadCount);

  if (worksheetUploadCount >= UPLOADS_PER_WORKSHEET_PER_DAY) {
    return {
      allowed: false,
      reason: `This worksheet has been uploaded too many times today. Please try again tomorrow.`,
      remainingUploads: 0
    };
  }

  return {
    allowed: true,
    remainingUploads: remainingWorksheetUploads
  };
}

/**
 * Record a new upload for rate limiting
 * @param ip - IP address of the uploader
 * @param worksheetCode - The worksheet code being uploaded
 */
export async function recordUpload(
  ip: string | null | undefined,
  worksheetCode: string
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // If no IP, use a placeholder to still track worksheet uploads
    const ipAddress = ip || 'unknown';
    
    const { error } = await supabase
      .from('upload_rate_limits')
      .insert({
        ip_address: ipAddress,
        worksheet_code: worksheetCode
      });

    if (error) {
      console.error('Error recording upload:', error);
      // Don't throw - we don't want to block uploads if rate limit recording fails
    }
  } catch (error) {
    console.error('Error in recordUpload:', error);
    // Don't throw - rate limit recording failure shouldn't block uploads
  }
}

/**
 * Clean up old rate limit records (older than 7 days)
 * This should be called periodically, perhaps via a cron job
 */
export async function cleanOldRecords(): Promise<number> {
  try {
    const supabase = await createClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('upload_rate_limits')
      .delete()
      .lt('uploaded_at', sevenDaysAgo)
      .select('id');

    if (error) {
      console.error('Error cleaning old records:', error);
      return 0;
    }

    const deletedCount = data?.length || 0;
    console.log(`Cleaned up ${deletedCount} old rate limit records`);
    return deletedCount;

  } catch (error) {
    console.error('Error in cleanOldRecords:', error);
    return 0;
  }
}

/**
 * Get rate limit statistics for monitoring
 */
export async function getRateLimitStats(): Promise<{
  totalRecords: number;
  uniqueIps: number;
  topIps: Array<{ ip: string; count: number }>;
  topWorksheets: Array<{ code: string; count: number }>;
}> {
  try {
    const supabase = await createClient();
    
    // Get all records from last 24 hours for stats
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('upload_rate_limits')
      .select('ip_address, worksheet_code')
      .gte('uploaded_at', oneDayAgo);

    if (error || !data) {
      return {
        totalRecords: 0,
        uniqueIps: 0,
        topIps: [],
        topWorksheets: []
      };
    }

    // Calculate statistics
    const ipCounts = new Map<string, number>();
    const worksheetCounts = new Map<string, number>();

    data.forEach(record => {
      ipCounts.set(record.ip_address, (ipCounts.get(record.ip_address) || 0) + 1);
      worksheetCounts.set(record.worksheet_code, (worksheetCounts.get(record.worksheet_code) || 0) + 1);
    });

    // Get top IPs and worksheets
    const topIps = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    const topWorksheets = Array.from(worksheetCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count }));

    return {
      totalRecords: data.length,
      uniqueIps: ipCounts.size,
      topIps,
      topWorksheets
    };

  } catch (error) {
    console.error('Error getting rate limit stats:', error);
    return {
      totalRecords: 0,
      uniqueIps: 0,
      topIps: [],
      topWorksheets: []
    };
  }
}