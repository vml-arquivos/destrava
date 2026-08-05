import { classificarSituacaoCadastral, isSituacaoAtiva } from './situacaoCadastral';

export function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function diffDays(dateIso?: string | null): number | null {
  const iso = parseDate(dateIso);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function monthsSince(dateIso?: string | null): number | null {
  const iso = parseDate(dateIso);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  return Math.max(months, 0);
}

export function tempoAberturaDescricao(meses: number | null): string | null {
  if (meses === null) return null;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos <= 0) return `${resto} mês${resto === 1 ? '' : 'es'}`;
  if (resto === 0) return `${anos} ano${anos === 1 ? '' : 's'}`;
  return `${anos} ano${anos === 1 ? '' : 's'} e ${resto} mês${resto === 1 ? '' : 'es'}`;
}

export function detectarMatrizFilial(cnpjInput: unknown, valorExistente?: unknown): string | null {
  const existente = normalizeText(valorExistente);
  if (existente.includes('matriz')) return 'matriz';
  if (existente.includes('filial')) return 'filial';
  const cnpj = onlyDigits(cnpjInput);
  if (cnpj.length === 14) return cnpj.slice(8, 12) === '0001' ? 'matriz' : 'filial';
  return null;
}

export function enderecoEmpresa(empresa: any): string | null {
  return [
    empresa?.logradouro || empresa?.endereco,
    empresa?.numero,
    empresa?.complemento,
    empresa?.bairro,
    empresa?.cidade,
    empresa?.estado,
    empresa?.cep,
  ].filter(Boolean).join(', ') || null;
}

export function normalizarBasico(value: unknown): string {
  return normalizeText(value)
    .replace(/[.,;:()\[\]{}\/\\|_+*=!?\'"´`^~<>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarNomeEmpresarial(value: unknown): string {
  return normalizeText(value)
    .replace(/\b(ltda|limitada|me|epp|eireli)\b/g, (m) => m)
    .replace(/[^a-z0-9]/g, '');
}

export function normalizarCodigo(value: unknown, minDigits = 4): string {
  const digits = onlyDigits(value);
  return digits.length >= minDigits ? digits : '';
}

export function codigoCnae(value: unknown): string {
  const digits = onlyDigits(value);
  if (digits.length >= 7) return digits.slice(0, 7);
  return digits;
}

export function codigoNatureza(value: unknown): string {
  const digits = onlyDigits(value);
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
}

export function normalizarSituacao(value: unknown): string {
  const t = normalizarBasico(value);
  if (t.includes('baixada') || t.includes('baixado')) return 'baixada';
  if (t.includes('inapta') || t.includes('inapto')) return 'inapta';
  if (t.includes('inativa') || t.includes('inativo')) return 'inativa';
  if (t.includes('suspensa') || t.includes('suspenso')) return 'suspensa';
  if (t.includes('nula') || t.includes('nulo')) return 'nula';
  if (t.includes('cancelada') || t.includes('cancelado')) return 'cancelada';
  if (isSituacaoAtiva(value)) return 'ativa';
  if (classificarSituacaoCadastral(value) === 'irregular') return 'irregular';
  return t;
}

export function tokensEndereco(value: unknown): Set<string> {
  const ignorar = new Set([
    'rua', 'r', 'avenida', 'av', 'numero', 'n', 'sn', 'sem', 'quadra', 'qd',
    'lote', 'lt', 'sala', 'sl', 'go', 'goias', 'cep', 'bairro', 'distrito', 'municipio',
  ]);
  const t = normalizarBasico(value)
    .replace(/\b(s\/n|s n)\b/g, 'sn')
    .split(' ')
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !ignorar.has(x));
  return new Set(t);
}

export function compararEndereco(receita: unknown, cartao: unknown) {
  const rOriginal = String(receita || '').trim();
  const cOriginal = String(cartao || '').trim();
  if (!rOriginal || !cOriginal) {
    return {
      label: 'Endereço completo',
      status: 'nao_comparado',
      receita,
      cartao,
      divergente: false,
      normalizado_receita: '',
      normalizado_cartao: '',
      motivo: 'Valor ausente em uma das fontes.',
    };
  }

  const cepR = onlyDigits(rOriginal).match(/\d{8}/)?.[0] || '';
  const cepC = onlyDigits(cOriginal).match(/\d{8}/)?.[0] || '';
  const normR = normalizarBasico(rOriginal);
  const normC = normalizarBasico(cOriginal);

  if (cepR && cepC && cepR === cepC) {
    return {
      label: 'Endereço completo',
      status: 'conferido',
      receita,
      cartao,
      divergente: false,
      normalizado_receita: normR,
      normalizado_cartao: normC,
      motivo: 'CEP igual; diferenças de formatação/ordem não são divergência.',
    };
  }

  const tr = tokensEndereco(rOriginal);
  const tc = tokensEndereco(cOriginal);
  const comum = [...tr].filter((x) => tc.has(x)).length;
  const base = Math.max(1, Math.min(tr.size, tc.size));
  const similaridade = comum / base;
  const divergente = similaridade < 0.65 && !(normR.includes(normC) || normC.includes(normR));

  return {
    label: 'Endereço completo',
    status: divergente ? 'divergente' : 'conferido',
    receita,
    cartao,
    divergente,
    normalizado_receita: normR,
    normalizado_cartao: normC,
    motivo: divergente
      ? `Tokens relevantes em comum insuficientes (${comum}/${base}).`
      : 'Endereço equivalente após normalização.',
  };
}
