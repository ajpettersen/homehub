import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// HomeHub's own sign-in. The server keeps the session in an HttpOnly cookie,
// so the browser never sees a token; this only asks the server who is signed
// in and calls the sign-in endpoints.

interface SessionInfo {
  signedIn: boolean;
  userId?: string;
  email?: string | null;
  displayName?: string | null;
  hasPassword?: boolean;
}

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export class AuthRequestError extends Error {}

/** POSTs JSON to an /api/auth endpoint and returns the JSON, or throws the server's message. */
export async function postAuth<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError("Couldn't reach HomeHub. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthRequestError(typeof data?.error === 'string' ? data.error : 'Something went wrong. Please try again.');
  }
  return data as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      setSession(response.ok ? await response.json() : { signedIn: false });
    } catch {
      // Offline: keep whatever we knew, or treat as signed out on first load.
      setSession(current => current ?? { signedIn: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(() => ({
    isLoaded: session !== null,
    isSignedIn: !!session?.signedIn,
    userId: session?.signedIn ? session.userId ?? null : null,
    email: session?.signedIn ? session.email ?? null : null,
    refresh,
  }), [refresh, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** Where to go after signing in: a same-site path from ?redirect_url=, or home. */
export function redirectTarget(basePath: string): string {
  const raw = new URLSearchParams(window.location.search).get('redirect_url');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  const path = basePath && raw.startsWith(basePath) ? raw.slice(basePath.length) || '/' : raw;
  return path.startsWith('/') ? path : '/';
}
