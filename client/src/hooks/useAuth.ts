import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, Colaborador } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  session: Session | null;
  colaborador: Colaborador | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    colaborador: null,
    loading: true,
  });

  useEffect(() => {
    // Buscar sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
      if (session?.user) fetchColaborador(session.user.id);
    });

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
          colaborador: session ? prev.colaborador : null,
          loading: false,
        }));
        if (session?.user) fetchColaborador(session.user.id);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchColaborador(userId: string) {
    const { data } = await supabase
      .from("colaboradores")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setState((prev) => ({ ...prev, colaborador: data as Colaborador }));
    }
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    setState({ user: null, session: null, colaborador: null, loading: false });
    return { error };
  }

  return {
    ...state,
    isAuthenticated: !!state.session,
    signIn,
    signOut,
  };
}
