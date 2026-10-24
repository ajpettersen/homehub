import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// HomeHub's own sign-in state (replaces Clerk). The server keeps the session
// in an HttpOnly cookie; this context just asks /api/auth/session who that is.

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  user: SessionUser | null;
  setupAvailable: boolean;
  /** Re-read the session from the server (after sign-in / sign-up). */
  refresh: () => Promise<SessionUser | null>;
  /** Ends the session on the server. Callers handle navigation. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Something went wrong. Try again.");
  }
  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [setupAvailable, setSetupAvailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await authRequest<{ user: SessionUser | null; setupAvailable?: boolean }>("session");
      setUser(data.user);
      setSetupAvailable(!!data.setupAvailable);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authRequest("sign-out", {});
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(() => ({
    isLoaded,
    isSignedIn: !!user,
    userId: user?.id ?? null,
    user,
    setupAvailable,
    refresh,
    signOut,
  }), [isLoaded, user, setupAvailable, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** Only same-app relative paths are honoured, so a crafted link can't redirect off-site. */
export function safeRedirectTarget(raw: string | null, basePath: string): string {
  if (!raw) return "/";
  let target = raw;
  try {
    target = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return "/";
  if (basePath && target.startsWith(basePath)) target = target.slice(basePath.length) || "/";
  return target;
}
