"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface Owner {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
}

interface AuthState {
  owner: Owner | null;
  token: string | null;
  pgId: string | null;       // ← persisted here, no more localStorage for pgId
  hasPG: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (token: string, owner: Owner, hasPG: boolean, pgId?: string | null) => void;
  signOut: () => void;
  refreshAuth: () => Promise<void>;
}

const TOKEN_KEY = "pg_eg_token";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    owner: null,
    token: null,
    pgId: null,
    hasPG: false,
    isLoading: true,
    isAuthenticated: false,
  });

  const signIn = useCallback(
    (token: string, owner: Owner, hasPG: boolean, pgId?: string | null) => {
      localStorage.setItem(TOKEN_KEY, token);
      // Also persist pgId so it survives refresh (secondary to /me call)
      if (pgId) localStorage.setItem("pg_eg_pg_id", pgId);
      setState({
        owner,
        token,
        pgId: pgId || null,
        hasPG,
        isLoading: false,
        isAuthenticated: true,
      });
    },
    []
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("pg_eg_pg_id");
    setState({
      owner: null,
      token: null,
      pgId: null,
      hasPG: false,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const refreshAuth = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("pg_eg_pg_id");
        setState({ owner: null, token: null, pgId: null, hasPG: false, isLoading: false, isAuthenticated: false });
        return;
      }

      const data = await res.json();
      const pgId = data.pgId || null;
      if (pgId) localStorage.setItem("pg_eg_pg_id", pgId);

      setState({
        owner: data.owner,
        token,
        pgId,
        hasPG: data.hasPG,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
