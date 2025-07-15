import React from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock providers that wrap components
interface ProvidersProps {
  children: React.ReactNode
}

function Providers({ children }: ProvidersProps) {
  return <>{children}</>
}

// Custom render function that includes providers
function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return rtlRender(ui, { wrapper: Providers, ...options })
}

// Re-export everything
export * from '@testing-library/react'

// Override render method
export { customRender as render }

// Export userEvent
export { userEvent }

// Utility to create mock Supabase data
export const createMockSupabaseData = {
  user: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),
  
  school: (overrides = {}) => ({
    id: 'test-school-id',
    name: 'Test School',
    domain: 'testschool.edu',
    created_at: new Date().toISOString(),
    ...overrides,
  }),
  
  subscription: (overrides = {}) => ({
    id: 'test-subscription-id',
    user_id: 'test-user-id',
    status: 'active',
    stripe_subscription_id: 'sub_test123',
    stripe_customer_id: 'cus_test123',
    created_at: new Date().toISOString(),
    ...overrides,
  }),
}

// Utility to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0))

// Mock fetch responses
export const mockFetch = (response: any) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
    status: 200,
    statusText: 'OK',
  })
}

// Mock failed fetch
export const mockFetchError = (status = 500, message = 'Internal Server Error') => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: message }),
    status,
    statusText: message,
  })
}