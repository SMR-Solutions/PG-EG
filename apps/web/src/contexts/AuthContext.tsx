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

interface PGSummary {
  id: string;
  name: string;
}

interface AuthState {
  owner: Owner | null;
  token: string | null;
  pgId: string | null;         // primary PG (first one)
  activePgId: string | null;   // currently selected/viewing PG
  allPgs: PGSummary[];         // all PGs for this owner
  hasPG: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (token: string, owner: Owner, hasPG: boolean, pgId?: string | null, allPgs?: PGSummary[]) => void;
  signOut: () => void;
  refreshAuth: () => Promise<void>;
  setActivePg: (pgId: string) => void;
}

const TOKEN_KEY = "pg_eg_token";
const ACTIVE_PG_KEY = "pg_eg_active_pg_id";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    owner: null,
    token: null,
    pgId: null,
    activePgId: null,
    allPgs: [],
    hasPG: false,
    isLoading: true,
    isAuthenticated: false,
  });

  const signIn = useCallback(
    (token: string, owner: Owner, hasPG: boolean, pgId?: string | null, allPgs?: PGSummary[]) => {
      localStorage.setItem(TOKEN_KEY, token);
      const pgsArr = allPgs || (pgId ? [{ id: pgId, name: "My PG" }] : []);
      // Respect existing activePgId if it's in the pgsArr
      const savedActive = localStorage.getItem(ACTIVE_PG_KEY);
      const activePgId = (savedActive && pgsArr.find((p) => p.id === savedActive))
        ? savedActive
        : (pgId || null);
      if (activePgId) localStorage.setItem(ACTIVE_PG_KEY, activePgId);
      if (pgId) localStorage.setItem("pg_eg_pg_id", pgId);
      setState({
        owner, token,
        pgId: pgId || null,
        activePgId,
        allPgs: pgsArr,
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
    localStorage.removeItem(ACTIVE_PG_KEY);
    setState({
      owner: null, token: null,
      pgId: null, activePgId: null, allPgs: [],
      hasPG: false, isLoading: false, isAuthenticated: false,
    });
  }, []);

  /** Switch the currently active PG */
  const setActivePg = useCallback((pgId: string) => {
    localStorage.setItem(ACTIVE_PG_KEY, pgId);
    setState((s) => ({ ...s, activePgId: pgId }));
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
        localStorage.removeItem(ACTIVE_PG_KEY);
        setState({ owner: null, token: null, pgId: null, activePgId: null, allPgs: [], hasPG: false, isLoading: false, isAuthenticated: false });
        return;
      }

      const data = await res.json();
      const allPgs: PGSummary[] = data.pgs || [];
      const pgId = data.pgId || null;
      if (pgId) localStorage.setItem("pg_eg_pg_id", pgId);

      // Resolve activePgId: prefer saved choice if still valid, else primary
      const savedActive = localStorage.getItem(ACTIVE_PG_KEY);
      const activePgId = (savedActive && allPgs.find((p) => p.id === savedActive))
        ? savedActive
        : (pgId || null);
      if (activePgId) localStorage.setItem(ACTIVE_PG_KEY, activePgId);

      setState({
        owner: data.owner,
        token,
        pgId,
        activePgId,
        allPgs,
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
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshAuth, setActivePg }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
