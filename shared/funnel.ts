// Novo conjunto de etapas do funil comercial.
// Estas etapas refletem o fluxo completo de vendas, da entrada do lead até o pós‑venda.
export const ETAPAS_FUNIL_VALIDAS = [
  "novo_lead",
  "tentando_contato",
  "em_atendimento",
  "qualificado",
  "proposta_enviada",
  "documentos_pendentes",
  "contrato_gerado",
  "aguardando_pagamento",
  "fechado",
  "em_execucao",
  "pos_venda",
  "reativacao",
  "perdido",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL_VALIDAS)[number];

export const ETAPA_FUNIL_DEFAULT: EtapaFunil = "novo_lead";

export const ETAPAS_FUNIL_LABELS: Record<EtapaFunil, string> = {
  novo_lead: "Novo lead",
  tentando_contato: "Tentando contato",
  em_atendimento: "Em atendimento",
  qualificado: "Qualificado",
  proposta_enviada: "Proposta enviada",
  documentos_pendentes: "Documentos pendentes",
  contrato_gerado: "Contrato gerado",
  aguardando_pagamento: "Aguardando pagamento",
  fechado: "Fechado",
  em_execucao: "Em execução",
  pos_venda: "Pós‑venda",
  reativacao: "Reativação",
  perdido: "Perdido",
};

// Etapas consideradas encerradas no funil.
export const ETAPAS_FUNIL_ENCERRADAS: EtapaFunil[] = ["fechado", "perdido"];

// Leads sem responsável começam na etapa de novo lead.
export const ETAPAS_FUNIL_SEM_RESPONSAVEL: EtapaFunil[] = ["novo_lead"];

// Mapeamento das antigas etapas para as novas etapas do funil.
export const MAPEAMENTO_ETAPAS_LEGADAS: Record<string, EtapaFunil> = {
  // Entrada e novos leads
  novo: "novo_lead",
  entrada: "novo_lead",
  triagem: "novo_lead",
  // Contato
  contato_feito: "tentando_contato",
  contato: "tentando_contato",
  // Qualificação
  qualificado: "qualificado",
  qualificacao: "qualificado",
  triagem_avaliada: "qualificado",
  // Proposta
  proposta_enviada: "proposta_enviada",
  proposta: "proposta_enviada",
  negociacao: "proposta_enviada",
  // Documentos
  documentacao: "documentos_pendentes",
  documentos: "documentos_pendentes",
  // Análise / aprovação
  aprovacao: "contrato_gerado",
  analise: "contrato_gerado",
  contrato: "contrato_gerado",
  // Pagamento
  pagamento_pendente: "aguardando_pagamento",
  // Ganho / Fechado
  ganho: "fechado",
  fechado: "fechado",
  // Execução e pós venda
  carteira: "em_execucao",
  execucao: "em_execucao",
  pos_venda: "pos_venda",
  // Reativação e perdidos
  inativo: "reativacao",
  reativacao: "reativacao",
  perdido: "perdido",
};

export function normalizarEtapaFunil(value: string | null | undefined): EtapaFunil {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return MAPEAMENTO_ETAPAS_LEGADAS[normalized] || ETAPA_FUNIL_DEFAULT;
}

export function etapaFunilEhValida(value: string | null | undefined): value is EtapaFunil {
  return ETAPAS_FUNIL_VALIDAS.includes(normalizarEtapaFunil(value));
}
