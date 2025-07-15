import { createMockSupabaseClient, mockSupabaseResponse, resetSupabaseMocks } from '../../test-utils/supabase-test-helpers'

// Mock globals if not available
if (typeof Request === 'undefined') {
  global.Request = class Request {
    url: string
    method: string
    headers: Headers
    body: ReadableStream | null
    
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : input.toString()
      this.method = init?.method || 'GET'
      this.headers = new Headers(init?.headers)
      this.body = init?.body as ReadableStream | null
    }
    
    async json() {
      if (!this.body) return {}
      // Simple implementation for testing
      const decoder = new TextDecoder()
      const reader = this.body.getReader()
      const { value } = await reader.read()
      return JSON.parse(decoder.decode(value))
    }
  } as any
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    status: number
    statusText: string
    headers: Headers
    body: ReadableStream | null
    
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      this.headers = new Headers(init?.headers)
      this.body = body as ReadableStream | null
    }
    
    async json() {
      if (!this.body) return {}
      return JSON.parse(this.body as any)
    }
  } as any
}

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => createMockSupabaseClient(),
}))

// Mock NextResponse
const mockJson = jest.fn()
const NextResponse = {
  json: (data: any, init?: ResponseInit) => {
    mockJson(data, init)
    return new Response(JSON.stringify(data), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  },
}

// Mock NextRequest with proper body handling
class NextRequest extends Request {
  private _body: string | null
  
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const body = init?.body
    const modifiedInit = {
      ...init,
      body: undefined // Remove body from init to avoid issues with Request constructor
    }
    super(input, modifiedInit)
    this._body = typeof body === 'string' ? body : null
  }
  
  async json() {
    if (!this._body) return {}
    return JSON.parse(this._body)
  }
}

// Import route handlers after mocks are set up
let loginRoute: any

beforeAll(async () => {
  jest.doMock('next/server', () => ({ NextResponse, NextRequest }))
  loginRoute = await import('@/app/api/auth/login/route')
})

describe('API Routes Integration Tests', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockJson.mockClear()
  })

  describe('/api/auth/login', () => {
    it('successfully authenticates user with valid credentials', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Mock successful authentication
      ;(mockSupabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: {
          user: { id: 'user-123', email: 'test@example.com' },
          session: { 
            access_token: 'token', 
            refresh_token: 'refresh',
            user: { id: 'user-123', email: 'test@example.com' }
          },
        },
        error: null,
      })
      
      // Mock user profile check - first call for profiles
      ;(mockSupabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: { role: 'teacher' },
          error: null,
        }),
      })
      
      // Mock subscription check - second call for subscriptions
      ;(mockSupabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: { status: 'active' },
          error: null,
        }),
      })
      
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      })
      
      const response = await loginRoute.POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        needsPayment: false,
      })
      
      // Verify auth was called
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })

    it('indicates payment required for users without subscription', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Mock successful authentication
      ;(mockSupabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        data: {
          user: { id: 'user-123', email: 'test@example.com' },
          session: { 
            access_token: 'token', 
            refresh_token: 'refresh',
            user: { id: 'user-123', email: 'test@example.com' }
          },
        },
        error: null,
      })
      
      // Mock user profile check - first call for profiles
      ;(mockSupabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: { role: 'teacher' },
          error: null,
        }),
      })
      
      // Mock no subscription - second call for subscriptions
      ;(mockSupabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      })
      
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      })
      
      const response = await loginRoute.POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        needsPayment: true,
      })
    })

    it('handles invalid credentials', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Mock authentication failure
      ;(mockSupabase.auth.signInWithPassword as jest.Mock).mockResolvedValueOnce(
        mockSupabaseResponse.authError('Invalid login credentials')
      )
      
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      })
      
      const response = await loginRoute.POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Invalid login credentials',
      })
    })

    it('validates required fields', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          // Missing password
        }),
      })
      
      const response = await loginRoute.POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'Email and password are required',
      })
    })
  })


  describe('Error Handling', () => {
    it('handles malformed JSON in request body', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: 'invalid json',
      })
      
      const response = await loginRoute.POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
    })

    it('handles database connection errors', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Mock database error
      ;(mockSupabase.auth.signInWithPassword as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection failed')
      )
      
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      })
      
      const response = await loginRoute.POST(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Internal server error',
      })
    })
  })
})