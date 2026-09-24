import type { AuthSession, Role, User } from '@shared/types';
import { api, setAuthToken } from './api';

const SESSION_KEY = 'classsync:session';

export interface StoredSession {
  token: string;
  user: User;
}

export function readStoredSession(): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user?.id || !parsed?.user?.role) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeStoredSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: session.token, user: session.user }));
  setAuthToken(session.token);
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
  setAuthToken(undefined);
}

export function restoreAuthToken(): void {
  const session = readStoredSession();
  setAuthToken(session?.token);
}

export async function loginRequest(name: string, role: Role): Promise<StoredSession> {
  const { session } = await api.login({ name, role });
  writeStoredSession(session);
  return { token: session.token, user: session.user };
}
