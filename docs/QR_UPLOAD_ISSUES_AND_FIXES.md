# QR Upload Feature - Known Issues & Recommendations

## Current Status

The QR upload feature has been successfully implemented with the following components:
- ✅ QR code generation with URL format
- ✅ Mobile-friendly upload page
- ✅ Rate limiting (20/hour per IP, 5/day per worksheet)
- ✅ QR code verification
- ✅ Analytics tracking
- ✅ Cleanup cron endpoint
- ✅ Backwards compatibility

## Known Issues & Fixes

### 1. iOS Camera Permission Issues

**Issue**: Camera may not open on iOS devices
**Symptoms**: "Take Photo" button doesn't work on iOS Safari

**Fix**:
```html
<!-- Ensure proper input attributes -->
<input
  type="file"
  accept="image/*"
  capture="environment"  <!-- Important for iOS -->
/>
```

**Additional Steps**:
- Ensure site is served over HTTPS
- Check iOS Settings > Safari > Camera access

### 2. Large Image Upload Failures

**Issue**: Images over 10MB may fail to upload
**Current Behavior**: Images are compressed to 2MB max

**Potential Improvements**:
```typescript
// Add progressive compression
async function compressImage(file: File, maxSizeMB: number): Promise<Blob> {
  let quality = 0.9;
  let compressed = file;
  
  while (compressed.size > maxSizeMB * 1024 * 1024 && quality > 0.1) {
    compressed = await compressWithQuality(file, quality);
    quality -= 0.1;
  }
  
  return compressed;
}
```

### 3. QR Code Detection in Poor Lighting

**Issue**: QR codes may not be detected in dark/blurry photos
**Current Library**: jsQR

**Recommended Enhancement**:
```typescript
// Add image preprocessing
async function enhanceImageForQR(imageBuffer: Buffer): Promise<Buffer> {
  // Increase contrast
  // Convert to grayscale
  // Apply sharpening filter
  return enhancedBuffer;
}
```

### 4. Rate Limit Edge Cases

**Issue**: Rate limits may be too restrictive for classroom use
**Current Limits**: 20/hour per IP, 5/day per worksheet

**Recommendations**:
1. Consider school IP whitelisting
2. Add teacher account bypass
3. Implement sliding window instead of fixed hour

```typescript
// Example: Teacher bypass
if (source === 'qr_scan_upload' && !teacherAccount) {
  // Apply rate limits
} else {
  // Skip rate limits for teachers
}
```

### 5. Analytics Performance

**Issue**: Analytics queries may slow down with large datasets
**Current Implementation**: Basic counting queries

**Optimization**:
```sql
-- Add materialized view for common queries
CREATE MATERIALIZED VIEW upload_analytics_daily AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  event,
  device_type,
  COUNT(*) as count,
  AVG(processing_time) as avg_time
FROM analytics_events
GROUP BY 1, 2, 3;

-- Refresh daily
CREATE INDEX idx_analytics_daily ON upload_analytics_daily(date);
```

### 6. Network Timeout Handling

**Issue**: Uploads may timeout on slow connections
**Current Behavior**: Browser default timeout

**Enhancement**:
```typescript
// Add configurable timeout with retry
const uploadWithRetry = async (formData: FormData, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s
      
      const response = await fetch('/api/submit-worksheet', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
    }
  }
};
```

## Recommended Monitoring

### 1. Key Metrics to Track

```sql
-- Daily upload success rate
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(CASE WHEN event LIKE '%completed' THEN 1 END)::float / 
  COUNT(*)::float as success_rate
FROM analytics_events
WHERE event LIKE '%upload%'
GROUP BY 1
ORDER BY 1 DESC;

-- Error distribution
SELECT 
  error_code,
  COUNT(*) as occurrences,
  COUNT(*)::float / SUM(COUNT(*)) OVER () as percentage
FROM analytics_events
WHERE event LIKE '%failed'
GROUP BY 1
ORDER BY 2 DESC;
```

### 2. Alerts to Set Up

1. **High Failure Rate**: Alert if success rate < 90%
2. **Rate Limit Hits**: Alert if > 10 users hit limits/day
3. **Processing Time**: Alert if avg time > 5 seconds
4. **Storage Usage**: Alert if approaching Supabase limits

## Future Enhancements

### 1. Batch Upload Support
Allow teachers to upload multiple worksheets at once:
```typescript
interface BatchUpload {
  worksheetCodes: string[];
  images: File[];
  matchByOrder: boolean;
}
```

### 2. OCR Integration
Automatically extract student answers:
- Use Tesseract.js for client-side OCR
- Or integrate with cloud OCR services

### 3. Progressive Web App
Enable offline capability:
- Cache upload page with service worker
- Queue uploads when offline
- Sync when connection restored

### 4. Enhanced Analytics
- Real-time dashboard updates
- Export analytics to CSV
- Predictive failure detection

### 5. Smart Retry Logic
```typescript
// Intelligent retry based on error type
const retryStrategy = {
  'network': { maxRetries: 3, delay: 1000 },
  'rate_limit': { maxRetries: 0, delay: 0 },
  'qr_mismatch': { maxRetries: 0, delay: 0 },
  'server_error': { maxRetries: 2, delay: 5000 }
};
```

## Testing Recommendations

### Automated Testing
1. Set up Playwright tests for critical paths
2. Add visual regression tests for QR codes
3. Load test the upload endpoint
4. Monitor with synthetic checks

### Manual Testing Schedule
- Weekly: Basic flow test on iOS/Android
- Monthly: Full checklist completion
- Quarterly: Performance and load testing

## Security Considerations

1. **File Upload Security**
   - Currently validates file type and size
   - Consider adding virus scanning for production
   - Implement file content verification

2. **Rate Limit Bypass Prevention**
   - Monitor for IP spoofing attempts
   - Consider implementing CAPTCHA for suspicious patterns
   - Add honeypot fields

3. **Data Privacy**
   - Ensure worksheet images are properly secured
   - Implement retention policies
   - Add audit logging for access

## Deployment Checklist

Before deploying updates:
- [ ] Run integration tests
- [ ] Test on staging environment
- [ ] Verify database migrations
- [ ] Update environment variables
- [ ] Test rollback procedure
- [ ] Monitor error rates post-deploy

## Support Documentation

Create user-facing docs for:
1. How to scan QR codes (with screenshots)
2. Troubleshooting common issues
3. Browser compatibility guide
4. FAQ section

## Contact for Issues

For urgent issues:
1. Check error logs in Supabase
2. Review analytics dashboard
3. Check rate limit records
4. Monitor Sentry (if configured)