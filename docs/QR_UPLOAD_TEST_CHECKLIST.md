# QR Upload Feature Testing Checklist

## Overview
This document provides a comprehensive testing checklist for the QR code upload feature. Each test should be performed and results documented.

## 1. QR Code Generation Tests

### 1.1 New Worksheet Generation
- [ ] Generate a new worksheet via the dashboard
- [ ] Verify QR code is displayed on the worksheet
- [ ] Check QR code content:
  - [ ] Decode QR code using online tool or phone app
  - [ ] Verify format is: `https://app.speddy.com/ws/{worksheetCode}`
  - [ ] Verify worksheet code matches database record

### 1.2 QR Code Scanning
- [ ] **iOS Camera App**
  - [ ] Open native camera app
  - [ ] Point at QR code on worksheet
  - [ ] Verify notification appears with correct URL
  - [ ] Tap notification and verify redirect to upload page
- [ ] **Android Camera App**
  - [ ] Same tests as iOS
- [ ] **QR Scanner Apps**
  - [ ] Test with popular QR scanner apps
  - [ ] Verify URL is correctly decoded

### 1.3 URL Functionality
- [ ] Direct URL access: Navigate to `https://app.speddy.com/ws/{code}`
- [ ] Verify correct worksheet details are displayed
- [ ] Test with invalid worksheet code (404 error expected)

## 2. Upload Flow Tests

### 2.1 Mobile Upload Tests

#### iOS Safari
- [ ] **Camera Capture**
  - [ ] Tap "Take Photo" button
  - [ ] Verify camera opens
  - [ ] Take photo of worksheet
  - [ ] Verify preview is displayed
  - [ ] Submit and verify success message
- [ ] **Gallery Upload**
  - [ ] Tap "Choose from Gallery"
  - [ ] Select existing photo
  - [ ] Verify preview and submit

#### Android Chrome
- [ ] **Camera Capture**
  - [ ] Same tests as iOS
  - [ ] Test on multiple Android versions (8+)
- [ ] **Gallery Upload**
  - [ ] Same tests as iOS

#### Other Mobile Browsers
- [ ] Firefox Mobile
- [ ] Samsung Internet
- [ ] Opera Mobile

### 2.2 Desktop Upload Tests
- [ ] **Chrome/Edge/Firefox**
  - [ ] Click "Choose from Gallery"
  - [ ] Select image file
  - [ ] Verify preview displays
  - [ ] Submit and verify success

### 2.3 Image Processing Tests
- [ ] **File Sizes**
  - [ ] Small image (< 1MB)
  - [ ] Medium image (1-5MB)
  - [ ] Large image (5-10MB)
  - [ ] Very large image (> 10MB) - should compress
- [ ] **File Types**
  - [ ] JPEG
  - [ ] PNG
  - [ ] HEIC (iOS)
  - [ ] WebP
  - [ ] Invalid types (PDF, DOC) - should reject
- [ ] **Image Quality**
  - [ ] High resolution photo
  - [ ] Low resolution photo
  - [ ] Blurry photo
  - [ ] Dark/poor lighting photo

### 2.4 Non-Worksheet Image Tests
- [ ] Upload image without QR code - should fail with clear error
- [ ] Upload image with different QR code - should fail with mismatch error
- [ ] Upload image with multiple QR codes - verify correct one is detected

## 3. Rate Limiting Tests

### 3.1 Hourly Limit (20 uploads)
- [ ] Upload 19 worksheets within an hour
- [ ] Verify all succeed
- [ ] Upload 20th worksheet - should succeed
- [ ] Upload 21st worksheet - should fail with rate limit error
- [ ] Verify error message is user-friendly
- [ ] Check X-RateLimit headers:
  ```
  X-RateLimit-Limit: 20
  X-RateLimit-Remaining: 0
  X-RateLimit-Reset: {timestamp}
  ```

### 3.2 Per-Worksheet Limit (5 uploads)
- [ ] Upload same worksheet 4 times
- [ ] Verify all succeed
- [ ] Upload 5th time - should succeed
- [ ] Upload 6th time - should fail
- [ ] Verify appropriate error message

### 3.3 Rate Limit Reset
- [ ] Wait for rate limit reset time
- [ ] Verify uploads work again
- [ ] Check cleanup cron job removes old records

## 4. Error Case Tests

### 4.1 Invalid Worksheet Code
- [ ] Navigate to `/ws/invalid-code-123`
- [ ] Verify 404 error page displays
- [ ] Check error message is helpful

### 4.2 QR Code Mismatch
- [ ] Upload worksheet A's image to worksheet B's URL
- [ ] Verify error: "QR code doesn't match"
- [ ] Check error message guides user correctly

