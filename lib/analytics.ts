import { createClient } from '@/lib/supabase/server'

export type AnalyticsEvent = 
  | 'qr_upload_started'
  | 'qr_upload_image_selected'
  | 'qr_upload_completed'
  | 'qr_upload_failed'
  | 'standard_upload_started'
  | 'standard_upload_completed'
  | 'standard_upload_failed'

export interface AnalyticsEventData {
  event: AnalyticsEvent
  worksheetCode?: string
  deviceType?: 'mobile' | 'desktop' | 'tablet'
  method?: 'camera' | 'gallery' | 'file'
  fileSize?: number
  processingTime?: number
  uploadSource?: string
  errorCode?: string
  errorMessage?: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export async function trackEvent(eventData: AnalyticsEventData): Promise<void> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('analytics_events')
      .insert({
        event: eventData.event,
        worksheet_code: eventData.worksheetCode,
        device_type: eventData.deviceType,
        method: eventData.method,
        file_size: eventData.fileSize,
        processing_time: eventData.processingTime,
        upload_source: eventData.uploadSource,
        error_code: eventData.errorCode,
        error_message: eventData.errorMessage,
        user_id: eventData.userId,
        ip_address: eventData.ipAddress,
        user_agent: eventData.userAgent,
        metadata: eventData.metadata,
        created_at: new Date().toISOString()
      })
    
    if (error) {
      console.error('Failed to track analytics event:', error)
    }
  } catch (error) {
    console.error('Analytics tracking error:', error)
  }
}

export function getDeviceType(userAgent: string): 'mobile' | 'desktop' | 'tablet' {
  const ua = userAgent.toLowerCase()
  
  if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) {
    return 'tablet'
  } else if (/mobile|iphone|android/i.test(ua)) {
    return 'mobile'
  } else {
    return 'desktop'
  }
}

// Note: This function is for server-side use only
// For client-side analytics, use the /api/analytics/upload-stats endpoint
export async function getUploadAnalytics(startDate?: Date, endDate?: Date) {
  const supabase = await createClient()
  
  let query = supabase
    .from('analytics_events')
    .select('*')
    .in('event', [
      'qr_upload_completed',
      'qr_upload_failed',
      'standard_upload_completed',
      'standard_upload_failed'
    ])
  
  if (startDate) {
    query = query.gte('created_at', startDate.toISOString())
  }
  
  if (endDate) {
    query = query.lte('created_at', endDate.toISOString())
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Failed to fetch analytics:', error)
    return null
  }
  
  const qrUploads = data.filter(e => e.event.startsWith('qr_upload'))
  const standardUploads = data.filter(e => e.event.startsWith('standard_upload'))
  
  const qrSuccess = qrUploads.filter(e => e.event === 'qr_upload_completed').length
  const qrFailed = qrUploads.filter(e => e.event === 'qr_upload_failed').length
  const standardSuccess = standardUploads.filter(e => e.event === 'standard_upload_completed').length
  const standardFailed = standardUploads.filter(e => e.event === 'standard_upload_failed').length
  
  const avgProcessingTime = data
    .filter(e => e.processing_time)
    .reduce((sum, e) => sum + e.processing_time, 0) / 
    data.filter(e => e.processing_time).length || 0
  
  const errorTypes = data
    .filter(e => e.error_code)
    .reduce((acc, e) => {
      acc[e.error_code] = (acc[e.error_code] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  
  return {
    qrScans: {
      total: qrUploads.length,
      successful: qrSuccess,
      failed: qrFailed,
      successRate: qrUploads.length > 0 ? (qrSuccess / qrUploads.length) * 100 : 0
    },
    standardUploads: {
      total: standardUploads.length,
      successful: standardSuccess,
      failed: standardFailed,
      successRate: standardUploads.length > 0 ? (standardSuccess / standardUploads.length) * 100 : 0
    },
    avgProcessingTime: Math.round(avgProcessingTime),
    errorTypes,
    deviceBreakdown: data.reduce((acc, e) => {
      if (e.device_type) {
        acc[e.device_type] = (acc[e.device_type] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)
  }
}