import React from 'react'
import { render, screen, waitFor, userEvent } from '../../test-utils'
import { createMockSupabaseClient, mockSupabaseResponse, setupSupabaseScenario } from '../../test-utils/supabase-test-helpers'
import LoginForm from '@/app/(auth)/login/login-form'
import DashboardLayout from '@/app/(dashboard)/layout'

// Mock dependencies
const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => createMockSupabaseClient(),
}))

describe('Authentication Flow Integration', () => {
  let consoleErrorSpy: jest.SpyInstance
  
  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  
  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('Login to Dashboard Flow', () => {
    it('completes full authentication flow from login to dashboard', async () => {
      const user = userEvent.setup()
      
      // Step 1: Render login form
      const { unmount } = render(<LoginForm />)
      
      // Mock successful login API response
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
        status: 200,
      })
      
      // Step 2: Fill and submit login form
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))
      
      // Step 3: Verify redirect to dashboard
      await waitFor(() => {
        expect(window.location.href).toBe('/dashboard')
      })
      
      unmount()
      
      // Step 4: Setup authenticated Supabase client
      const mockSupabase = setupSupabaseScenario.authenticated()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Step 5: Render dashboard layout
      render(
        <DashboardLayout>
          <div>Dashboard Content</div>
        </DashboardLayout>
      )
      
      // Step 6: Verify dashboard renders with authenticated user
      await waitFor(() => {
        expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
      })
      
      // Should not redirect away from dashboard
      expect(mockPush).not.toHaveBeenCalledWith('/login')
    })

    it('redirects to login when accessing dashboard without authentication', async () => {
      // Setup unauthenticated Supabase client
      const mockSupabase = setupSupabaseScenario.unauthenticated()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Try to render dashboard
      render(
        <DashboardLayout>
          <div>Dashboard Content</div>
        </DashboardLayout>
      )
      
      // Should redirect to login
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      })
      
      // Dashboard content should not be visible
      expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument()
    })

    it('handles login with payment required flow', async () => {
      const user = userEvent.setup()
      
      // Render login form
      render(<LoginForm />)
      
      // Mock login API response indicating payment required
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, needsPayment: true }),
        status: 200,
      })
      
      // Fill and submit login form
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))
      
      // Should redirect to payment step
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/signup?step=payment&subscription_required=true')
      })
    })
  })

  describe('Session Management', () => {
    it('maintains session across page navigations', async () => {
      // Setup authenticated session
      const mockSupabase = setupSupabaseScenario.authenticated()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // First render - dashboard
      const { unmount: unmount1 } = render(
        <DashboardLayout>
          <div>Page 1</div>
        </DashboardLayout>
      )
      
      await waitFor(() => {
        expect(screen.getByText('Page 1')).toBeInTheDocument()
      })
      
      // Verify session was checked
      expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      
      unmount1()
      
      // Second render - different page
      render(
        <DashboardLayout>
          <div>Page 2</div>
        </DashboardLayout>
      )
      
      await waitFor(() => {
        expect(screen.getByText('Page 2')).toBeInTheDocument()
      })
      
      // Session should still be valid
      expect(mockPush).not.toHaveBeenCalledWith('/login')
    })

    it('handles session expiration gracefully', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Start with valid session
      ;(mockSupabase.auth.getSession as jest.Mock).mockResolvedValueOnce(
        mockSupabaseResponse.session()
      )
      
      // Render dashboard
      const { rerender } = render(
        <DashboardLayout>
          <div>Dashboard Content</div>
        </DashboardLayout>
      )
      
      await waitFor(() => {
        expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
      })
      
      // Simulate session expiration
      ;(mockSupabase.auth.getSession as jest.Mock).mockResolvedValueOnce(
        mockSupabaseResponse.noSession()
      )
      
      // Trigger re-render (simulating navigation or refresh)
      rerender(
        <DashboardLayout>
          <div>Dashboard Content</div>
        </DashboardLayout>
      )
      
      // Should redirect to login
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      })
    })
  })

  describe('Error Handling', () => {
    it('handles authentication errors gracefully', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Mock auth error
      ;(mockSupabase.auth.getSession as jest.Mock).mockResolvedValueOnce(
        mockSupabaseResponse.authError('Network error')
      )
      
      // Render dashboard
      render(
        <DashboardLayout>
          <div>Dashboard Content</div>
        </DashboardLayout>
      )
      
      // Should redirect to login on error
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      })
      
      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unexpected error in dashboard layout auth check',
        })
      )
    })

    it('handles unexpected errors in auth check', async () => {
      const mockSupabase = createMockSupabaseClient()
      jest.mocked(createMockSupabaseClient).mockReturnValue(mockSupabase)
      
      // Mock unexpected error
      ;(mockSupabase.auth.getSession as jest.Mock).mockRejectedValueOnce(
        new Error('Unexpected error')
      )
      
      // Render dashboard
      render(
        <DashboardLayout>
          <div>Dashboard Content</div>
        </DashboardLayout>
      )
      
      // Should redirect to login on error
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      })
      
      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unexpected error in dashboard layout auth check',
        })
      )
    })
  })
})