/**
 * shared/cargos.ts
 * Enum de cargos, mapa de permissões e funções utilitárias.
 * Usado tanto no backend (middleware, rotas) quanto no frontend (guards, UI).
 */

// ─── Enum de cargos ──────────────────────────────────────────────────────────

export const CARGOS = {
  ADMINISTRADOR:       "Administrador",
  DIRETOR:             "Diretor",
  GERENTE_COMERCIAL:   "Gerente Comercial",
  ANALISTA_CREDITO:    "Analista de Crédito",
  CONSULTOR_CREDITO:   "Consultor de Crédito",
  CAPTADOR_EXTERNO:    "Captador Externo",
  ESTAGIARIO:          "Estagiário",
} as const;

export type Cargo = typeof CARGOS[keyof typeof CARGOS];

// ─── Hierarquia numérica (menor = mais alto) ─────────────────────────────────

export const HIERARQUIA: Record<string, number> = {
  "administrador":        0,
  "admin":                0,
  "diretor":              1,
  "gerente comercial":    2,
  "analista de crédito":  3,
  "analista de credito":  3,
  "consultor de crédito": 4,
  "consultor de credito": 4,
  "captador externo":     5,
  "estagiário":           6,
  "estagiario":           6,
};

// ─── Permissões por cargo ────────────────────────────────────────────────────

export interface Permissoes {
  /** Pode visualizar todos os leads (não apenas os próprios) */
  verTodosLeads: boolean;
  /** Pode criar e editar usuários */
  gerenciarUsuarios: boolean;
  /** Pode gerar contratos */
  gerarContratos: boolean;
  /** Pode acessar relatórios financeiros */
  verRelatoriosFinanceiros: boolean;
  /** Pode mover leads no funil de qualquer responsável */
  moverLeadsAlheios: boolean;
  /** Pode editar dados de empresas de outros responsáveis */
  editarEmpresasAlheias: boolean;
  /** Pode acessar configurações do sistema */
  acessarConfiguracoes: boolean;
  /** Pode atender leads (não bloqueado por cargo) */
  atenderLeads: boolean;
  /** Pode captar leads externos */
  captarLeads: boolean;
  /** Pode visualizar o dashboard executivo */
  verDashboardExecutivo: boolean;
}

const PERMISSOES_POR_CARGO: Record<string, Permissoes> = {
  "administrador": {
    verTodosLeads: true, gerenciarUsuarios: true, gerarContratos: true,
    verRelatoriosFinanceiros: true, moverLeadsAlheios: true, editarEmpresasAlheias: true,
    acessarConfiguracoes: true, atenderLeads: true, captarLeads: true, verDashboardExecutivo: true,
  },
  "admin": {
    verTodosLeads: true, gerenciarUsuarios: true, gerarContratos: true,
    verRelatoriosFinanceiros: true, moverLeadsAlheios: true, editarEmpresasAlheias: true,
    acessarConfiguracoes: true, atenderLeads: true, captarLeads: true, verDashboardExecutivo: true,
  },
  "diretor": {
    verTodosLeads: true, gerenciarUsuarios: true, gerarContratos: true,
    verRelatoriosFinanceiros: true, moverLeadsAlheios: true, editarEmpresasAlheias: true,
    acessarConfiguracoes: false, atenderLeads: true, captarLeads: true, verDashboardExecutivo: true,
  },
  "gerente comercial": {
    verTodosLeads: true, gerenciarUsuarios: false, gerarContratos: true,
    verRelatoriosFinanceiros: true, moverLeadsAlheios: true, editarEmpresasAlheias: true,
    acessarConfiguracoes: false, atenderLeads: true, captarLeads: true, verDashboardExecutivo: true,
  },
  "analista de crédito": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: true,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: true, captarLeads: false, verDashboardExecutivo: false,
  },
  "analista de credito": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: true,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: true, captarLeads: false, verDashboardExecutivo: false,
  },
  "consultor de crédito": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: true,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: true, captarLeads: true, verDashboardExecutivo: false,
  },
  "consultor de credito": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: true,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: true, captarLeads: true, verDashboardExecutivo: false,
  },
  "captador externo": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: false,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: false, captarLeads: true, verDashboardExecutivo: false,
  },
  "estagiário": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: false,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: false, captarLeads: false, verDashboardExecutivo: false,
  },
  "estagiario": {
    verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: false,
    verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
    acessarConfiguracoes: false, atenderLeads: false, captarLeads: false, verDashboardExecutivo: false,
  },
};

const PERMISSOES_DEFAULT: Permissoes = {
  verTodosLeads: false, gerenciarUsuarios: false, gerarContratos: false,
  verRelatoriosFinanceiros: false, moverLeadsAlheios: false, editarEmpresasAlheias: false,
  acessarConfiguracoes: false, atenderLeads: false, captarLeads: false, verDashboardExecutivo: false,
};

// ─── Funções utilitárias ─────────────────────────────────────────────────────

/** Normaliza o cargo para chave do mapa (minúsculas, sem acentos) */
export function normalizarCargo(cargo: string | null | undefined): string {
  return (cargo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Retorna as permissões do cargo */
export function getPermissoes(cargo: string | null | undefined): Permissoes {
  return PERMISSOES_POR_CARGO[normalizarCargo(cargo)] ?? PERMISSOES_DEFAULT;
}

/** Retorna o nível hierárquico do cargo (0 = mais alto) */
export function nivelHierarquico(cargo: string | null | undefined): number {
  return HIERARQUIA[normalizarCargo(cargo)] ?? 99;
}

/** Verifica se o solicitante pode gerenciar o alvo (alvo deve ter nível maior) */
export function podeGerenciar(cargoCriador: string, cargoAlvo: string): boolean {
  return nivelHierarquico(cargoAlvo) > nivelHierarquico(cargoCriador);
}

/** Retorna os cargos que o solicitante pode criar/atribuir */
export function cargosGerenciaveis(cargoCriador: string): Cargo[] {
  const nivel = nivelHierarquico(cargoCriador);
  return Object.values(CARGOS).filter(c => nivelHierarquico(c) > nivel) as Cargo[];
}

/** Verifica se o cargo tem uma permissão específica */
export function temPermissao(
  cargo: string | null | undefined,
  permissao: keyof Permissoes
): boolean {
  return getPermissoes(cargo)[permissao] === true;
}

/** Lista de todos os cargos válidos (para validação) */
export const LISTA_CARGOS_VALIDOS = Object.values(CARGOS);
