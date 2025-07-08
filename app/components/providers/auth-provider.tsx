"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase/client";
import { useRouter } from "next/navigation";
import { validatePassword } from "../../../lib/utils/password-validation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

interface SignUpMetadata {
  full_name: string;
  role: string;
  state: string;
  school_district: string;
  school_site: string;
  works_at_multiple_schools?: boolean;
  additional_schools?: string[]; // Add this
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      router.push("/dashboard");
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    metadata: SignUpMetadata & { works_at_multiple_schools?: boolean },
  ) => {
    try {
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
        other: "resource", // Default to resource for "other"
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

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: metadata.full_name,
            state: metadata.state,
            school_district: metadata.school_district,
            school_site: metadata.school_site,
            role: dbRole,
            works_at_multiple_schools: metadata.works_at_multiple_schools || false,
            additional_schools: metadata.additional_schools || [] // Add this
          },
        },
      });

      if (error) throw error;

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
