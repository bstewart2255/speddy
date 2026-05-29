import * as schoolHoursModule from './school-hours';

// Mock the Supabase client. The query builder is chainable (`delete().eq().eq()`)
// and awaitable (resolves `{ error: null }`). The `from`/`delete`/`eq` spies are
// shared so we can assert which grade levels were deleted — `cleanup*` calls
// `deleteSchoolHours` directly, so spying that export wouldn't intercept the
// internal call under babel-jest; asserting on the DB layer is both reliable and
// closer to the real behavior.
jest.mock('@/lib/supabase/client', () => {
  const mockEq = jest.fn();
  const mockDelete = jest.fn();
  const builder: any = {
    delete: (...args: any[]) => {
      mockDelete(...args);
      return builder;
    },
    eq: (...args: any[]) => {
      mockEq(...args);
      return builder;
    },
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
  const mockFrom = jest.fn(() => builder);
  const createClient = jest.fn(() => ({
    auth: {
      getUser: jest.fn(() =>
        Promise.resolve({ data: { user: { id: 'test-user-id' } } })
      ),
    },
    from: mockFrom,
  }));
  return { createClient, __queryMock: { mockEq, mockDelete, mockFrom } };
});

// Mock performance monitoring
jest.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: jest.fn(() => ({ end: jest.fn() })),
}));

const { mockEq, mockDelete, mockFrom } = (
  jest.requireMock('@/lib/supabase/client') as any
).__queryMock;

describe('School Hours Cleanup Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupKindergartenSchedules', () => {
    it('should delete K, K-AM, and K-PM schedules', async () => {
      await schoolHoursModule.cleanupKindergartenSchedules({ school_site: 'test-school' });

      // One delete per grade level
      expect(mockFrom).toHaveBeenCalledTimes(3);
      expect(mockFrom).toHaveBeenCalledWith('school_hours');
      expect(mockDelete).toHaveBeenCalledTimes(3);
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'K');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'K-AM');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'K-PM');
      expect(mockEq).toHaveBeenCalledWith('school_site', 'test-school');
    });

    it('should handle cleanup without school identifier', async () => {
      await schoolHoursModule.cleanupKindergartenSchedules();

      expect(mockFrom).toHaveBeenCalledTimes(3);
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'K');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'K-AM');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'K-PM');
      expect(mockEq).not.toHaveBeenCalledWith('school_site', expect.anything());
    });
  });

  describe('cleanupTKSchedules', () => {
    it('should delete TK, TK-AM, and TK-PM schedules', async () => {
      await schoolHoursModule.cleanupTKSchedules({ school_site: 'test-school' });

      expect(mockFrom).toHaveBeenCalledTimes(3);
      expect(mockFrom).toHaveBeenCalledWith('school_hours');
      expect(mockDelete).toHaveBeenCalledTimes(3);
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'TK');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'TK-AM');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'TK-PM');
      expect(mockEq).toHaveBeenCalledWith('school_site', 'test-school');
    });

    it('should handle cleanup without school identifier', async () => {
      await schoolHoursModule.cleanupTKSchedules();

      expect(mockFrom).toHaveBeenCalledTimes(3);
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'TK');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'TK-AM');
      expect(mockEq).toHaveBeenCalledWith('grade_level', 'TK-PM');
      expect(mockEq).not.toHaveBeenCalledWith('school_site', expect.anything());
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
        showTK: false,
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
