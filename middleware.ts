import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/signup', '/terms', '/privacy', '/ferpa']
  const isPublicRoute = publicRoutes.some(route => pathname === route)

  // Routes allowed for users who must change their password
  const passwordChangeRoutes = ['/change-password']
  const isPasswordChangeRoute = passwordChangeRoutes.some(route => pathname === route)

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

  // Fetch user profile to determine role, admin status, and password change requirement
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_speddy_admin, must_change_password')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role
  const isSpeddyAdmin = profile?.is_speddy_admin === true
  const mustChangePassword = profile?.must_change_password === true

  // If user must change password, only allow access to password change route
  if (mustChangePassword) {
    if (isPasswordChangeRoute) {
      return response
    }
    // Redirect to change-password page
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/change-password'
    return NextResponse.redirect(redirectUrl)
  }

  // If user doesn't need to change password but is on change-password page, redirect to dashboard
  if (isPasswordChangeRoute && !mustChangePassword) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  // For authenticated users, pass the session info and role in headers
  response.headers.set('x-user-id', user.id)
  response.headers.set('x-user-email', user.email || '')
  if (userRole) {
    response.headers.set('x-user-role', userRole)
  }

  // Role-based routing
  const isInternalRoute = pathname.startsWith('/internal')
  const isAdminRoute = pathname.startsWith('/dashboard/admin')
  const isTeacherRoute = pathname.startsWith('/dashboard/teacher')
  const isCareRoute = pathname.startsWith('/dashboard/care')
  const isDashboardRoute = pathname.startsWith('/dashboard')

  // CARE routes are accessible to all authenticated users
  if (isCareRoute) {
    return response
  }

  // Internal routes are only for Speddy admins
  if (isInternalRoute && !isSpeddyAdmin) {
    console.log('Non-speddy-admin trying to access internal route, redirecting')
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  // If user is an admin trying to access non-admin dashboard routes, redirect to admin dashboard
  if ((userRole === 'site_admin' || userRole === 'district_admin') && isDashboardRoute && !isAdminRoute && !isTeacherRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard/admin'
    return NextResponse.redirect(redirectUrl)
  }

  // If non-admin user trying to access admin routes, redirect to main dashboard
  if (userRole !== 'site_admin' && userRole !== 'district_admin' && isAdminRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  // If user is a teacher trying to access non-teacher dashboard routes, redirect to teacher dashboard
  if (userRole === 'teacher' && isDashboardRoute && !isTeacherRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard/teacher'
    return NextResponse.redirect(redirectUrl)
  }

  // If non-teacher user trying to access teacher routes, redirect to main dashboard
  if (userRole !== 'teacher' && isTeacherRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}