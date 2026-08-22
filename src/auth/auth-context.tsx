import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authClient } from './auth-client';
import { clearNativeToken } from './native-token';

interface AuthUser {
  id: string;
  email: string;
  /** Present because the server declares `role` as a better-auth additional
   *  field. Only ever 'admin' when granted manually in the database; the UI
   *  flag is cosmetic: every /api/admin route re-checks the role server-side. */
  role?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then((res) => {
      setUser(res.data?.user ?? null);
    }).catch(() => {
      setUser(null);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  async function signOut() {
    await authClient.signOut();
    // Web sessions die with the cookie the server clears, but the native
    // bearer token lives in localStorage and would otherwise survive sign-out
    // and silently re-authenticate on the next launch.
    clearNativeToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.role === 'admin', loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
