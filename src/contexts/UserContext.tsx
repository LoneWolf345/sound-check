import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { MockUser } from '@/types';

// Default mock users for development
const MOCK_USERS: MockUser[] = [
  { id: 'user-1', name: 'John Smith', email: 'john.smith@company.com', isAdmin: false },
  { id: 'user-2', name: 'Jane Doe', email: 'jane.doe@company.com', isAdmin: false },
  { id: 'admin-1', name: 'Admin User', email: 'admin@company.com', isAdmin: true },
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
