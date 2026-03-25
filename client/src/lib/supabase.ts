import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars não configuradas. Área restrita indisponível.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

// ─── Tipos do banco de dados ────────────────────────────────────────────────

export interface Colaborador {
  id: string;
  email: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  criado_em: string;
}

export interface SimulacaoColaborador {
  id: string;
  colaborador_id: string;
  colaborador_nome?: string;
  // Dados do cliente
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  cliente_telefone?: string;
  cliente_email?: string;
  // Parâmetros da simulação
  valor_solicitado: number;
  quantidade_parcelas: number;
  taxa_juros_mensal: number;   // % ao mês
  imposto_percentual: number;  // IOF ou outro imposto em %
  comissao_percentual: number; // comissão da Destrava em %
  // Resultados calculados
  valor_parcela: number;
  total_juros: number;
  total_imposto: number;
  total_comissao: number;
  custo_efetivo_total: number; // CET
  valor_total_pagar: number;
  // Metadados
  banco?: string;
  linha_credito?: string;
  observacoes?: string;
  status: "rascunho" | "enviado" | "aprovado" | "reprovado";
  criado_em: string;
  atualizado_em: string;
}

// ─── Helpers de autenticação ────────────────────────────────────────────────

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
