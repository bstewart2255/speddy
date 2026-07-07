"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { useActivityTracker } from "../../../lib/hooks/use-activity-tracker";
import { TimeoutWarningModal } from "../auth/timeout-warning-modal";
import { SESSION_CONFIG, isExemptRoute } from "../../../lib/config/session-timeout";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  checkSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: (isTimeoutLogout?: boolean) => Promise<void>;
  extendSession: () => void;
  keepAlive: (activityType: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define public routes that don't need auth
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/how-it-works'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [warningRemainingTime, setWarningRemainingTime] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  // Check session only when needed
  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user ?? null);
      setInitialized(true);
    } catch (error) {
      console.error('Session check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only check session if we're not on a public route. '/' is the marketing
    // landing page and is matched exactly (startsWith('/') would match all).
    const isPublicRoute =
      pathname === '/' || PUBLIC_ROUTES.some(route => pathname?.startsWith(route));

    if (!isPublicRoute && !initialized) {
      checkSession();
    }

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) {
        setInitialized(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, initialized, checkSession]);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // The onAuthStateChange will handle setting the user
      router.push("/dashboard");
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = useCallback(async (isTimeoutLogout = false) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lastActivity');
        await supabase.auth.signOut();
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
      }
    } catch (error) {
      console.error('Error during security cleanup:', error);
    } finally {
      setUser(null);
      setInitialized(false);
      setShowTimeoutWarning(false);
      router.push(isTimeoutLogout ? "/login?timeout=true" : "/login");
    }
  }, [router]);

  // Initialize activity tracker only for authenticated users on protected routes
  const shouldTrackActivity = !!user && !isExemptRoute(pathname || '');
  
  const { extendSession, keepAlive } = useActivityTracker({
    timeout: shouldTrackActivity ? SESSION_CONFIG.TIMEOUT_DURATION : 0,
    warningTime: SESSION_CONFIG.WARNING_TIME,
    throttleInterval: SESSION_CONFIG.ACTIVITY_THROTTLE,
    onActivity: useCallback(() => {
      // Activity detected - session is still active
    }, []),
    onWarning: useCallback(() => {
      if (user && !isExemptRoute(pathname || '')) {
        setWarningRemainingTime(SESSION_CONFIG.WARNING_TIME / 1000); // Convert to seconds
        setShowTimeoutWarning(true);
      }
    }, [user, pathname]),
    onTimeout: useCallback(() => {
      signOut(true);
    }, [signOut]),
  });

  const handleStaySignedIn = useCallback(() => {
    setShowTimeoutWarning(false);
    extendSession();
  }, [extendSession]);

  const handleTimeoutLogout = useCallback(() => {
    setShowTimeoutWarning(false);
    signOut(true);
  }, [signOut]);

  const value = {
    user,
    loading,
    initialized,
    checkSession,
    signIn,
    signOut,
    extendSession,
    keepAlive,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <TimeoutWarningModal
        isOpen={showTimeoutWarning}
        onStaySignedIn={handleStaySignedIn}
        onLogout={handleTimeoutLogout}
        remainingSeconds={warningRemainingTime}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}