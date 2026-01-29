import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, type Profile } from '@/hooks/use-auth';
import type { User } from '@supabase/supabase-js';

interface AuthContextValue {
  // Supabase auth user
  user: User | null;
  // User profile with display name
  profile: Profile | null;
  // Admin status from database
  isAdmin: boolean;
  // Loading state
  isLoading: boolean;
  // Sign in with email/password
  signIn: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>;
  // Sign up with email/password and display name
  signUp: (email: string, password: string, displayName: string) => Promise<{ user: User | null; error: Error | null }>;
  // Sign out
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const value: AuthContextValue = {
    user: auth.user,
    profile: auth.profile,
    isAdmin: auth.isAdmin,
    isLoading: auth.isLoading,
    signIn: auth.signIn,
    signUp: auth.signUp,
    signOut: auth.signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
