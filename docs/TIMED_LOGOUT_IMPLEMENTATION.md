# Timed Logout Implementation

## Overview

The timed logout feature provides automatic session termination after a period of user inactivity, enhancing security by preventing unauthorized access to unattended sessions.

## Features

### Core Functionality
- **Configurable Timeout**: Default 45-minute session timeout, configurable via environment variables
- **Warning System**: 2-minute warning modal before automatic logout
- **Cross-Tab Synchronization**: Activity in one tab extends the session across all open tabs
- **Accessibility**: Full ARIA support with screen reader announcements
- **Security Cleanup**: Comprehensive cache clearing and token revocation on timeout

### User Experience
- **Non-intrusive**: Only tracks activity on authenticated pages
- **Graceful Warnings**: Accessible modal with countdown timer
- **User Control**: "Stay signed in" button to extend session
- **Clear Feedback**: Login page shows timeout notification when redirected

## Configuration

### Environment Variables
```bash
# Session timeout duration in milliseconds (default: 45 minutes)
NEXT_PUBLIC_SESSION_TIMEOUT=2700000

# Warning time before timeout in milliseconds (default: 2 minutes)
NEXT_PUBLIC_SESSION_WARNING_TIME=120000
```

### Keep-Alive Activities
The system supports keep-alive for long-running operations:
- AI content generation
- File uploads
- Lesson generation
- Worksheet creation

## Technical Implementation

### Architecture Components

#### 1. Activity Tracker (`lib/hooks/use-activity-tracker.ts`)
- Monitors user interactions (mouse, keyboard, touch, scroll)
- Implements throttling to prevent excessive updates (30-second intervals)
- Provides cross-tab synchronization via BroadcastChannel and localStorage
- Supports keep-alive for long-running operations

#### 2. Timeout Warning Modal (`app/components/auth/timeout-warning-modal.tsx`)
- Accessible modal with proper focus management
- Countdown timer with formatted time display
- ARIA live regions for screen reader announcements
- Keyboard navigation support (Escape key handling)

#### 3. Enhanced Authentication Provider (`app/components/providers/auth-provider.tsx`)
- Integrates timeout logic with existing Supabase authentication
- Handles security cleanup on timeout logout
- Manages warning modal state and user interactions
- Exempts public routes from timeout tracking

#### 4. Configuration System (`lib/config/session-timeout.ts`)
- Centralized configuration management
- Route exemption utilities
- Keep-alive activity type definitions
- Environment variable handling

### Cross-Tab Communication

The system uses two mechanisms for cross-tab synchronization:

1. **localStorage Events**: Primary method for activity synchronization
2. **BroadcastChannel**: Fallback for more reliable real-time communication

```typescript
// Activity is broadcast to all tabs
const channel = new BroadcastChannel('user-activity');
channel.postMessage({ 
  type: 'activity', 
  timestamp: Date.now(),
  activityType: 'user-interaction' 
});
```

### Security Features

#### Session Security Cleanup
When a session times out, the system performs comprehensive cleanup:

1. **Supabase Auth Logout**: Proper session termination
2. **localStorage Cleanup**: Removes activity tracking data
3. **Cache Clearing**: Clears browser caches if available
4. **Memory Cleanup**: Resets authentication state

#### Route Protection
- Public routes are exempt from timeout tracking
- API routes and static assets are excluded
- Middleware integration ensures server-side validation

## Usage Examples

### Basic Integration
The feature is automatically enabled when users sign in:

```typescript
// AuthProvider automatically handles timeout tracking
const { extendSession, keepAlive } = useAuth();

// Manual session extension
extendSession();

// Keep-alive for long operations
keepAlive('ai-generation');
```

### Keep-Alive for Long Operations
For operations that should extend the session without user interaction:

```typescript
const { keepAlive } = useAuth();

// During AI content generation
const generateContent = async () => {
  keepAlive('ai-generation');
  // ... long-running AI operation
};

// During file uploads
const uploadFile = async () => {
  keepAlive('file-upload');
  // ... file upload process
};
```

## Testing

### Unit Tests
- Activity tracker hook testing with fake timers
- Cross-tab communication testing with mocked BroadcastChannel
- Throttling behavior validation
- Timeout and warning callback testing

### Integration Testing
- End-to-end session timeout scenarios
- Cross-browser tab synchronization
- Accessibility testing with screen readers
- Mobile device interaction testing

## Accessibility Compliance

### WCAG 2.1 AA Standards
- **Focus Management**: Warning modal receives focus on display
- **Keyboard Navigation**: Full keyboard support including Escape key
- **Screen Reader Support**: ARIA live regions announce timeout warnings
- **Color Contrast**: Warning modal meets contrast requirements
- **Alternative Access**: Multiple ways to extend session (button click, Escape key)

### ARIA Implementation
```typescript
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="timeout-title"
  aria-describedby="timeout-description"
>
  <div aria-live="polite" aria-atomic="true">
    {formatTime(seconds)} remaining before automatic logout
  </div>
</div>
```

## Monitoring and Debugging

### Development Tools
- Console logging for activity tracking events
- LocalStorage inspection for cross-tab state
- Warning modal state debugging
- Timer management verification

### Production Monitoring
- Session timeout analytics (can be added)
- User engagement metrics during warnings
- Cross-tab synchronization success rates
- Security cleanup completion tracking

## Browser Compatibility

### Supported Features
- **BroadcastChannel**: Modern browsers (fallback to localStorage events)
- **localStorage**: Universal support
- **IntersectionObserver**: Used for advanced activity detection
- **requestIdleCallback**: Used for performance optimization

### Fallback Strategies
- localStorage events when BroadcastChannel unavailable
- Timer-based activity checking as ultimate fallback
- Graceful degradation for older browsers

## Deployment Considerations

### Environment Setup
1. Configure timeout environment variables
2. Test cross-tab behavior in production environment
3. Verify Supabase session management integration
4. Validate accessibility with screen readers

### Performance Impact
- Minimal CPU usage due to throttling
- Low memory footprint
- Efficient event listener management
- Automatic cleanup on component unmount

## Future Enhancements

### Potential Improvements
1. **Configurable Activities**: Allow users to customize which activities extend sessions
2. **Grace Period**: Implement grace period after network connectivity issues
3. **Analytics Integration**: Track timeout patterns for UX improvements
4. **Mobile Optimization**: Enhanced mobile gesture recognition
5. **Role-Based Timeouts**: Different timeout durations based on user roles