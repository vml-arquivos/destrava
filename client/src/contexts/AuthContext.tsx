import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, Colaborador, signIn as authSignIn, signOut as authSignOut, getUser, getToken } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AuthState {
  user: Colaborador | null;
  session: { access_token: string } | null;
  colaborador: Colaborador | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>;
  signOut: () => Promise<{ error: unknown }>;
  refreshColaborador: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    colaborador: null,
    loading: true,
    isAuthenticated: false,
  });

  const loadSession = useCallback(async () => {
    const user = await getUser();
    const token = getToken();
    setState({
      user,
      session: token ? { access_token: token } : null,
      colaborador: user,
      loading: false,
      isAuthenticated: !!user,
    });
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await authSignIn(email, password);
    if (data?.user) {
      const user = data.user as Colaborador;
      setState({
        user,
        session: data.session as { access_token: string },
        colaborador: user,
        loading: false,
        isAuthenticated: true,
      });
    }
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await authSignOut();
    setState({ user: null, session: null, colaborador: null, loading: false, isAuthenticated: false });
    return { error };
  }, []);

  const refreshColaborador = useCallback(async () => {
    const user = await getUser();
    if (user) setState((prev) => ({ ...prev, user, colaborador: user }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshColaborador }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
