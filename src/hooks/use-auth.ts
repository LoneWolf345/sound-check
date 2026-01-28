import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

// Internal user accounts - these will be created in Supabase Auth
// Password is simple since this is an internal-only application
const INTERNAL_PASSWORD = 'soundcheck-internal-2024';

export interface InternalUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

// Define internal users - IDs will be assigned by Supabase Auth upon sign-in
export const INTERNAL_USERS: Omit<InternalUser, 'id'>[] = [
  { email: 'john.smith@company.com', name: 'John Smith', isAdmin: false },
  { email: 'jane.doe@company.com', name: 'Jane Doe', isAdmin: false },
  { email: 'admin@company.com', name: 'Admin User', isAdmin: true },
];

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [internalUser, setInternalUser] = useState<InternalUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  // Check admin role from database
  const checkAdminRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'admin'
      });
      if (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data ?? false);
      }
    } catch (err) {
      console.error('Failed to check admin role:', err);
      setIsAdmin(false);
    }
  }, []);

  // Find internal user by email
  const findInternalUser = useCallback((email: string): InternalUser | null => {
    const found = INTERNAL_USERS.find(u => u.email === email);
    if (found) {
      // Use the auth user's actual ID
      return null; // We'll set this after we have the auth user ID
    }
    return null;
  }, []);

  // Update internal user state from auth user
  const updateInternalUserFromAuth = useCallback((authUser: User | null) => {
    if (!authUser) {
      setInternalUser(null);
      setIsAdmin(false);
      return;
    }

    const found = INTERNAL_USERS.find(u => u.email === authUser.email);
    if (found) {
      setInternalUser({
        id: authUser.id,
        email: authUser.email!,
        name: found.name,
        isAdmin: found.isAdmin
      });
      // Check actual admin role from database
      checkAdminRole(authUser.id);
    }
  }, [checkAdminRole]);

  // Initialize auth state
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        updateInternalUserFromAuth(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // Then get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      updateInternalUserFromAuth(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [updateInternalUserFromAuth]);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    setIsSwitching(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return { user: data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    } finally {
      setIsSwitching(false);
    }
  }, []);

  // Sign up a new user (for initial setup)
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;
      return { user: data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }, []);

  // Switch to a different internal user
  const switchUser = useCallback(async (email: string) => {
    setIsSwitching(true);
    try {
      // First try to sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: INTERNAL_PASSWORD,
      });

      if (error) {
        // If user doesn't exist, try to create them
        if (error.message.includes('Invalid login credentials')) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password: INTERNAL_PASSWORD,
            options: {
              emailRedirectTo: window.location.origin
            }
          });

          if (signUpError) throw signUpError;
          
          // With auto-confirm enabled, user should be signed in
          if (signUpData.user) {
            // Set up admin role if needed
            const internalUserDef = INTERNAL_USERS.find(u => u.email === email);
            if (internalUserDef?.isAdmin) {
              await setupAdminRole(signUpData.user.id);
            }
            return { user: signUpData.user, error: null };
          }
        }
        throw error;
      }

      return { user: data.user, error: null };
    } catch (error) {
      console.error('Error switching user:', error);
      return { user: null, error: error as Error };
    } finally {
      setIsSwitching(false);
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  return {
    user,
    internalUser,
    isAdmin,
    isLoading,
    isSwitching,
    signIn,
    signUp,
    signOut,
    switchUser,
    internalUsers: INTERNAL_USERS,
  };
}

// Helper to set up admin role for a user
async function setupAdminRole(userId: string) {
  try {
    // Check if role already exists
    const { data: existing } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!existing) {
      // Insert admin role
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'admin'
        });

      if (error) {
        console.error('Error setting up admin role:', error);
      }
    }
  } catch (err) {
    console.error('Failed to setup admin role:', err);
  }
}
