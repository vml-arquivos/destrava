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
  { key: "empresa-tab-dados", group: "clientes", label: "Aba Dados da Empresa", href: "/colaborador/empresas?aba=visao_geral", description: "Exibe a aba Dados da Empresa dentro de Clientes PJ." },
  { key: "empresa-tab-dossie", group: "clientes", label: "Aba Dossiê / Laudo IA", href: "/colaborador/empresas?aba=dossie_credito", description: "Exibe a aba de dossiê e laudo de crédito dentro da empresa." },
  { key: "empresa-tab-inteligencia-360", group: "clientes", label: "Aba Inteligência 360", href: "/colaborador/empresas?aba=inteligencia_360", description: "Exibe a Central de Inteligência — Cliente 360 dentro da empresa." },
  { key: "empresa-tab-esteira-credito", group: "clientes", label: "Aba Esteira de Crédito", href: "/colaborador/empresas?aba=esteira_credito", description: "Exibe a esteira de crédito e assessoria da empresa." },
  { key: "empresa-tab-acervo-documental", group: "clientes", label: "Aba Acervo Documental", href: "/colaborador/empresas?aba=documentos", description: "Exibe o acervo documental dentro da empresa." },
  { key: "empresa-tab-conversas", group: "clientes", label: "Aba Conversas", href: "/colaborador/empresas?aba=followup", description: "Exibe conversas e follow-ups dentro da empresa." },
  { key: "empresa-tab-simulacoes", group: "clientes", label: "Aba Simulações", href: "/colaborador/empresas?aba=simulacoes", description: "Exibe simulações vinculadas à empresa." },
  { key: "empresa-tab-contratos", group: "clientes", label: "Aba Contratos Firmados", href: "/colaborador/empresas?aba=contratos", description: "Exibe contratos firmados vinculados à empresa." },
  { key: "empresa-tab-historico", group: "clientes", label: "Aba Histórico", href: "/colaborador/empresas?aba=historico", description: "Exibe histórico e Histórico 360 da empresa." },
  { key: "empresa-action-atualizar-cadastro", group: "clientes", label: "Ação Atualizar Cadastro", href: "/colaborador/empresas#atualizar-cadastro", description: "Permite atualizar dados cadastrais pela Receita Federal dentro da empresa." },
  { key: "empresa-action-editar", group: "clientes", label: "Ação Editar Empresa", href: "/colaborador/empresas#editar", description: "Permite abrir edição cadastral da empresa." },
  { key: "empresa-action-arquivar", group: "clientes", label: "Ação Arquivar Empresa", href: "/colaborador/empresas#arquivar", description: "Permite arquivar empresa preservando documentos." },
  { key: "empresa-action-nova-simulacao", group: "clientes", label: "Ação Nova Simulação", href: "/colaborador/empresas#nova-simulacao", description: "Permite iniciar nova simulação a partir da empresa." },
  { key: "empresa-action-novo-contrato", group: "clientes", label: "Ação Novo Contrato", href: "/colaborador/empresas#novo-contrato", description: "Permite iniciar novo contrato a partir da empresa." },
  { key: "empresa-action-iniciar-conversa", group: "clientes", label: "Ação Iniciar Conversa", href: "/colaborador/empresas#iniciar-conversa", description: "Permite iniciar conversa/follow-up dentro da empresa." },
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
