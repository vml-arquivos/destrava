export type FeatureGroup = "visao" | "comercial" | "clientes" | "assessoria" | "financeiro" | "documentos" | "gestao";

export interface FeatureCatalogItem {
  key: string;
  group: FeatureGroup;
  label: string;
  href: string;
  description: string;
  adminOnly?: boolean;
}

export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  visao: "Visão Geral",
  comercial: "Comercial",
  clientes: "Clientes",
  assessoria: "Assessoria IA",
  financeiro: "Financeiro",
  documentos: "Contratos e Documentos",
  gestao: "Gestão",
};

export const FEATURE_CATALOG: FeatureCatalogItem[] = [
  { key: "dashboard", group: "visao", label: "Dashboard", href: "/colaborador/dashboard", description: "Painel inicial com indicadores, atalhos e visão geral." },
  { key: "funil-vendas", group: "comercial", label: "Funil de Vendas", href: "/colaborador/crm", description: "CRM comercial, leads e oportunidades." },
  { key: "triagem-leads", group: "comercial", label: "Triagem de Leads", href: "/colaborador/triagem", description: "Qualificação e análise inicial de leads." },
  { key: "simulacoes", group: "comercial", label: "Simulações", href: "/colaborador/simulacoes", description: "Histórico e gestão de simulações de crédito." },
  { key: "calculadora", group: "comercial", label: "Calculadora", href: "/colaborador/calculadora", description: "Simulação premium/calculadora interna." },
  { key: "orcamentos", group: "comercial", label: "Orçamentos", href: "/colaborador/orcamentos", description: "Criação, PDF e envio de propostas/orçamentos." },
  { key: "clientes-pj", group: "clientes", label: "Clientes PJ", href: "/colaborador/empresas", description: "Carteira de empresas, dados, documentos e inteligência 360." },
  { key: "clientes-pf", group: "clientes", label: "Clientes PF", href: "/colaborador/clientes", description: "Carteira de pessoas físicas." },
  { key: "relatorios-pj", group: "clientes", label: "Relatórios PJ", href: "/colaborador/relatorio-empresas", description: "Relatórios e exportações da carteira PJ." },
  { key: "cadastros-incompletos", group: "clientes", label: "Cadastros Incompletos", href: "/colaborador/cadastros-incompletos", description: "Fila de cadastros com pendências ou incompletos." },
  { key: "assessoria-ia", group: "assessoria", label: "Central de Assessoria", href: "/colaborador/assessoria", description: "Central de análise e recomendações de IA." },
  { key: "diagnostico-credito", group: "assessoria", label: "Diagnóstico de Crédito", href: "/colaborador/diagnostico-credito", description: "Diagnóstico consolidado de crédito." },
  { key: "acompanhamento-bancario", group: "financeiro", label: "Acompanhamento Bancário", href: "/colaborador/acompanhamento-bancario", description: "Acompanhamento bancário semanal/mensal e relatórios inteligentes." },
  { key: "acompanhamento-financeiro", group: "financeiro", label: "Acompanhamento Financeiro", href: "/colaborador/acompanhamento-financeiro", description: "Acompanhamento financeiro semanal." },
  { key: "faturamento", group: "financeiro", label: "Faturamento", href: "/colaborador/previsao-faturamento", description: "Declarações, previsão e relatórios de faturamento." },
  { key: "contratos", group: "documentos", label: "Contratos", href: "/colaborador/contratos", description: "Geração e gestão de contratos." },
  { key: "contadores", group: "gestao", label: "Contadores", href: "/colaborador/contadores", description: "Cadastro e gestão de contadores.", adminOnly: true },
  { key: "integracoes", group: "gestao", label: "Integrações n8n", href: "/colaborador/integracoes", description: "Configuração e acompanhamento de integrações.", adminOnly: true },
  { key: "usuarios", group: "gestao", label: "Usuários", href: "/colaborador/usuarios", description: "Cadastro e gestão de colaboradores.", adminOnly: true },
  { key: "configuracao-funcoes", group: "gestao", label: "Menu e Funções", href: "/colaborador/configuracao-funcoes", description: "Configuração premium de visibilidade do menu e das funções.", adminOnly: true },
];

export const FEATURE_BY_HREF = FEATURE_CATALOG.reduce<Record<string, FeatureCatalogItem>>((acc, item) => {
  acc[item.href] = item;
  return acc;
}, {});

export function getFeatureByHref(href?: string | null): FeatureCatalogItem | undefined {
  if (!href) return undefined;
  const exact = FEATURE_BY_HREF[href];
  if (exact) return exact;
  return FEATURE_CATALOG
    .filter(item => href === item.href || href.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
