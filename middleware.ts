  import { createServerClient } from '@supabase/ssr'
  import { NextResponse } from 'next/server'
  import type { NextRequest } from 'next/server'

  export async function middleware(request: NextRequest) {
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
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value,
              ...options,
              sameSite: 'lax',
              path: '/',
            })
          },
          remove(name: string, options: any) {
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value: '',
              ...options,
              sameSite: 'lax',
              path: '/',
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    console.log('Middleware check:', { pathname, userId: user?.id })

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/signup', '/terms', '/privacy', '/ferpa']
    const isPublicRoute = publicRoutes.some(route => pathname === route)

    // Protected routes that require authentication
    const protectedRoutes = ['/dashboard', '/']
    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route)) && !isPublicRoute

    // If no user and trying to access protected route, redirect to login
    if (!user && isProtectedRoute) {
      console.log('No user, redirecting to login')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // For authenticated users accessing protected routes, check subscription
    if (user && isProtectedRoute) {
      console.log('Checking subscription for user:', user.id)

      // Check if they're a SEA user (free access)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'sea') {
        console.log('SEA user, allowing access')
        return response
      }

      // Check subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle()

      console.log('Subscription:', subscription)

      // If no subscription or not active/trialing, redirect to payment
      if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
        console.log('No valid subscription, redirecting to payment')
        return NextResponse.redirect(new URL('/signup?step=payment&subscription_required=true', request.url))
      }
    }

    return response
  }

  export const config = {
    matcher: [
      '/((?!_next/static|_next/image|favicon.ico|api).*)',
    ],
  }