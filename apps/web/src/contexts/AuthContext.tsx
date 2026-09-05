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
}

interface AuthState {
  owner: Owner | null;
  token: string | null;
  hasPG: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (token: string, owner: Owner, hasPG: boolean) => void;
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
    hasPG: false,
    isLoading: true,
    isAuthenticated: false,
  });

  const signIn = useCallback((token: string, owner: Owner, hasPG: boolean) => {
    localStorage.setItem(TOKEN_KEY, token);
    setState({
      owner,
      token,
      hasPG,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({
      owner: null,
      token: null,
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
        // Token invalid — clear it
        localStorage.removeItem(TOKEN_KEY);
        setState({ owner: null, token: null, hasPG: false, isLoading: false, isAuthenticated: false });
        return;
      }

      const data = await res.json();
      setState({
        owner: data.owner,
        token,
        hasPG: data.hasPG,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  // On mount — check for saved token
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
