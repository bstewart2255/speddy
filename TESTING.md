# Testing Infrastructure

This project uses Jest and React Testing Library for comprehensive testing of the Next.js application.

## Overview

- **Jest**: JavaScript testing framework
- **React Testing Library**: Testing utilities for React components
- **TypeScript**: Full TypeScript support in tests
- **Supabase Mocks**: Complete mocking utilities for Supabase operations

## Folder Structure

```
├── __tests__/
│   ├── unit/              # Unit tests for individual components/functions
│   ├── integration/       # Integration tests for complete flows
│   └── e2e/              # End-to-end tests (placeholder for future)
├── __mocks__/            # Mock implementations
│   └── @supabase/        # Supabase client mocks
├── test-utils/           # Testing utilities and helpers
├── jest.config.js        # Jest configuration
└── jest.setup.js         # Jest setup file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests in CI mode
npm run test:ci
```

## Writing Tests

### Unit Tests

Unit tests focus on individual components or functions in isolation:

```typescript
import { render, screen, userEvent } from '@/test-utils'
import MyComponent from '@/app/components/MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    const user = userEvent.setup()
    render(<MyComponent />)
    
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Clicked!')).toBeInTheDocument()
  })
})
```

### Integration Tests

Integration tests verify complete user flows:

```typescript
import { render, screen, waitFor } from '@/test-utils'
import { setupSupabaseScenario } from '@/test-utils/supabase-test-helpers'

describe('User Authentication Flow', () => {
  it('completes login and redirects to dashboard', async () => {
    // Setup authenticated Supabase client
    const mockSupabase = setupSupabaseScenario.authenticated()
    
    // Test the complete flow
    // ...
  })
})
```

### Testing with Supabase

The project includes comprehensive Supabase mocking utilities:

```typescript
import { createMockSupabaseClient, mockSupabaseResponse } from '@/test-utils/supabase-test-helpers'

// Create a mock client
const supabase = createMockSupabaseClient()

// Mock specific responses
supabase.auth.getSession.mockResolvedValue(
  mockSupabaseResponse.session({ email: 'test@example.com' })
)

// Mock database queries
supabase.from.mockReturnValue({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(
    mockSupabaseResponse.dbSuccess({ id: 1, name: 'Test' })
  ),
})
```

## Test Utilities

### Custom Render Function

The custom render function includes all necessary providers:

```typescript
import { render } from '@/test-utils'

// Automatically wrapped with providers
render(<MyComponent />)
```

### Mock Data Generators

```typescript
import { createMockSupabaseData } from '@/test-utils'

const mockUser = createMockSupabaseData.user({
  email: 'custom@example.com'
})

const mockSchool = createMockSupabaseData.school({
  name: 'Custom School'
})
```

### API Mocking

```typescript
import { mockFetch, mockFetchError } from '@/test-utils'

// Mock successful response
mockFetch({ success: true, data: [] })

// Mock error response
mockFetchError(401, 'Unauthorized')
```

## Coverage Requirements

The project has the following coverage thresholds:

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

Run `npm run test:coverage` to see the current coverage report.

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the component does, not how it does it
2. **Use Testing Library Queries**: Prefer queries that reflect how users interact with your app
3. **Avoid Testing Implementation Details**: Don't test state, methods, or component instances
4. **Write Descriptive Test Names**: Use clear, descriptive names that explain what is being tested
5. **Keep Tests Independent**: Each test should be able to run in isolation
6. **Use beforeEach for Setup**: Reset mocks and state before each test
7. **Test Error States**: Always test error handling and edge cases

## Common Testing Patterns

### Testing Forms

```typescript
it('submits form with user data', async () => {
  const user = userEvent.setup()
  render(<FormComponent />)
  
  await user.type(screen.getByLabelText('Email'), 'test@example.com')
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith('/api/submit', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' })
    })
  })
})
```

### Testing Async Operations

```typescript
it('loads data on mount', async () => {
  mockFetch({ data: ['item1', 'item2'] })
  render(<DataList />)
  
  expect(screen.getByText('Loading...')).toBeInTheDocument()
  
  await waitFor(() => {
    expect(screen.getByText('item1')).toBeInTheDocument()
    expect(screen.getByText('item2')).toBeInTheDocument()
  })
})
```

### Testing Error Boundaries

```typescript
it('displays error message when component fails', () => {
  const ThrowError = () => {
    throw new Error('Test error')
  }
  
  render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  )
  
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
})
```

## Debugging Tests

1. **Use screen.debug()**: Print the current DOM state
2. **Use screen.logTestingPlaygroundURL()**: Get a Testing Playground link
3. **Run single test**: Use `it.only()` or `describe.only()`
4. **Increase timeout**: For slow async operations, increase Jest timeout
5. **Check mock calls**: Use `expect(mockFn).toHaveBeenCalledWith()`

## CI/CD Integration

Tests run automatically on CI with:

```bash
npm run test:ci
```

This command:
- Runs in non-interactive mode
- Generates coverage reports
- Limits workers to prevent memory issues
- Fails if coverage thresholds aren't met