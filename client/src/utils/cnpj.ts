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


/**
 * Normaliza capital social vindo de APIs diferentes e do PostgreSQL.
 * Aceita número, "50000.00", "50.000,00" ou "R$ 50.000,00" sem multiplicar por 100.
 */
export function normalizeCapitalSocialValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const original = String(value).replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!original) return null;
  const sign = original.startsWith('-') ? '-' : '';
  const s = original.replace(/[^0-9.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    const n = Number(sign + s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (s.includes('.')) {
    const parts = s.split('.');
    const last = parts[parts.length - 1] || '';
    if (parts.length === 2 && /^\d{1,2}$/.test(last)) {
      const n = Number(sign + s);
      return Number.isFinite(n) ? n : null;
    }
    const onlyThousands = parts.length > 1 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
    const normalized = onlyThousands ? parts.join('') : `${parts.slice(0, -1).join('')}.${last}`;
    const n = Number(sign + normalized);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(sign + s.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
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
  [key: string]: unknown;
}

// ─── API de consulta via backend ───────────────────────────────────────────

/**
 * Consulta dados de CNPJ através do endpoint `/api/cnpj/:cnpj` do backend.
 * Esse proxy evita expor a chamada externa no frontend e permite cachear.
 * Lança erro para códigos de status 400 e 404 ou quando a chamada falha.
 */
export async function fetchCNPJData(cnpj: string): Promise<CNPJData> {
  const clean = cleanDigits(cnpj);
  if (clean.length !== 14) throw new Error('CNPJ inválido');
  const res = await fetch(`/api/cnpj/${clean}`);
  if (res.status === 404) throw new Error('CNPJ não encontrado na Receita Federal');
  if (res.status === 400) throw new Error('CNPJ inválido');
  if (!res.ok) throw new Error('Erro ao consultar CNPJ. Tente novamente.');
  const data = await res.json();
  return {
    ...data,
    capital_social: normalizeCapitalSocialValue(data?.capital_social) ?? data?.capital_social,
  };
}
