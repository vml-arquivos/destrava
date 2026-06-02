type AnyObject = Record<string, any>;

export type CPFCNPJSocio = {
  nome: string;
  cpf_cnpj: string | null;
  qualificacao_socio: string | null;
  data_entrada_sociedade: string | null;
  percentual_capital: string | number | null;
  representante_legal: boolean;
  pais: string | null;
  fonte_dados: 'cpfcnpj';
  dados_extra: AnyObject;
};

export type CPFCNPJConsultaResult = {
  success: boolean;
  status?: number;
  error?: string;
  cnpj: string;
  socios: CPFCNPJSocio[];
  resumo?: AnyObject;
};

const DEFAULT_CPFCNPJ_URL = 'https://api.cpfcnpj.com.br';

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return text;
}

function boolValue(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  const text = String(value || '').trim().toLowerCase();
  return ['true', 'sim', 's', 'representante', 'representante legal', 'responsavel', 'responsável'].includes(text);
}

function safeSummary(input: AnyObject): AnyObject {
  const clone: AnyObject = {};
  for (const [key, value] of Object.entries(input || {})) {
    const lower = key.toLowerCase();
    if (lower.includes('pdf') || lower.includes('base64') || lower.includes('cartao') || lower.includes('imagem')) continue;
    if (typeof value === 'string' && value.length > 500) {
      clone[key] = `${value.slice(0, 500)}...`;
    } else if (Array.isArray(value)) {
      clone[key] = value.slice(0, 20).map((item) => typeof item === 'object' && item ? safeSummary(item as AnyObject) : item);
    } else if (value && typeof value === 'object') {
      clone[key] = safeSummary(value as AnyObject);
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

function normalizePercentual(value: unknown): string | number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  return String(value).trim() || null;
}

function normalizeSocio(raw: AnyObject): CPFCNPJSocio | null {
  const nome = firstNonEmpty(
    raw?.nome,
    raw?.nome_socio,
    raw?.nome_do_socio,
    raw?.socio,
    raw?.razao_social,
    raw?.nomeSocio,
    raw?.Nome
  );
  if (!nome) return null;

  const documento = firstNonEmpty(
    raw?.cpf_cnpj_socio,
    raw?.cpfCnpjSocio,
    raw?.cnpj_cpf_do_socio,
    raw?.cnpj_cpf,
    raw?.cpf_cnpj,
    raw?.documento,
    raw?.cpf,
    raw?.cnpj,
    raw?.cpfSocio,
    raw?.CPF
  );

  return {
    nome,
    cpf_cnpj: documento,
    qualificacao_socio: firstNonEmpty(
      raw?.qualificacao_socio,
      raw?.descricao_qualificacao_socio,
      raw?.qualificacao,
      raw?.cargo,
      raw?.tipo_socio,
      raw?.tipo
    ),
    data_entrada_sociedade: normalizeDate(firstNonEmpty(raw?.data_entrada_sociedade, raw?.data_entrada, raw?.entrada_sociedade)),
    percentual_capital: normalizePercentual(firstNonEmpty(raw?.percentual_capital, raw?.percentual, raw?.participacao, raw?.participacao_societaria)),
    representante_legal: boolValue(raw?.representante_legal ?? raw?.responsavel_legal ?? raw?.representante),
    pais: firstNonEmpty(raw?.pais, raw?.pais_origem),
    fonte_dados: 'cpfcnpj',
    dados_extra: safeSummary(raw),
  };
}

function looksLikeSocioArray(value: unknown): value is AnyObject[] {
  return Array.isArray(value) && value.some((item) => item && typeof item === 'object' && (
    'nome' in item || 'nome_socio' in item || 'cpf_cnpj_socio' in item || 'qualificacao_socio' in item || 'cnpj_cpf_do_socio' in item
  ));
}

function collectSocioArrays(input: unknown, found: AnyObject[][] = [], depth = 0): AnyObject[][] {
  if (!input || depth > 5) return found;
  if (looksLikeSocioArray(input)) {
    found.push(input as AnyObject[]);
    return found;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectSocioArrays(item, found, depth + 1);
    return found;
  }
  if (typeof input === 'object') {
    const obj = input as AnyObject;
    const preferredKeys = ['socios', 'qsa', 'quadro_societario', 'quadroSocietario', 'administradores', 'participantes'];
    for (const key of preferredKeys) {
      if (key in obj) collectSocioArrays(obj[key], found, depth + 1);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (preferredKeys.includes(key)) continue;
      collectSocioArrays(value, found, depth + 1);
    }
  }
  return found;
}

export function normalizeCPFCNPJResponse(cnpj: string, response: AnyObject): { socios: CPFCNPJSocio[]; resumo: AnyObject } {
  const arrays = collectSocioArrays(response);
  const socios = arrays.flat().map(normalizeSocio).filter(Boolean) as CPFCNPJSocio[];
  const seen = new Set<string>();
  const unique = socios.filter((s) => {
    const key = `${s.nome.toLowerCase()}|${onlyDigits(s.cpf_cnpj)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    socios: unique,
    resumo: safeSummary({
      cnpj,
      status: response?.status ?? response?.success ?? response?.codigo,
      mensagem: response?.mensagem ?? response?.message ?? response?.erro,
      pacoteUsado: response?.pacoteUsado ?? response?.pacote_usado ?? response?.pacote,
      saldo: response?.saldo,
      consultaID: response?.consultaID ?? response?.consulta_id ?? response?.id,
      socios_count: unique.length,
    }),
  };
}

export async function consultarCPFCNPJ(cnpjInput: unknown): Promise<CPFCNPJConsultaResult> {
  const cnpj = onlyDigits(cnpjInput);
  if (cnpj.length !== 14) {
    return { success: false, cnpj, socios: [], error: 'CNPJ inválido para consulta CPF.CNPJ.' };
  }

  if (String(process.env.CPFCNPJ_ENABLED || '').toLowerCase() === 'false') {
    return { success: false, cnpj, socios: [], error: 'CPFCNPJ_ENABLED=false.' };
  }

  const token = process.env.CPFCNPJ_TOKEN || process.env.CPFCNPJ_API_KEY;
  if (!token) {
    return { success: false, cnpj, socios: [], error: 'CPFCNPJ_TOKEN não configurado no ambiente.' };
  }

  const baseUrl = (process.env.CPFCNPJ_API_URL || DEFAULT_CPFCNPJ_URL).replace(/\/$/, '');
  const pacote = process.env.CPFCNPJ_CNPJ_PACKAGE || '6';
  const timeoutMs = Number(process.env.CPFCNPJ_TIMEOUT_MS || 60000);
  const url = `${baseUrl}/${encodeURIComponent(token)}/${encodeURIComponent(pacote)}/${cnpj}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: AnyObject = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        cnpj,
        socios: [],
        error: firstNonEmpty(json?.erro, json?.error, json?.mensagem, json?.message) || `CPF.CNPJ retornou HTTP ${res.status}`,
        resumo: safeSummary(json),
      };
    }

    if (json?.status === 0 || json?.success === false || json?.erro || json?.error) {
      return {
        success: false,
        status: res.status,
        cnpj,
        socios: [],
        error: firstNonEmpty(json?.erro, json?.error?.message, json?.error, json?.mensagem, json?.message) || 'CPF.CNPJ não retornou dados para este CNPJ.',
        resumo: safeSummary(json),
      };
    }

    const normalized = normalizeCPFCNPJResponse(cnpj, json);
    return { success: true, status: res.status, cnpj, socios: normalized.socios, resumo: normalized.resumo };
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { success: false, cnpj, socios: [], error: isTimeout ? 'Timeout ao consultar CPF.CNPJ.' : (err?.message || 'Erro ao consultar CPF.CNPJ.') };
  }
}
