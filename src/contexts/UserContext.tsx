import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { MockUser } from '@/types';

// Default mock users for development - using valid UUIDs to match database schema
const MOCK_USERS: MockUser[] = [
  { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'John Smith', email: 'john.smith@company.com', isAdmin: false },
  { id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', name: 'Jane Doe', email: 'jane.doe@company.com', isAdmin: false },
  { id: 'c3d4e5f6-a7b8-9012-cdef-123456789012', name: 'Admin User', email: 'admin@company.com', isAdmin: true },
];

interface UserContextValue {
  user: MockUser | null;
  users: MockUser[];
  setUser: (user: MockUser) => void;
  isAdmin: boolean;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  // Default to first regular user
  const [user, setUserState] = useState<MockUser>(MOCK_USERS[0]);

  const setUser = useCallback((newUser: MockUser) => {
    setUserState(newUser);
  }, []);

  const value: UserContextValue = {
    user,
    users: MOCK_USERS,
    setUser,
    isAdmin: user?.isAdmin ?? false,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
