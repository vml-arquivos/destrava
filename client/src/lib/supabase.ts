// Supabase removed — authentication via JWT in lib/api.ts
// This file contains only TypeScript types for backward compatibility

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

// Supabase has been completely removed. Use apiFetch from lib/api.ts instead.
