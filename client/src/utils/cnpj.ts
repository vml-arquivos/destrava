// ─── Formatadores ────────────────────────────────────────────────────────────

export function formatCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

export function formatCPF(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
    .slice(0, 14);
}

export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10)
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

export function formatCEP(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 9);
}

export function cleanDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

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
  natureza_juridica: string;
  porte: string;
  descricao_porte: string;
  data_inicio_atividade: string;
  capital_social: number;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  qsa: CNPJSocio[];
}

// ─── Fetch via backend (proxy) ────────────────────────────────────────────────

export async function fetchCNPJData(cnpj: string): Promise<CNPJData> {
  const clean = cleanDigits(cnpj);
  if (clean.length !== 14) throw new Error('CNPJ inválido');

  // Passa pelo backend Express — não expõe chamada externa no frontend
  const res = await fetch(`/api/cnpj/${clean}`);

  if (res.status === 404) throw new Error('CNPJ não encontrado na Receita Federal');
  if (res.status === 400) throw new Error('CNPJ inválido');
  if (!res.ok) throw new Error('Erro ao consultar CNPJ. Tente novamente.');

  return res.json();
}
