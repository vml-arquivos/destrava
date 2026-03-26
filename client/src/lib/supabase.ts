import { createClient } from "@supabase/supabase-js";

// ─── Variáveis de ambiente ────────────────────────────────────────────────────
// Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Coolify/ambiente.
// Sem essas variáveis, a área restrita (/colaborador) ficará indisponível.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configuradas. " +
    "A área restrita estará indisponível."
  );
}

export const supabase = createClient(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY ?? "placeholder-key"
);

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
  cet_mensal?: number;
  cet_anual?: number;
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
