import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, INTERNAL_USERS, type InternalUser } from '@/hooks/use-auth';
import type { User } from '@supabase/supabase-js';

interface AuthContextValue {
  // Supabase auth user
  user: User | null;
  // Internal user with name and admin flag
  internalUser: InternalUser | null;
  // Admin status from database
  isAdmin: boolean;
  // Loading state
  isLoading: boolean;
  // Switching users
  isSwitching: boolean;
  // Available internal users for switcher
  internalUsers: Omit<InternalUser, 'id'>[];
  // Switch to a different internal user
  switchUser: (email: string) => Promise<{ user: User | null; error: Error | null }>;
  // Sign out
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const value: AuthContextValue = {
    user: auth.user,
    internalUser: auth.internalUser,
    isAdmin: auth.isAdmin,
    isLoading: auth.isLoading,
    isSwitching: auth.isSwitching,
    internalUsers: INTERNAL_USERS,
    switchUser: auth.switchUser,
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
