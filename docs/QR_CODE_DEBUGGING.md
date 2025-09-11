# QR Code Debugging Analysis

## The REAL QR Code Problem & Fix

After thorough investigation, I found the actual issues preventing QR codes from rendering:

### Root Causes

1. **Authentication Failure**:
   - The QR code API endpoint requires authentication
   - When called from the client-side in the AI modal, it may be failing auth checks
   - Location: `/app/api/worksheets/generate-or-fetch/route.ts` line 15

2. **Data Flow Break**:
   - Even if QR codes are generated, they're not properly passed through the rendering chain
   - The data URL may be getting lost between API call and final HTML rendering

3. **Silent Failures**:
   - Error handling is suppressing the actual errors
   - Line 311 in `ai-content-modal-enhanced.tsx`: `console.warn('Failed to generate QR codes, continuing without them:', qrError);`
   - This makes debugging impossible as we can't see the real error

### Evidence Found

```typescript
// API requires auth (generate-or-fetch/route.ts:15)
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Errors are being caught but not properly logged
catch (qrError) {
  console.warn('Failed to generate QR codes, continuing without them:', qrError);
  // Continue without QR codes - worksheets will still be generated
}
```

### Working Example vs Broken Implementation

**Working (worksheet-button.tsx):**

- Uses `window.open()` directly
- Generates HTML with embedded QR code
- Simple, direct approach

**Broken (ai-content-modal-enhanced.tsx):**

- Uses iframe approach via `printHtmlWorksheet()`
- Complex data passing through multiple functions
- Potential auth token issues

### Proposed Fix

#### 1. Add Debug Logging

```javascript
// Add at each step to track data flow
console.log('[QR Debug] API call starting', { lessonId, studentId });
console.log('[QR Debug] API response', { status: response.status, data });
console.log('[QR Debug] Data URL received', { hasDataUrl: !!data.qrCodeDataUrl });
console.log('[QR Debug] Passing to renderer', { qrCodeDataUrl });
```

#### 2. Fix Authentication

- Ensure the API endpoint properly handles client-side auth tokens
- Add proper error messages for auth failures
- Check if auth headers are being passed correctly

#### 3. Simplify the Flow

Instead of:

```javascript
printHtmlWorksheet(aiMathWorksheetHtml, title);
```

Use:

```javascript
const printWindow = window.open('', '_blank');
if (printWindow) {
  printWindow.document.write(aiMathWorksheetHtml);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}
```

#### 4. Direct Implementation

Copy the working pattern from `worksheet-button.tsx`:

- Generate HTML with embedded QR code data URLs directly
- Use `<img src="${qrCodeDataUrl}" alt="QR Code" class="qr-code" />` directly
- Remove complex iframe logic

#### 5. Test with Console Logging

Check browser console for:

- Network tab: Is the API call succeeding?
- Console: Are there auth errors?
- Response: Is qrCodeDataUrl actually present?

### Quick Test

Add this to `ai-content-modal-enhanced.tsx` after line 309:

```javascript
console.log('[QR TEST] Math result:', mathQRResult);
console.log('[QR TEST] ELA result:', elaQRResult);
if (mathQRResult?.qrCodeDataUrl) {
  console.log(
    '[QR TEST] Math QR exists, first 100 chars:',
    mathQRResult.qrCodeDataUrl.substring(0, 100)
  );
}
```

### Files to Check

1. `/app/api/worksheets/generate-or-fetch/route.ts` - API endpoint
2. `/app/components/ai-content-modal-enhanced.tsx` - Main modal component
3. `/lib/utils/worksheet-utils.ts` - Utility functions
4. `/lib/lessons/renderer.ts` - HTML renderer
5. `/app/components/lessons/worksheet-button.tsx` - Working example

### Summary

The QR codes aren't rendering because:

1. API calls may be failing due to auth issues
2. Errors are being silently caught and ignored
3. The printing method (iframe) is overly complex
4. No debug logging to identify where the chain breaks

The fix is to:

1. Add debug logging
2. Fix auth handling
3. Use the simpler window.open() approach
4. Copy the working pattern from worksheet-button.tsx
