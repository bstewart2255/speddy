import { createClient } from '@/lib/supabase/client'

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
    const supabase = createClient()
    
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
      console.error('Analytics tracking error:', error)
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

// Re-export the trackUploadEvent for compatibility
export async function trackUploadEvent(
  event: AnalyticsEvent,
  worksheetCode: string,
  additionalData?: Partial<AnalyticsEventData>
): Promise<void> {
  const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : ''
  
  await trackEvent({
    event,
    worksheetCode,
    deviceType: getDeviceType(userAgent),
    userAgent,
    ...additionalData
  })
}