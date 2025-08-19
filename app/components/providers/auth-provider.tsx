"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { validatePassword } from "../../../lib/utils/password-validation";
import { useActivityTracker } from "../../../lib/hooks/use-activity-tracker";
import { TimeoutWarningModal } from "../auth/timeout-warning-modal";
import { SESSION_CONFIG, isExemptRoute } from "../../../lib/config/session-timeout";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  checkSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  extendSession: () => void;
  keepAlive: (activityType: string) => void;
}

interface SignUpMetadata {
  full_name: string;
  role: string;
  state: string;
  school_district: string;
  school_site: string;
  works_at_multiple_schools?: boolean;
  additional_schools?: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define public routes that don't need auth
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

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
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setInitialized(true);
    } catch (error) {
      console.error('Session check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only check session if we're not on a public route
    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname?.startsWith(route));

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

  const signUp = async (
    email: string,
    password: string,
    metadata: SignUpMetadata & { works_at_multiple_schools?: boolean },
  ) => {
    try {
      setLoading(true);

      // Validate password requirements
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors[0]);
      }

      // Role mapping from form values to database values
      const roleMap: { [key: string]: string } = {
        resource_specialist: "resource",
        speech_therapist: "speech",
        occupational_therapist: "ot",
        counselor: "counseling",
        program_specialist: "specialist",
        sea: "sea",
        other: "resource",
      };

      const dbRole = roleMap[metadata.role] || metadata.role;

      // Validate district email domain
      const emailDomain = email.split("@")[1];
      if (
        !emailDomain ||
        (!emailDomain.includes(".edu") &&
          !emailDomain.includes(".org") &&
          !emailDomain.includes(".k12.") &&
          !emailDomain.includes(".gov"))
      ) {
        throw new Error("Please use your district email address");
      }

      // Validate school site name (no abbreviations)
      if (metadata.school_site.length < 5 || !/\s/.test(metadata.school_site)) {
        throw new Error(
          "Please enter your full school site name (no abbreviations - and spell correctly!)",
        );
      }

      // Use our API route to handle signup with profile creation
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          metadata: {
            full_name: metadata.full_name,
            state: metadata.state,
            school_district: metadata.school_district,
            school_site: metadata.school_site,
            role: dbRole,
            works_at_multiple_schools: metadata.works_at_multiple_schools || false,
            additional_schools: metadata.additional_schools || []
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (isTimeoutLogout = false) => {
    // Clear sensitive data from memory
    try {
      // Clear any cached data
      if (typeof window !== 'undefined') {
        // Clear localStorage items that might contain sensitive data
        localStorage.removeItem('lastActivity');
        
        // Clear any cached Supabase data
        await supabase.auth.signOut();
        // Clear any other sensitive caches if needed
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(name => caches.delete(name))
          );
        }
      }
    } catch (error) {
      console.error('Error during security cleanup:', error);
    }
    
    setUser(null);
    setInitialized(false);
    setShowTimeoutWarning(false);
    
    // Show different messages for timeout vs manual logout
    if (isTimeoutLogout) {
      router.push("/login?timeout=true");
    } else {
      router.push("/login");
    }
  };

  // Activity tracking handlers
  const handleActivity = useCallback(() => {
    // Activity detected - session is still active
  }, []);

  const handleTimeoutWarning = useCallback(() => {
    if (user && !isExemptRoute(pathname || '')) {
      setWarningRemainingTime(SESSION_CONFIG.WARNING_TIME / 1000); // Convert to seconds
      setShowTimeoutWarning(true);
    }
  }, [user, pathname]);

  const handleTimeout = useCallback(() => {
    signOut(true); // Timeout logout
  }, []);

  const handleStaySignedIn = useCallback(() => {
    setShowTimeoutWarning(false);
    extendSession();
  }, []);

  const handleTimeoutLogout = useCallback(() => {
    setShowTimeoutWarning(false);
    signOut(true);
  }, []);

  // Initialize activity tracker only for authenticated users on protected routes
  const shouldTrackActivity = user && !isExemptRoute(pathname || '');
  
  const { extendSession, keepAlive } = useActivityTracker({
    timeout: shouldTrackActivity ? SESSION_CONFIG.TIMEOUT_DURATION : 0,
    warningTime: SESSION_CONFIG.WARNING_TIME,
    throttleInterval: SESSION_CONFIG.ACTIVITY_THROTTLE,
    onActivity: handleActivity,
    onWarning: handleTimeoutWarning,
    onTimeout: handleTimeout,
  });

  const value = {
    user,
    loading,
    initialized,
    checkSession,
    signIn,
    signUp,
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