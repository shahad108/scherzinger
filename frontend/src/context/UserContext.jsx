import { createContext, useContext, useState, useEffect } from 'react';
import { getSession } from '../utils/auth';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => {
    const session = getSession();
    return session ? { name: session.name, role: session.role, initials: session.initials } : null;
  });

  useEffect(() => {
    // Re-check session validity on mount
    const session = getSession();
    if (session) {
      setUser({ name: session.name, role: session.role, initials: session.initials });
    } else {
      setUser(null);
    }
  }, []);

  return (
    <UserContext.Provider value={user}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
