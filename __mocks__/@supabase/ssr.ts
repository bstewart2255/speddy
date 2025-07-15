export const createServerClient = jest.fn(() => {
  const authUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    user_metadata: {},
  }

  return {
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
    },
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      then: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  }
})

export const createBrowserClient = createServerClient