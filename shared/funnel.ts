export const ETAPAS_FUNIL_VALIDAS = [
  "entrada",
  "triagem",
  "contato",
  "qualificacao",
  "documentos",
  "analise",
  "proposta",
  "negociacao",
  "ganho",
  "perdido",
  "reativacao",
  "carteira",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL_VALIDAS)[number];

export const ETAPA_FUNIL_DEFAULT: EtapaFunil = "entrada";

export const ETAPAS_FUNIL_LABELS: Record<EtapaFunil, string> = {
  entrada: "Entrada",
  triagem: "Triagem",
  contato: "Contato",
  qualificacao: "Qualificação",
  documentos: "Documentos",
  analise: "Análise",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
  reativacao: "Reativação",
  carteira: "Carteira",
};

export const ETAPAS_FUNIL_ENCERRADAS: EtapaFunil[] = ["ganho", "perdido"];

export const ETAPAS_FUNIL_SEM_RESPONSAVEL: EtapaFunil[] = ["entrada"];

export const MAPEAMENTO_ETAPAS_LEGADAS: Record<string, EtapaFunil> = {
  novo: "entrada",
  entrada: "entrada",
  contato_feito: "contato",
  contato: "contato",
  qualificado: "qualificacao",
  qualificacao: "qualificacao",
  proposta_enviada: "proposta",
  proposta: "proposta",
  negociacao: "negociacao",
  documentacao: "documentos",
  documentos: "documentos",
  aprovacao: "analise",
  analise: "analise",
  ganho: "ganho",
  perdido: "perdido",
  inativo: "reativacao",
  reativacao: "reativacao",
  carteira: "carteira",
  triagem: "triagem",
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
