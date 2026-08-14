import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Define public routes that don't require authentication
  // '/' is the marketing landing page and is open to everyone.
  //
  // '/auth/reset-callback' and '/reset-password' are the self-service password
  // reset flow (SPE-68). They must be public: the user arrives from an emailed
  // link with no session yet, and the callback is what establishes one. Listing
  // '/reset-password' here also keeps it clear of the must_change_password
  // redirect below — a user whom an admin had also queued a reset for would
  // otherwise be bounced to /change-password instead of the page they were sent
  // to. The page itself verifies the recovery session server-side.
  const publicRoutes = ['/', '/how-it-works', '/login', '/terms', '/privacy', '/ferpa', '/auth/callback', '/auth/reset-callback', '/reset-password']
  const isPublicRoute = publicRoutes.some(route => pathname === route)

  // Routes allowed for users who must change their password
  const passwordChangeRoutes = ['/change-password']
  const isPasswordChangeRoute = passwordChangeRoutes.some(route => pathname === route)

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
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // Optionally verify the JWT token is not expired
  const user = session.user
  if (!user) {
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
  const isChatRoute = pathname.startsWith('/dashboard/chat')
  const isTechRoute = pathname.startsWith('/dashboard/tech')
  const isSettingsRoute = pathname.startsWith('/dashboard/settings')
  const isDashboardRoute = pathname.startsWith('/dashboard')

  // District Tech Admins (SPE-393) see the integrations portal and nothing
  // else — no student data, no CARE, no chat, no scheduling, no admin pages.
  // This runs BEFORE the CARE/Chat early return below, which would otherwise
  // wave them straight through: that exemption is unconditional for every
  // authenticated user, so an "everything except" rule placed after it would
  // silently leak both surfaces.
  // The one exemption is /internal, which stays governed by is_speddy_admin
  // below — that flag is orthogonal to the role and shouldn't be revoked here.
  if (userRole === 'district_tech' && !(isInternalRoute && isSpeddyAdmin)) {
    // Settings is the one shared page they keep: it renders their own account
    // only, and they need somewhere to change their password.
    if (isTechRoute || isSettingsRoute) {
      return response
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard/tech'
    return NextResponse.redirect(redirectUrl)
  }

  // Conversely, nobody else has a reason to be in the tech portal.
  if (isTechRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  // CARE and Chat are cross-role surfaces: exempt them from the admin/teacher
  // section redirects below so site admins and teachers can reach them. (Chat
  // eligibility — e.g. the SEA exclusion — is enforced by RLS and the nav.)
  if (isCareRoute || isChatRoute) {
    return response
  }

  // Internal routes are only for Speddy admins
  if (isInternalRoute && !isSpeddyAdmin) {
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