### 4.3 Network Failures
- [ ] **Offline Mode**
  - [ ] Enable airplane mode after loading page
  - [ ] Try to upload
  - [ ] Verify offline error message
- [ ] **Slow Connection**
  - [ ] Throttle network to 3G
  - [ ] Upload large image
  - [ ] Verify progress indicator works
  - [ ] Verify timeout handling

### 4.4 Server Errors
- [ ] Test with Supabase storage full (mock)
- [ ] Test with database connection error (mock)
- [ ] Verify generic error messages don't expose internals

## 5. Backwards Compatibility Tests

### 5.1 Old JSON QR Codes
- [ ] Find/create worksheet with old JSON format QR code
- [ ] Scan and upload
- [ ] Verify it still works
- [ ] Check QR verification handles both formats

### 5.2 Old String QR Codes
- [ ] Find/create worksheet with plain string QR code
- [ ] Test upload process
- [ ] Verify compatibility

### 5.3 Mixed Environment
- [ ] Test uploads from worksheets created before feature
- [ ] Verify no breaking changes for existing users

## 6. Analytics Tracking Tests

### 6.1 Event Tracking
- [ ] Verify `qr_upload_started` fires on page load
- [ ] Verify `qr_upload_image_selected` fires with correct method
- [ ] Verify `qr_upload_completed` includes timing data
- [ ] Verify `qr_upload_failed` includes error details

### 6.2 Analytics Dashboard
- [ ] Check QR vs Standard upload counts
- [ ] Verify device type breakdown
- [ ] Check average processing times
- [ ] Verify error tracking works

## 7. User Experience Tests

### 7.1 Loading States
- [ ] Page load spinner displays
- [ ] Image processing spinner shows
- [ ] Upload progress bar works smoothly
- [ ] Success animation plays

### 7.2 Error Handling
- [ ] All errors show user-friendly messages
- [ ] Retry options are available where appropriate
- [ ] No technical jargon in error messages

### 7.3 Mobile Responsiveness
- [ ] Test on various screen sizes
- [ ] Verify touch targets are large enough
- [ ] Check text is readable without zooming
- [ ] Test landscape orientation

## 8. Performance Tests

### 8.1 Load Times
- [ ] Measure page load time on 4G
- [ ] Measure page load time on 3G
- [ ] Check image compression performance
- [ ] Verify no memory leaks with multiple uploads

### 8.2 Concurrent Usage
- [ ] Test multiple users uploading simultaneously
- [ ] Verify rate limits work correctly per IP
- [ ] Check server response times under load

## 9. Security Tests

### 9.1 Authentication
- [ ] Verify QR upload works without login
- [ ] Verify standard upload requires authentication
- [ ] Test CORS headers are correct

### 9.2 Input Validation
- [ ] Test XSS attempts in file names
- [ ] Verify file type validation
- [ ] Check file size limits enforced
- [ ] Test path traversal prevention

## 10. Integration Tests

### 10.1 End-to-End Flow
- [ ] Teacher generates worksheet
- [ ] Student completes worksheet
- [ ] Teacher scans QR and uploads
- [ ] Verify submission appears in dashboard
- [ ] Check AI grading works (if enabled)

### 10.2 Email Notifications
- [ ] Verify upload confirmations sent (if configured)
- [ ] Check parent notifications work

---

## Test Results Template

```markdown
### Test: [Test Name]
- **Date**: YYYY-MM-DD
- **Tester**: [Name]
- **Device/Browser**: [Details]
- **Result**: ✅ Pass / ❌ Fail / ⚠️ Partial
- **Notes**: [Any observations]
- **Screenshots**: [If applicable]
```

## Common Issues & Fixes

### Issue: Camera doesn't open on iOS
**Fix**: Ensure site has HTTPS and proper permissions

### Issue: QR code not detected in image
**Fix**: Improve lighting, ensure QR code is fully visible

### Issue: Rate limit hit too quickly
**Fix**: Check IP detection logic, consider increasing limits

### Issue: Large images fail to upload
**Fix**: Verify compression works, check timeout settings

---

## Automated Test Scripts

Create automated tests for critical paths:

```typescript
// Example Playwright test
test('QR upload flow', async ({ page }) => {
  await page.goto('/ws/test-worksheet-code');
  await page.click('text=Take Photo');
  // ... continue test
});
```

## Monitoring Checklist

- [ ] Set up error tracking for failed uploads
- [ ] Monitor rate limit hits
- [ ] Track upload success rates
- [ ] Alert on unusual error patterns