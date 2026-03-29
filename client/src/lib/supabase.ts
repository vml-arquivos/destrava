// ─── Auth Client — Destrava Crédito (sem Supabase) ───────────────────────────
// Autenticação via JWT próprio. Token armazenado no localStorage.
// API base: /api (mesmo servidor Express)

const API_BASE = "";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface Colaborador {
  id: string;
  email: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  criado_em?: string;
}

export interface SimulacaoColaborador {
  id: string;
  colaborador_id: string;
  cliente_nome: string;
  cliente_cpf_cnpj?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  valor_solicitado: number;
  quantidade_parcelas: number;
  taxa_juros_mensal: number;
  imposto_percentual?: number;
  comissao_percentual?: number;
  valor_parcela: number;
  total_juros: number;
  total_imposto?: number;
  total_comissao?: number;
  custo_efetivo_total: number;
  valor_total_pagar: number;
  banco?: string;
  linha_credito?: string;
  observacoes?: string;
  status: "rascunho" | "enviado" | "aprovado" | "reprovado";
  criado_em: string;
  atualizado_em: string;
  valor_credito?: number;
  prazo_meses?: number;
  parcela_mensal?: number;
  total_emprestimo?: number;
  custo_total?: number;
  pct_imposto?: number;
  imposto_valor?: number;
  pct_comissao?: number;
  comissao_valor?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  empresa?: string;
  email?: string;
  valor_desejado?: string;
  prazo?: string;
  finalidade?: string;
  produto?: string;
  origem: string;
  status: "novo" | "contatado" | "em_negociacao" | "convertido" | "perdido";
  created_at: string;
}

export interface Cliente {
  id: string;
  nome: string;
  empresa?: string;
  cpf_cnpj?: string;
  telefone: string;
  email?: string;
  tipo: "pf" | "pj";
  cidade?: string;
  estado?: string;
  faturamento_anual?: number;
  segmento?: string;
  status: "lead" | "contato" | "analise" | "aprovado" | "reprovado" | "cancelado" | "convertido";
  origem: string;
  prioridade: "baixa" | "media" | "alta";
  observacoes?: string;
  proximo_contato?: string;
  colaborador_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Helpers de Token ─────────────────────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem("destrava_token");
}

function setToken(token: string) {
  localStorage.setItem("destrava_token", token);
}

function clearToken() {
  localStorage.removeItem("destrava_token");
  localStorage.removeItem("destrava_user");
}

function setUser(user: Colaborador) {
  localStorage.setItem("destrava_user", JSON.stringify(user));
}

export function getStoredUser(): Colaborador | null {
  try {
    const raw = localStorage.getItem("destrava_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Helpers de autenticação ─────────────────────────────────────────────────
export async function signIn(email: string, password: string) {
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { data: null, error: { message: data.error || "Credenciais inválidas" } };
    }
    setToken(data.token);
    setUser(data.user);
    return { data: { user: data.user, session: { access_token: data.token } }, error: null };
  } catch {
    return { data: null, error: { message: "Erro de conexão com o servidor" } };
  }
}

export async function signOut() {
  clearToken();
  return { error: null };
}

export async function getSession() {
  const token = getToken();
  if (!token) return null;
  return { access_token: token };
}

export async function getUser(): Promise<Colaborador | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearToken();
      return null;
    }
    return { id: payload.id, email: payload.email, nome: payload.nome, cargo: payload.cargo, ativo: true };
  } catch {
    clearToken();
    return null;
  }
}

// ─── Fetch autenticado (helper para páginas do colaborador) ──────────────────
export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ─── Stub de compatibilidade (supabase.auth.*) ────────────────────────────────
export const supabase = {
  from: (table: string) => {
    console.warn(`[MIGRAÇÃO] supabase.from("${table}") chamado — migre para apiFetch`);
    const stub: Record<string, unknown> = {};
    const methods = ["select","insert","update","delete","eq","order","limit","single","maybeSingle"];
    methods.forEach(m => { stub[m] = () => stub; });
    stub["then"] = (fn: (v: { data: null; error: { message: string } }) => void) =>
      Promise.resolve({ data: null, error: { message: "Supabase removido. Use apiFetch." } }).then(fn);
    return stub;
  },
  auth: {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    signOut: async () => signOut(),
    getSession: async () => ({ data: { session: await getSession() } }),
    getUser: async () => ({ data: { user: await getUser() } }),
  },
};
