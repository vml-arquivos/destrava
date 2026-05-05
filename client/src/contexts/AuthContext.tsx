import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch, getToken, setToken, removeToken } from "@/lib/api";

export type Colaborador = {
  id: string;
  nome: string;
  cargo: string;
  perfil?: string;
  email: string;
  telefone?: string;
  cpf?: string;
  rg?: string;
  data_nascimento?: string;
  estado_civil?: string;
  profissao?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  assinatura_url?: string;
  precisa_redefinir_senha?: boolean;
  ativo: boolean;
  created_at?: string;
  pode_atender_leads?: boolean;
  pode_ver_todos_leads?: boolean;
  permissoes?: {
    isGestor?: boolean;
    podeGerenciarUsuarios?: boolean;
    podeVerTudo?: boolean;
    isCaptador?: boolean;
    isEstagiario?: boolean;
  };
};

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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    colaborador: null,
    loading: true,
    isAuthenticated: false,
  });

  const loadSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState({
        user: null,
        session: null,
        colaborador: null,
        loading: false,
        isAuthenticated: false,
      });
      return;
    }
    try {
      const user = await apiFetch("/api/me");
      setState({
        user,
        session: { access_token: token },
        colaborador: user,
        loading: false,
        isAuthenticated: true,
      });
    } catch {
      removeToken();
      setState({
        user: null,
        session: null,
        colaborador: null,
        loading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const data = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      const user = data.colaborador ?? data.user;
      setState({
        user,
        session: { access_token: data.token },
        colaborador: user,
        loading: false,
        isAuthenticated: true,
      });
      return { data: { user, session: { access_token: data.token } }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message ?? "Credenciais inválidas" } };
    }
  }, []);

  const signOut = useCallback(async () => {
    removeToken();
    setState({ user: null, session: null, colaborador: null, loading: false, isAuthenticated: false });
    return { error: null };
  }, []);

  const refreshColaborador = useCallback(async () => {
    try {
      const user = await apiFetch("/api/me");
      setState((prev) => ({ ...prev, user, colaborador: user }));
    } catch {
      removeToken();
      setState((prev) => ({ ...prev, user: null, colaborador: null, isAuthenticated: false }));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshColaborador }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
