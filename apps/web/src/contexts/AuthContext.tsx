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
  photoUrl?: string | null;
  role?: string | null; // 'owner' | 'user'
}

interface PGSummary {
  id: string;
  name: string;
  type?: string | null;
  paymentQrUrl?: string | null;
  paymentUpiId?: string | null;
  paymentPhone?: string | null;
}

interface AuthState {
  owner: Owner | null;
  token: string | null;
  pgId: string | null;         // primary PG (first one)
  activePgId: string | null;   // currently selected/viewing PG
  allPgs: PGSummary[];         // all PGs for this owner
  hasPG: boolean;
  role: string | null;         // 'owner' | 'user'
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (token: string, owner: Owner, hasPG: boolean, pgId?: string | null, allPgs?: PGSummary[], role?: string) => void;
  signOut: () => void;
  refreshAuth: () => Promise<void>;
  setActivePg: (pgId: string) => void;
}

const TOKEN_KEY = "pg_eg_token";
const ACTIVE_PG_KEY = "pg_eg_active_pg_id";
const ROLE_KEY = "pg_eg_role";
const OWNER_KEY = "pg_eg_owner";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Safely read cached owner from localStorage (survives refresh). */
function readCachedOwner(): Owner | null {
  try {
    const raw = localStorage.getItem(OWNER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    owner: null,
    token: null,
    pgId: null,
    activePgId: null,
    allPgs: [],
    hasPG: false,
    role: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const signIn = useCallback(
    (token: string, owner: Owner, hasPG: boolean, pgId?: string | null, allPgs?: PGSummary[], role?: string) => {
      const resolvedRole = role || owner.role || "owner";
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(ROLE_KEY, resolvedRole);
      const pgsArr = allPgs || (pgId ? [{ id: pgId, name: "My PG" }] : []);
      const savedActive = localStorage.getItem(ACTIVE_PG_KEY);
      const activePgId = (savedActive && pgsArr.find((p) => p.id === savedActive))
        ? savedActive
        : (pgId || null);
      if (activePgId) localStorage.setItem(ACTIVE_PG_KEY, activePgId);
      if (pgId) localStorage.setItem("pg_eg_pg_id", pgId);
      // Cache owner so it can be restored on next page load without waiting for API
      try { localStorage.setItem(OWNER_KEY, JSON.stringify(owner)); } catch { /* noop */ }
      setState({
        owner, token,
        pgId: pgId || null,
        activePgId,
        allPgs: pgsArr,
        hasPG,
        role: resolvedRole,
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
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(OWNER_KEY);
    setState({
      owner: null, token: null,
      pgId: null, activePgId: null, allPgs: [],
      hasPG: false, role: null, isLoading: false, isAuthenticated: false,
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

    // Optimistic: restore cached owner immediately so the UI can show
    // profile data without waiting for the API round-trip.
    const cachedOwner = readCachedOwner();
    const cachedRole = localStorage.getItem(ROLE_KEY) || "user";
    if (cachedOwner) {
      setState((s) => ({
        ...s,
        owner: cachedOwner,
        token,
        role: cachedRole,
        isAuthenticated: true, // optimistic — corrected below if token is invalid
      }));
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("pg_eg_pg_id");
        localStorage.removeItem(ACTIVE_PG_KEY);
        localStorage.removeItem(ROLE_KEY);
        setState({ owner: null, token: null, pgId: null, activePgId: null, allPgs: [], hasPG: false, role: null, isLoading: false, isAuthenticated: false });
        return;
      }

      const data = await res.json();
      const allPgs: PGSummary[] = data.pgs || [];
      const pgId = data.pgId || null;
      const role = data.role || data.owner?.role || "owner";
      if (pgId) localStorage.setItem("pg_eg_pg_id", pgId);
      localStorage.setItem(ROLE_KEY, role);

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
        role,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      // Network error (server unreachable, timeout, CORS, etc.)
      // Do NOT log the user out for a transient network failure —
      // their token is still in localStorage and may be valid.
      // Only a server-confirmed 401/403 should revoke access.
      const stillHasToken = !!localStorage.getItem(TOKEN_KEY);
      setState((s) => ({ ...s, isLoading: false, isAuthenticated: stillHasToken }));
    }
  }, []);

  // ── On mount: restore session from localStorage ──────────────────
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
