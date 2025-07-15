export const createClient = jest.fn(() => {
  const authUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    user_metadata: {},
  }

  const mockSupabase = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            user: authUser,
            access_token: 'test-token',
            refresh_token: 'test-refresh-token',
          },
        },
        error: null,
      }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: authUser },
        error: null,
      }),
      signUp: jest.fn().mockResolvedValue({
        data: {
          user: authUser,
          session: {
            user: authUser,
            access_token: 'test-token',
            refresh_token: 'test-refresh-token',
          },
        },
        error: null,
      }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: authUser,
          session: {
            user: authUser,
            access_token: 'test-token',
            refresh_token: 'test-refresh-token',
          },
        },
        error: null,
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      containedBy: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      overlaps: jest.fn().mockReturnThis(),
      match: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: {}, error: null }),
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
    storage: {
      from: jest.fn((bucket: string) => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
        download: jest.fn().mockResolvedValue({ data: new Blob(), error: null }),
        remove: jest.fn().mockResolvedValue({ data: [], error: null }),
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://test-url.com' } }),
      })),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }

  return mockSupabase
})

export const createServerClient = createClient
export const createBrowserClient = createClient