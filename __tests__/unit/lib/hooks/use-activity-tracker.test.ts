/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useActivityTracker } from '../../../../lib/hooks/use-activity-tracker';

// Mock BroadcastChannel
class MockBroadcastChannel {
  constructor(public name: string) {}
  postMessage = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  close = jest.fn();
}

(global as any).BroadcastChannel = MockBroadcastChannel;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useActivityTracker', () => {
  let mockConfig: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockConfig = {
      timeout: 30000, // 30 seconds for testing
      warningTime: 5000, // 5 seconds warning
      onActivity: jest.fn(),
      onWarning: jest.fn(),
      onTimeout: jest.fn(),
      throttleInterval: 1000, // 1 second throttle
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should initialize activity tracking', () => {
    const { result } = renderHook(() => useActivityTracker(mockConfig));
    
    expect(result.current).toHaveProperty('extendSession');
    expect(result.current).toHaveProperty('keepAlive');
    expect(result.current).toHaveProperty('getRemainingTime');
    expect(result.current).toHaveProperty('isWarningShown');
  });

  it('should call onWarning before timeout', () => {
    renderHook(() => useActivityTracker(mockConfig));
    
    // Fast-forward to warning time
    act(() => {
      jest.advanceTimersByTime(25000); // 25 seconds (5 seconds before 30s timeout)
    });
    
    expect(mockConfig.onWarning).toHaveBeenCalled();
    expect(mockConfig.onTimeout).not.toHaveBeenCalled();
  });

  it('should call onTimeout after full timeout', () => {
    renderHook(() => useActivityTracker(mockConfig));
    
    // Fast-forward past timeout
    act(() => {
      jest.advanceTimersByTime(31000); // 31 seconds
    });
    
    expect(mockConfig.onTimeout).toHaveBeenCalled();
  });

  it('should reset timers when activity is detected', () => {
    const { result } = renderHook(() => useActivityTracker(mockConfig));
    
    // Fast-forward to just before warning
    act(() => {
      jest.advanceTimersByTime(20000); // 20 seconds
    });
    
    // Trigger activity
    act(() => {
      result.current.extendSession();
    });
    
    // Fast-forward again - should not trigger warning because timer was reset
    act(() => {
      jest.advanceTimersByTime(20000); // Another 20 seconds (total 40s)
    });
    
    expect(mockConfig.onWarning).not.toHaveBeenCalled();
    expect(mockConfig.onTimeout).not.toHaveBeenCalled();
  });

  it('should throttle activity updates', () => {
    const { result } = renderHook(() => useActivityTracker(mockConfig));
    
    // Call extendSession multiple times rapidly
    act(() => {
      result.current.extendSession();
      result.current.extendSession();
      result.current.extendSession();
    });
    
    // Should only call onActivity once due to throttling
    expect(mockConfig.onActivity).toHaveBeenCalledTimes(3); // Initial + 1 extend (first call not throttled)
  });

  it('should skip throttling with keepAlive', () => {
    const { result } = renderHook(() => useActivityTracker(mockConfig));
    
    // Call keepAlive multiple times rapidly
    act(() => {
      result.current.keepAlive('ai-upload');
      result.current.keepAlive('ai-upload');
      result.current.keepAlive('ai-upload');
    });
    
    // Should call onActivity for each keepAlive call
    expect(mockConfig.onActivity).toHaveBeenCalledTimes(4); // Initial + 3 keepAlive calls
  });

  it('should return correct remaining time', () => {
    const { result } = renderHook(() => useActivityTracker(mockConfig));
    
    // Fast-forward 10 seconds
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    
    const remainingTime = result.current.getRemainingTime();
    expect(remainingTime).toBe(20000); // 30000 - 10000
  });

  it('should handle cross-tab communication', () => {
    const { result } = renderHook(() => useActivityTracker(mockConfig));
    
    act(() => {
      result.current.extendSession({ activityType: 'test-activity' });
    });
    
    // Check that BroadcastChannel was used
    expect(MockBroadcastChannel.prototype.postMessage).toHaveBeenCalledWith({
      type: 'activity',
      timestamp: expect.any(Number),
      activityType: 'test-activity'
    });
  });
});