// Fonte única das etapas do funil comercial.
// Os IDs canônicos são os usados pela UI e pelas respostas públicas da API.
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
  pos_venda: "Pós-venda",
  reativacao: "Reativação",
  perdido: "Perdido",
};

export const ETAPAS_FUNIL_ENCERRADAS: EtapaFunil[] = ["fechado", "perdido"];
export const ETAPAS_FUNIL_SEM_RESPONSAVEL: EtapaFunil[] = ["novo_lead"];

// Compatibilidade de leitura: todo valor antigo é convertido para o ID canônico.
export const MAPEAMENTO_ETAPAS_LEGADAS: Record<string, EtapaFunil> = {
  novo_lead: "novo_lead",
  tentando_contato: "tentando_contato",
  em_atendimento: "em_atendimento",
  qualificado: "qualificado",
  proposta_enviada: "proposta_enviada",
  documentos_pendentes: "documentos_pendentes",
  contrato_gerado: "contrato_gerado",
  aguardando_pagamento: "aguardando_pagamento",
  fechado: "fechado",
  em_execucao: "em_execucao",
  pos_venda: "pos_venda",
  reativacao: "reativacao",
  perdido: "perdido",
  novo: "novo_lead",
  entrada: "novo_lead",
  triagem: "novo_lead",
  contato_feito: "tentando_contato",
  contato: "tentando_contato",
  qualificacao: "qualificado",
  triagem_avaliada: "qualificado",
  proposta: "proposta_enviada",
  negociacao: "proposta_enviada",
  documentacao: "documentos_pendentes",
  documentos: "documentos_pendentes",
  aprovacao: "contrato_gerado",
  analise: "contrato_gerado",
  contrato: "contrato_gerado",
  pagamento_pendente: "aguardando_pagamento",
  ganho: "fechado",
  carteira: "em_execucao",
  execucao: "em_execucao",
  inativo: "reativacao",
};

// Compatibilidade de gravação: mantém a taxonomia de produção já existente,
// sem enviar IDs canônicos novos a uma coluna que ainda pode ter constraints antigas.
export const ETAPA_FUNIL_PERSISTENCIA: Record<EtapaFunil, string> = {
  novo_lead: "entrada",
  tentando_contato: "contato",
  em_atendimento: "contato",
  qualificado: "qualificacao",
  proposta_enviada: "proposta",
  documentos_pendentes: "documentos",
  contrato_gerado: "analise",
  aguardando_pagamento: "negociacao",
  fechado: "ganho",
  em_execucao: "carteira",
  pos_venda: "carteira",
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
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return Object.prototype.hasOwnProperty.call(MAPEAMENTO_ETAPAS_LEGADAS, normalized);
}

export function etapaFunilParaPersistencia(value: string | null | undefined): string {
  return ETAPA_FUNIL_PERSISTENCIA[normalizarEtapaFunil(value)];
}

export function etapaFunilPersistidaParaUi(value: string | null | undefined): EtapaFunil {
  return normalizarEtapaFunil(value);
}
