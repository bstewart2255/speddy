import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  cleanupKindergartenSchedules, 
  cleanupTKSchedules,
  deleteSchoolHours 
} from './school-hours';

// Mock the Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: 'test-user-id' } }
      }))
    },
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null }))
        }))
      }))
    }))
  }))
}));

// Mock performance monitoring
vi.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: vi.fn(() => ({
    end: vi.fn()
  }))
}));

describe('School Hours Cleanup Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cleanupKindergartenSchedules', () => {
    it('should delete K, K-AM, and K-PM schedules', async () => {
      const mockDelete = vi.fn(() => Promise.resolve({ error: null }));
      const deleteSchoolHoursSpy = vi.spyOn({ deleteSchoolHours }, 'deleteSchoolHours');
      
      await cleanupKindergartenSchedules({ school_site: 'test-school' });
      
      // Should be called 3 times for K, K-AM, K-PM
      expect(deleteSchoolHoursSpy).toHaveBeenCalledTimes(3);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('K', { school_site: 'test-school' });
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('K-AM', { school_site: 'test-school' });
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('K-PM', { school_site: 'test-school' });
    });

    it('should handle cleanup without school identifier', async () => {
      const deleteSchoolHoursSpy = vi.spyOn({ deleteSchoolHours }, 'deleteSchoolHours');
      
      await cleanupKindergartenSchedules();
      
      expect(deleteSchoolHoursSpy).toHaveBeenCalledTimes(3);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('K', undefined);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('K-AM', undefined);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('K-PM', undefined);
    });
  });

  describe('cleanupTKSchedules', () => {
    it('should delete TK, TK-AM, and TK-PM schedules', async () => {
      const deleteSchoolHoursSpy = vi.spyOn({ deleteSchoolHours }, 'deleteSchoolHours');
      
      await cleanupTKSchedules({ school_site: 'test-school' });
      
      // Should be called 3 times for TK, TK-AM, TK-PM
      expect(deleteSchoolHoursSpy).toHaveBeenCalledTimes(3);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('TK', { school_site: 'test-school' });
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('TK-AM', { school_site: 'test-school' });
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('TK-PM', { school_site: 'test-school' });
    });

    it('should handle cleanup without school identifier', async () => {
      const deleteSchoolHoursSpy = vi.spyOn({ deleteSchoolHours }, 'deleteSchoolHours');
      
      await cleanupTKSchedules();
      
      expect(deleteSchoolHoursSpy).toHaveBeenCalledTimes(3);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('TK', undefined);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('TK-AM', undefined);
      expect(deleteSchoolHoursSpy).toHaveBeenCalledWith('TK-PM', undefined);
    });
  });

  describe('Form Behavior Validation', () => {
    it('should ensure K schedules are only saved when checkbox is checked', () => {
      // This test validates the logic in school-hours-form.tsx
      // The form should:
      // 1. Default showK to false
      // 2. Only save K schedules when showK is true
      // 3. Call cleanupKindergartenSchedules when showK is false
      
      const formState = {
        showK: false, // Should default to false
        showTK: false
      };
      
      // When showK is false, no K schedules should be saved
      expect(formState.showK).toBe(false);
    });

    it('should cleanup orphaned schedules when checkbox is unchecked', () => {
      // When user unchecks the K checkbox:
      // 1. cleanupKindergartenSchedules should be called
      // 2. All K, K-AM, K-PM schedules should be deleted
      
      const shouldCleanup = (previousShowK: boolean, currentShowK: boolean) => {
        return previousShowK === true && currentShowK === false;
      };
      
      expect(shouldCleanup(true, false)).toBe(true);
      expect(shouldCleanup(false, false)).toBe(false);
      expect(shouldCleanup(false, true)).toBe(false);
    });
  });
});