import React from 'react'
import { render, screen, waitFor, userEvent, mockFetch, mockFetchError } from '../../../test-utils'
import LoginForm from '@/app/(auth)/login/login-form'

// Mock the router
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

describe('LoginForm', () => {
  let originalLocation: Location
  
  beforeAll(() => {
    originalLocation = window.location
  })
  
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock window.location
    delete (window as any).location
    window.location = {
      ...originalLocation,
      href: 'http://localhost/',
      pathname: '/',
      search: '',
      assign: jest.fn(),
      reload: jest.fn(),
      replace: jest.fn(),
    } as any
  })
  
  afterAll(() => {
    window.location = originalLocation
  })

  it('renders login form with all fields', () => {
    render(<LoginForm />)
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/don't have an account/i)).toBeInTheDocument()
  })

  it('validates email format', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    
    const emailInput = screen.getByLabelText(/email/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    
    // Try invalid email
    await user.type(emailInput, 'invalid-email')
    await user.click(submitButton)
    
    // HTML5 validation should prevent form submission
    expect(emailInput).toBeInvalid()
  })

  it('handles successful login', async () => {
    const user = userEvent.setup()
    mockFetch({ success: true })
    
    render(<LoginForm />)
    
    // Fill in form
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    
    // Wait for async operations
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      })
    })
    
    // Should redirect to dashboard
    await waitFor(() => {
      expect(window.location.href).toBe('/dashboard')
    })
  })

  it('handles login with payment required', async () => {
    const user = userEvent.setup()
    mockFetch({ success: true, needsPayment: true })
    
    render(<LoginForm />)
    
    // Fill in form
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    
    // Should redirect to payment
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/signup?step=payment&subscription_required=true')
    })
  })

  it('displays error message on failed login', async () => {
    const user = userEvent.setup()
    mockFetchError(401, 'Invalid credentials')
    
    render(<LoginForm />)
    
    // Fill in form
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    
    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
    
    // Should not redirect
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('disables form during submission', async () => {
    const user = userEvent.setup()
    
    // Mock a slow response
    global.fetch = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ success: true }),
      }), 1000))
    )
    
    render(<LoginForm />)
    
    // Fill in form
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    
    // Submit form
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(submitButton)
    
    // Button should be disabled and show loading state
    expect(submitButton).toBeDisabled()
    expect(screen.getByText(/signing in/i)).toBeInTheDocument()
  })

  it('clears password from URL if accidentally exposed', async () => {
    // Mock URL with password parameter
    window.location.search = '?password=exposed'
    window.location.pathname = '/login'
    window.location.href = 'http://localhost/login?password=exposed'
    
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    
    // Mock fetch to prevent actual API call
    mockFetch({ success: true })
    
    render(<LoginForm />)
    
    // Submit form to trigger the check
    const user = userEvent.setup()
    
    // Fill in required fields first
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    
    // Should clear the URL - wait for it to happen
    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith({}, expect.any(String), '/login')
    })
    
    replaceStateSpy.mockRestore()
  })
})