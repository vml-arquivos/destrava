// Utilitários e tipos para manipulação de CNPJ, CPF, telefone e CEP.
// Este módulo consolida funções de formatação e limpeza de strings numéricas
// e expõe tipos fortes para dados retornados da API BrasilAPI de CNPJ.

// ─── Formatadores ──────────────────────────────────────────────────────────

/**
 * Formata uma string contendo dígitos de CNPJ para o padrão xx.xxx.xxx/xxxx-xx.
 * Aceita qualquer entrada contendo números e remove caracteres não numéricos.
 * Trunca a saída em 18 caracteres.
 */
export function formatCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

/**
 * Formata uma string contendo dígitos de CPF para o padrão xxx.xxx.xxx-xx.
 */
export function formatCPF(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
    .slice(0, 14);
}

/**
 * Formata um número de telefone brasileiro. Aceita 10 ou 11 dígitos e insere
 * parênteses e hífen conforme o tamanho.
 */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/**
 * Formata um CEP brasileiro para o padrão xxxxx-xxx.
 */
export function formatCEP(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 9);
}

/**
 * Remove todos os caracteres que não sejam dígitos de uma string.
 */
export function cleanDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

/**
 * Estrutura retornada pela BrasilAPI para cada sócio de uma empresa.
 */
export interface CNPJSocio {
  nome_socio: string;
  cnpj_cpf_do_socio: string;
  qualificacao_socio: string;
  descricao_qualificacao_socio?: string;
  data_entrada_sociedade: string;
  pais?: string;
  representante_legal?: string;
  nome_do_representante?: string;
  qualificacao_representante_legal?: string;
}

/**
 * Estrutura principal retornada pela BrasilAPI para dados de CNPJ.
 */
export interface CNPJData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  email: string;
  ddd_telefone_1: string;
  ddd_telefone_2?: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  descricao_situacao_cadastral: string;
  data_situacao_cadastral?: string;
  motivo_situacao_cadastral?: string;
  ente_federativo_responsavel?: string;
  natureza_juridica: string;
  inscricao_estadual?: string;
  porte: string;
  descricao_porte: string;
  data_inicio_atividade: string;
  capital_social: number;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  cnaes_secundarios?: Array<{
    codigo?: number | string;
    descricao?: string;
    cnae_fiscal?: number | string;
    cnae_fiscal_descricao?: string;
  }>;
  identificador_matriz_filial?: number | string;
  descricao_identificador_matriz_filial?: string;
  opcao_pelo_simples?: boolean | string | null;
  opcao_pelo_mei?: boolean | string | null;
  descricao_tipo_de_logradouro?: string;
  qsa: CNPJSocio[];
  provedor_principal?: string;
  provedor?: 'opencnpj' | 'brasilapi' | string;
  data_sincronizacao?: string;
  ultima_sincronizacao_receita?: string;
  fontes_consulta?: Array<{ name: string; ok: boolean; status?: number; error?: string }>;
  dados_extra?: { fontes_consulta?: Array<{ name: string; ok: boolean; status?: number; error?: string }>; [key: string]: unknown };
  dados_fontes?: Record<string, unknown>;
  inscricoes_estaduais?: unknown[];
  suframa?: unknown[];
  [key: string]: unknown;
}

// ─── API de pré-preenchimento via backend ──────────────────────────────────

/**
 * Busca dados de CNPJ para pré-preencher formulários.
 * Esta função NÃO é a sincronização final do cadastro.
 * A gravação/atualização persistente deve passar por `/api/empresas/:id/sincronizar-receita`.
 */
export async function fetchCNPJData(cnpj: string): Promise<CNPJData> {
  const clean = cleanDigits(cnpj);
  if (clean.length !== 14) throw new Error('CNPJ inválido');
  const res = await fetch(`/api/cnpj/${clean}`);
  if (res.status === 404) throw new Error('CNPJ não encontrado na Receita Federal');
  if (res.status === 400) throw new Error('CNPJ inválido');
  if (!res.ok) throw new Error('Erro ao consultar CNPJ. Tente novamente.');
  return res.json();
}
