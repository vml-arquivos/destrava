// Utilitários para consulta e normalização de dados públicos de CNPJ.
// A fonte padrão é a BrasilAPI via proxy interno /api/cnpj/:cnpj.

export function cleanDigits(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function formatCNPJ(value: string): string {
  return cleanDigits(value)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

export function formatCPF(value: string): string {
  return cleanDigits(value)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
    .slice(0, 14);
}

export function formatPhone(value: string): string {
  const d = cleanDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/[-\s]+$/, '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/[-\s]+$/, '');
}

export function formatCEP(value: string): string {
  return cleanDigits(value).replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
}

export interface CNPJSocio {
  nome_socio: string;
  cnpj_cpf_do_socio: string;
  qualificacao_socio: string;
  descricao_qualificacao_socio?: string;
  data_entrada_sociedade?: string;
  pais?: string;
  representante_legal?: string;
  nome_do_representante?: string;
  qualificacao_representante_legal?: string;
  [key: string]: any;
}

export interface CNAESecundario {
  codigo?: number | string;
  descricao?: string;
  code?: number | string;
  description?: string;
  [key: string]: any;
}

export interface CNPJData {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  email?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string | number;
  data_situacao_cadastral?: string;
  motivo_situacao_cadastral?: string | number;
  natureza_juridica?: string;
  porte?: string;
  descricao_porte?: string;
  identificador_matriz_filial?: string | number;
  descricao_matriz_filial?: string;
  data_inicio_atividade?: string;
  capital_social?: number;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  cnaes_secundarios?: CNAESecundario[];
  qsa?: CNPJSocio[];
  [key: string]: any;
}

export async function fetchCNPJData(cnpj: string): Promise<CNPJData> {
  const clean = cleanDigits(cnpj);
  if (clean.length !== 14) throw new Error('CNPJ inválido');

  const res = await fetch(`/api/cnpj/${clean}`);
  const payload = await res.json().catch(() => ({}));

  if (res.status === 404) throw new Error(payload?.error || 'CNPJ não encontrado na Receita Federal');
  if (res.status === 400) throw new Error(payload?.error || 'CNPJ inválido');
  if (!res.ok) throw new Error(payload?.error || 'Erro ao consultar CNPJ. Tente novamente.');

  return payload as CNPJData;
}
