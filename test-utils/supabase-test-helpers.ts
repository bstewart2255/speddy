import { createClient } from '@supabase/supabase-js'

// Type definitions for better TypeScript support
export interface MockSupabaseClient {
  auth: any
  from: jest.Mock
  storage: any
  rpc: jest.Mock
}

// Create a properly typed mock Supabase client
export const createMockSupabaseClient = jest.fn(() => {
  const client: MockSupabaseClient = {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      then: jest.fn(),
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn(),
        remove: jest.fn(),
        list: jest.fn(),
      })),
    },
    rpc: jest.fn(),
  }
  
  return client
})

// Helper to mock specific Supabase responses
export const mockSupabaseResponse = {
  // Auth responses
  session: (user = {}) => ({
    data: {
      session: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          ...user,
        },
        access_token: 'test-token',
        refresh_token: 'test-refresh-token',
      },
    },
    error: null,
  }),
  
  noSession: () => ({
    data: { session: null },
    error: null,
  }),
  
  authError: (message = 'Authentication failed') => ({
    data: null,
    error: { message, status: 401 },
  }),
  
  // Database responses
  dbSuccess: (data: any) => ({
    data,
    error: null,
  }),
  
  dbError: (message = 'Database error') => ({
    data: null,
    error: { message, code: 'PGRST000', details: '', hint: '' },
  }),
  
  // Storage responses
  storageUpload: (path = 'test-path') => ({
    data: { path },
    error: null,
  }),
  
  storageError: (message = 'Storage error') => ({
    data: null,
    error: { message, statusCode: '500' },
  }),
}

// Helper to reset all Supabase mocks
export const resetSupabaseMocks = () => {
  jest.clearAllMocks()
}

// Helper to setup common Supabase scenarios
export const setupSupabaseScenario = {
  authenticated: () => {
    const client = createMockSupabaseClient()
    client.auth.getSession.mockResolvedValue(
      mockSupabaseResponse.session()
    )
    return client
  },
  
  unauthenticated: () => {
    const client = createMockSupabaseClient()
    client.auth.getSession.mockResolvedValue(
      mockSupabaseResponse.noSession()
    )
    return client
  },
  
  withDbData: (table: string, data: any[]) => {
    const client = createMockSupabaseClient()
    client.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue(mockSupabaseResponse.dbSuccess(data)),
    })
    return client
  },
}