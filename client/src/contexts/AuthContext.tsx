import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, Colaborador } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  session: Session | null;
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

  const fetchColaborador = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("colaboradores")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setState((prev) => ({ ...prev, colaborador: data as Colaborador }));
    }
  }, []);

  useEffect(() => {
    // Buscar sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
        isAuthenticated: !!session,
      }));
      if (session?.user) fetchColaborador(session.user.id);
    });

    // Listener único para mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        colaborador: session ? prev.colaborador : null,
        loading: false,
        isAuthenticated: !!session,
      }));
      if (session?.user) fetchColaborador(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [fetchColaborador]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    setState({ user: null, session: null, colaborador: null, loading: false, isAuthenticated: false });
    return { error };
  }, []);

  const refreshColaborador = useCallback(async () => {
    if (state.user) await fetchColaborador(state.user.id);
  }, [state.user, fetchColaborador]);

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
