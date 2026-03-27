import { createClient } from "@supabase/supabase-js";

// ─── Variáveis de ambiente ────────────────────────────────────────────────────
// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são OBRIGATÓRIAS.
// Devem ser definidas como Build Args no Coolify/Dockerfile antes do `pnpm build`.
// Se ausentes em build-time, o Vite bake undefined no bundle e o login falha.
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[Supabase] VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias. " +
    "Defina-as como variáveis de ambiente de BUILD no Coolify antes de rebuildar."
  );
}

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
  // Colunas reais da tabela simulacoes_colaborador (schema auditado)
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
  status: "pendente" | "em_analise" | "aprovado" | "reprovado" | "cancelado";
  criado_em: string;
  atualizado_em: string;
  // Aliases para compatibilidade com código legado (leitura apenas)
  valor_credito?: number;       // = valor_solicitado
  prazo_meses?: number;         // = quantidade_parcelas
  parcela_mensal?: number;      // = valor_parcela
  total_emprestimo?: number;    // = valor_total_pagar
  custo_total?: number;         // = custo_efetivo_total
  pct_imposto?: number;         // = imposto_percentual
  imposto_valor?: number;       // = total_imposto
  pct_comissao?: number;        // = comissao_percentual
  comissao_valor?: number;      // = total_comissao
  created_at?: string;          // = criado_em
  updated_at?: string;          // = atualizado_em
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
