import { Router, Request, Response } from 'express';

// Consulta CNPJ com fonte autoritativa prioritária na BrasilAPI/Receita.
// OpenCNPJ fica apenas como enriquecimento opcional, sem sobrescrever Receita.

const router = Router();

type AnyRecord = Record<string, any>;
type ProviderName = 'brasilapi' | 'opencnpj';
type ProviderResult = { name: ProviderName; ok: boolean; status?: number; data?: AnyRecord | null; error?: string };

const REQUEST_TIMEOUT_MS = Number(process.env.CNPJ_API_TIMEOUT_MS || 15000);
const ENRICH_OPENCNPJ = String(process.env.CNPJ_ENRICH_OPENCNPJ || '').toLowerCase() === 'true';
const OPENCNPJ_BASE_URL = (process.env.OPENCNPJ_BASE_URL || 'https://api.opencnpj.org').replace(/\/$/, '');

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function emptyToNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function firstNonEmpty<T = any>(...values: T[]): T | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return null;
}

function normalizeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim().replace(/[R$\s]/g, '').replace(/[^\d,.-]/g, '');
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep === -1) {
    const n = Number(raw.replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const decimals = raw.slice(lastSep + 1).replace(/\D/g, '');
  const before = raw.slice(0, lastSep).replace(/[^\d-]/g, '');
  if (decimals.length > 0 && decimals.length <= 2) {
    const n = Number(`${before}.${decimals}`);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw.replace(/[.,]/g, '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return text;
}

function normalizeBooleanText(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (['true', 'sim', 's', 'yes', 'y', 'ativo', 'optante'].includes(text)) return true;
  if (['false', 'não', 'nao', 'n', 'no', 'inativo', 'nao optante', 'não optante'].includes(text)) return false;
  return null;
}

function cleanPhone(...values: unknown[]): string | null {
  for (const value of values) {
    const digits = onlyDigits(value);
    if (digits.length >= 8) return digits;
  }
  return null;
}

function normalizeStateRegistrations(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((r: AnyRecord) => ({
      numero: emptyToNull(firstNonEmpty(r.number, r.numero, r.inscricao_estadual, r.registrationNumber)),
      uf: emptyToNull(firstNonEmpty(r.state, r.uf, r.estado)),
      situacao: emptyToNull(firstNonEmpty(r.status?.text, r.status?.name, r.status, r.situacao)),
      tipo: emptyToNull(firstNonEmpty(r.type?.text, r.type, r.tipo)),
      dados_extra: r,
    }))
    .filter((r) => r.numero || r.uf || r.situacao);
}

function firstStateRegistration(registrations: AnyRecord[]): string | null {
  const active = registrations.find((r) => String(r.situacao || '').toLowerCase().includes('habilit') || String(r.situacao || '').toLowerCase().includes('ativ'));
  return emptyToNull((active || registrations[0] || {}).numero);
}

function normalizeRepresentativeFlag(value: unknown, representativeName?: unknown): string | null {
  if (representativeName && String(representativeName).trim()) return 'SIM';
  if (value === true || value === 1 || value === '1') return 'SIM';
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (['true', 'sim', 's', 'yes', 'representante', 'representante legal'].includes(text)) return 'SIM';
  return null;
}

function normalizeSocioApi(raw: AnyRecord, fonte: string): AnyRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const pessoa = raw.pessoa || raw.person || raw.socio || raw.partner || raw;
  const representante = raw.representante || raw.representative || raw.agent || raw.representante_legal || {};
  const nomeRepresentante = firstNonEmpty(raw.nome_representante_legal, raw.nome_do_representante, raw.nome_representante, representante?.nome, representante?.name);
  const nome = emptyToNull(firstNonEmpty(raw.nome_socio, raw.nome_do_socio, raw.nome, raw.name, raw.razao_social, pessoa?.nome, pessoa?.name, pessoa?.razao_social));
  if (!nome) return null;
  const qualificacao = firstNonEmpty(raw.qualificacao_socio, raw.descricao_qualificacao_socio, raw.qualificacao?.descricao, raw.qualificacao?.nome, raw.qualificacao, raw.role?.text, raw.role?.name, raw.role, raw.cargo, raw.papel);
  const documento = firstNonEmpty(raw.cnpj_cpf_do_socio, raw.cnpj_cpf, raw.cpf_cnpj, raw.documento, raw.document, raw.taxId, raw.tax_id, raw.cpf, raw.cnpj, pessoa?.cnpj_cpf_do_socio, pessoa?.taxId, pessoa?.document, pessoa?.cpf, pessoa?.cnpj);
  return {
    nome_socio: nome,
    cnpj_cpf_do_socio: documento ? String(documento).trim() : null,
    qualificacao_socio: emptyToNull(qualificacao) || 'Sócio',
    descricao_qualificacao_socio: emptyToNull(qualificacao) || 'Sócio',
    data_entrada_sociedade: toDate(firstNonEmpty(raw.data_entrada_sociedade, raw.data_entrada, raw.since, raw.inicio, raw.started_at)),
    pais: emptyToNull(firstNonEmpty(raw.pais?.nome, raw.pais, raw.country, pessoa?.pais?.nome, pessoa?.country)),
    representante_legal: normalizeRepresentativeFlag(raw.representante_legal, nomeRepresentante),
    nome_representante_legal: emptyToNull(nomeRepresentante),
    nome_do_representante: emptyToNull(nomeRepresentante),
    nome_representante: emptyToNull(nomeRepresentante),
    qualificacao_representante_legal: emptyToNull(firstNonEmpty(raw.qualificacao_representante_legal, raw.qualificacao_do_representante, raw.qualificacao_representante, representante?.qualificacao?.descricao, representante?.qualificacao, representante?.role?.text, representante?.role?.name, representante?.role)),
    faixa_etaria: emptyToNull(firstNonEmpty(raw.faixa_etaria, pessoa?.faixa_etaria, raw.ageRange, raw.age_range)),
    identificador_socio: firstNonEmpty(raw.identificador_socio, raw.tipo_socio, raw.identifier, raw.type),
    fonte_dados: fonte,
    dados_extra: raw,
  };
}

function normalizeSociosApi(value: unknown, fonte: string): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((item) => normalizeSocioApi(item as AnyRecord, fonte)).filter(Boolean) as AnyRecord[];
  const seen = new Set<string>();
  return normalized.filter((socio) => {
    const key = `${String(socio.nome_socio || '').trim().toLowerCase()}|${String(socio.cnpj_cpf_do_socio || '').replace(/\D/g, '')}`;
    if (!socio.nome_socio || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(name: ProviderName, url: string): Promise<ProviderResult> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'destrava-credito/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) return { name, ok: false, status: 404, error: 'CNPJ não encontrado' };
    if (!response.ok) return { name, ok: false, status: response.status, error: `HTTP ${response.status}` };
    return { name, ok: true, status: response.status, data: await response.json() };
  } catch (err: any) {
    return { name, ok: false, error: err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'erro de consulta' };
  }
}

function normalizeBrasilApi(data?: AnyRecord | null): AnyRecord {
  if (!data) return {};
  const registrations = normalizeStateRegistrations(firstNonEmpty(data.inscricoes_estaduais, data.registrations, []));
  return {
    cnpj: onlyDigits(data.cnpj),
    razao_social: emptyToNull(data.razao_social),
    nome_fantasia: emptyToNull(data.nome_fantasia),
    email: emptyToNull(data.email),
    ddd_telefone_1: emptyToNull(data.ddd_telefone_1),
    ddd_telefone_2: emptyToNull(data.ddd_telefone_2),
    cep: emptyToNull(data.cep),
    logradouro: emptyToNull(data.logradouro),
    numero: emptyToNull(data.numero),
    complemento: emptyToNull(data.complemento),
    bairro: emptyToNull(data.bairro),
    municipio: emptyToNull(data.municipio),
    uf: emptyToNull(data.uf),
    descricao_situacao_cadastral: emptyToNull(data.descricao_situacao_cadastral),
    data_situacao_cadastral: toDate(data.data_situacao_cadastral),
    motivo_situacao_cadastral: emptyToNull(data.motivo_situacao_cadastral),
    natureza_juridica: emptyToNull(data.natureza_juridica),
    porte: emptyToNull(data.porte),
    descricao_porte: emptyToNull(data.descricao_porte),
    data_inicio_atividade: toDate(data.data_inicio_atividade),
    capital_social: normalizeMoney(data.capital_social),
    cnae_fiscal: data.cnae_fiscal ?? null,
    cnae_fiscal_descricao: emptyToNull(data.cnae_fiscal_descricao),
    cnaes_secundarios: Array.isArray(data.cnaes_secundarios) ? data.cnaes_secundarios : [],
    identificador_matriz_filial: data.identificador_matriz_filial ?? null,
    descricao_identificador_matriz_filial: emptyToNull(data.descricao_identificador_matriz_filial),
    opcao_pelo_simples: normalizeBooleanText(data.opcao_pelo_simples),
    opcao_pelo_mei: normalizeBooleanText(data.opcao_pelo_mei),
    qsa: normalizeSociosApi(data.qsa, 'brasilapi_receita'),
    inscricoes_estaduais: registrations,
    inscricao_estadual: firstStateRegistration(registrations),
  };
}

function normalizeOpenCnpj(data?: AnyRecord | null): AnyRecord {
  if (!data) return {};
  const estabelecimento = data.estabelecimento || data.office || data.empresa || data;
  const socios = firstNonEmpty(data.socios, data.qsa, data.partners, data.quadro_societario, data.sociedade, estabelecimento.socios, estabelecimento.qsa, estabelecimento.partners, []);
  return { qsa: normalizeSociosApi(socios, 'opencnpj_enriquecimento') };
}

function mergeArrays(primary: any[], fallback: any[]): any[] {
  const result: any[] = [];
  const seen = new Set<string>();
  for (const item of [...(primary || []), ...(fallback || [])]) {
    const key = `${String(item?.nome_socio || item?.nome || '').trim().toLowerCase()}|${onlyDigits(item?.cnpj_cpf_do_socio || item?.cpf_cnpj || item?.documento)}`;
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function mergeNormalized(rawCnpj: string, brasil: AnyRecord, opencnpj: AnyRecord): AnyRecord {
  const merged: AnyRecord = { ...brasil, cnpj: rawCnpj };
  // OpenCNPJ nunca sobrescreve dados cadastrais da Receita/BrasilAPI.
  merged.qsa = mergeArrays(brasil.qsa || [], opencnpj.qsa || []);
  return merged;
}

router.get('/:cnpj', async (req: Request, res: Response) => {
  const raw = onlyDigits(req.params.cnpj);
  if (raw.length !== 14) return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos.' });

  const results: ProviderResult[] = [];
  const brasilResult = await fetchJson('brasilapi', `https://brasilapi.com.br/api/cnpj/v1/${raw}`);
  results.push(brasilResult);
  console.log(`[CNPJ] BrasilAPI ${raw}: ${brasilResult.ok ? 'OK' : brasilResult.error || brasilResult.status}`);

  let openResult: ProviderResult | null = null;
  if (ENRICH_OPENCNPJ && brasilResult.ok) {
    openResult = await fetchJson('opencnpj', `${OPENCNPJ_BASE_URL}/${raw}`);
    results.push(openResult);
    console.log(`[CNPJ] OpenCNPJ enriquecimento ${raw}: ${openResult.ok ? 'OK' : openResult.error || openResult.status}`);
  }

  if (!brasilResult.ok || !brasilResult.data) {
    return res.status(brasilResult.status === 404 ? 404 : 502).json({
      error: brasilResult.status === 404 ? 'CNPJ não encontrado na Receita Federal.' : 'Erro ao consultar CNPJ na Receita/BrasilAPI.',
      fontes_consulta: results.map(({ name, ok, status, error }) => ({ name, ok, status, error })),
    });
  }

  const brasil = normalizeBrasilApi(brasilResult.data);
  const opencnpj = normalizeOpenCnpj(openResult?.data || null);
  const merged = mergeNormalized(raw, brasil, opencnpj);
  const dataSincronizacao = new Date().toISOString();
  const fontesConsulta = results.map(({ name, ok, status, error }) => ({ name, ok, status, error }));

  return res.json({
    ...merged,
    provedor_principal: 'brasilapi',
    provedor: 'brasilapi',
    data_sincronizacao: dataSincronizacao,
    ultima_sincronizacao_receita: dataSincronizacao,
    fontes_consulta: fontesConsulta,
    dados_extra: { fontes_consulta: fontesConsulta, qsa_count: merged.qsa?.length || 0 },
    qsa_count: merged.qsa?.length || 0,
    qsa_mensagem: (merged.qsa || []).length > 0 ? null : 'Nenhum sócio retornado pela fonte pública para este CNPJ',
    dados_fontes: { brasilapi: brasilResult.data, opencnpj: openResult?.data || null },
  });
});

export default router;
