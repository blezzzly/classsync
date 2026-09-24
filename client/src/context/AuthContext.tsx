import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Role, User } from '@shared/types';
import {
  clearStoredSession,
  loginRequest,
  readStoredSession,
  restoreAuthToken,
  type StoredSession,
} from '../lib/session';

interface AuthContextValue {
  user: User | undefined;
  ready: boolean;
  signIn: (name: string, role: Role) => Promise<User>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreAuthToken();
    setSession(readStoredSession());
    setReady(true);
  }, []);

  const signIn = useCallback(async (name: string, role: Role): Promise<User> => {
    const next = await loginRequest(name, role);
    setSession(next);
    return next.user;
  }, []);

  const signOut = useCallback(() => {
    clearStoredSession();
    setSession(undefined);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user, ready, signIn, signOut }),
    [session, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
