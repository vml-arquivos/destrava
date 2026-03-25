import { createClient } from "@supabase/supabase-js";

// ─── Variáveis de ambiente ────────────────────────────────────────────────────
// O Vite substitui import.meta.env em tempo de build.
// Quando não configuradas, usamos valores placeholder que permitem o site
// público funcionar normalmente — apenas a área restrita (/colaborador) fica
// indisponível até que as variáveis sejam configuradas no Coolify.

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://tjvxxzaatvnfupkdzrzp.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdnh4emFhdHZuZnVwa2R6cnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDE4MjUsImV4cCI6MjA4OTg3NzgyNX0.wl3nOWw1KWNYtzYTT2pLK516ktGJCMbcCppBWYLLrCM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Tipos do banco de dados ─────────────────────────────────────────────────

export interface Colaborador {
  id: string;
  email: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  created_at: string;
}

export interface SimulacaoColaborador {
  id: string;
  colaborador_id: string;
  colaborador_nome?: string;
  cliente_nome: string;
  cliente_empresa?: string;
  cliente_cpf_cnpj?: string;
  cliente_telefone?: string;
  valor_credito: number;
  prazo_meses: number;
  taxa_juros_mensal: number;
  valor_fiscal?: number;
  pct_imposto?: number;
  imposto_valor?: number;
  pct_comissao?: number;
  comissao_valor?: number;
  parcela_mensal: number;
  total_emprestimo: number;
  total_juros: number;
  custo_total: number;
  cet_mensal: number;
  cet_anual: number;
  banco?: string;
  linha_credito?: string;
  observacoes?: string;
  cenario: "com_imposto" | "sem_imposto";
  status: "pendente" | "em_analise" | "aprovado" | "reprovado" | "cancelado";
  created_at: string;
  updated_at: string;
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
  status: "novo" | "contatado" | "em_negociacao" | "convertido" | "perdido";
  origem: string;
  created_at: string;
}

// ─── Helpers de autenticação ─────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
