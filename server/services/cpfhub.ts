type CPFHubRawResponse = Record<string, any>;

export type CPFHubNormalized = {
  cpf: string;
  nome: string | null;
  nome_maiusculo: string | null;
  genero: string | null;
  data_nascimento: string | null;
  dia: number | null;
  mes: number | null;
  ano: number | null;
  fonte_dados: 'cpfhub';
  raw: CPFHubRawResponse;
};

export type CPFHubResult = {
  success: boolean;
  data?: CPFHubNormalized;
  error?: string;
  status?: number;
};

const DEFAULT_CPFHUB_URL = 'https://api.cpfhub.io';

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function validarCPF(cpfInput: unknown): boolean {
  const cpf = onlyDigits(cpfInput);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (base: string, factor: number) => {
    let total = 0;
    for (const digit of base) total += Number(digit) * factor--;
    const rest = (total * 10) % 11;
    return rest === 10 || rest === 11 ? 0 : rest;
  };

  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function normalizeDate(value: unknown, day?: unknown, month?: unknown, year?: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12 && y > 1800) {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function normalizeCPFHubResponse(cpf: string, response: CPFHubRawResponse): CPFHubNormalized {
  const container = response?.data && typeof response.data === 'object' ? response.data : response;
  const day = container?.day ?? container?.dia;
  const month = container?.month ?? container?.mes;
  const year = container?.year ?? container?.ano;
  return {
    cpf,
    nome: firstNonEmpty(container?.name, container?.nome, container?.Name, container?.Nome),
    nome_maiusculo: firstNonEmpty(container?.nameUpper, container?.nomeUpper, container?.nome_maiusculo, container?.NOME),
    genero: firstNonEmpty(container?.gender, container?.genero, container?.sexo),
    data_nascimento: normalizeDate(container?.birthDate ?? container?.data_nascimento ?? container?.nascimento, day, month, year),
    dia: Number.isFinite(Number(day)) ? Number(day) : null,
    mes: Number.isFinite(Number(month)) ? Number(month) : null,
    ano: Number.isFinite(Number(year)) ? Number(year) : null,
    fonte_dados: 'cpfhub',
    raw: response,
  };
}

export async function consultarCPFHub(cpfInput: unknown): Promise<CPFHubResult> {
  const cpf = onlyDigits(cpfInput);
  if (!validarCPF(cpf)) return { success: false, error: 'CPF inválido. Informe 11 dígitos válidos.' };

  const apiKey = process.env.CPFHUB_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'CPFHUB_API_KEY não configurada no ambiente.' };
  }

  const baseUrl = (process.env.CPFHUB_API_URL || DEFAULT_CPFHUB_URL).replace(/\/$/, '');
  const timeoutMs = Number(process.env.CPFHUB_TIMEOUT_MS || 10000);

  try {
    const res = await fetch(`${baseUrl}/cpf/${cpf}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'accept': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    let json: CPFHubRawResponse = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!res.ok) {
      const message = firstNonEmpty(json?.error, json?.message, json?.mensagem) || `CPFHub retornou HTTP ${res.status}`;
      return { success: false, error: message, status: res.status };
    }

    if (json?.success === false) {
      return { success: false, error: firstNonEmpty(json?.error, json?.message) || 'CPFHub não retornou dados para este CPF.', status: res.status };
    }

    return { success: true, data: normalizeCPFHubResponse(cpf, json), status: res.status };
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { success: false, error: isTimeout ? 'Timeout ao consultar CPFHub.' : (err?.message || 'Erro ao consultar CPFHub.') };
  }
}
