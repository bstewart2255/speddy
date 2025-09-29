import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/signup', '/terms', '/privacy', '/ferpa']
  const isPublicRoute = publicRoutes.some(route => pathname === route)

  // If at root, redirect to login
  if (pathname === '/') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // Allow public routes
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // BYPASS AUTH FOR E2E TESTS - ONLY IN CI ENVIRONMENT
  // Multiple safety checks to prevent accidental exposure
  // Note: Next.js always sets NODE_ENV=production when built, so we use a custom env var
  if (
    process.env.CI === 'true' && // Only in CI environment
    process.env.ENABLE_TEST_AUTH_BYPASS === 'true' && // Explicit opt-in
    request.headers.get('x-test-auth-bypass') === 'true'
  ) {
    console.warn('⚠️ Test auth bypass active - this should only happen in CI tests');
    const response = NextResponse.next()
    response.headers.set('x-user-id', 'test-user-id')
    response.headers.set('x-user-email', 'test@example.com')
    return response
  }

  // Create a Supabase client to verify the session
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({
              name,
              value,
              ...options,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            })
          })
        },
      },
    }
  )

  // Refresh the session to ensure it's valid and update cookies
  const { data: { session }, error } = await supabase.auth.getSession()

  // If no valid session and trying to access protected route, redirect to login
  if (!session || error) {
    console.log('No valid session, redirecting to login', { error: error?.message })
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // Optionally verify the JWT token is not expired
  const user = session.user
  if (!user) {
    console.log('No user in session, redirecting to login')
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // For authenticated users, pass the session info in headers
  response.headers.set('x-user-id', user.id)
  response.headers.set('x-user-email', user.email || '')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}