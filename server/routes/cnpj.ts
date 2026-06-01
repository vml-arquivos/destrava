import { Router, Request, Response } from 'express';

// Consulta CNPJ com composição de fontes.
// Mantém o contrato antigo da BrasilAPI para não quebrar o frontend, mas passa
// a enriquecer os dados com CNPJá Open e, quando configurado/disponível, OpenCNPJ.

const router = Router();

type AnyRecord = Record<string, any>;

type ProviderResult = {
  name: 'brasilapi' | 'cnpja_open' | 'opencnpj';
  ok: boolean;
  status?: number;
  data?: AnyRecord | null;
  error?: string;
};

const REQUEST_TIMEOUT_MS = Number(process.env.CNPJ_API_TIMEOUT_MS || 8_000);
const ENABLE_OPEN_CNPJA = process.env.CNPJ_ENABLE_OPEN_CNPJA !== 'false';
const ENABLE_OPENCNPJ = process.env.CNPJ_ENABLE_OPENCNPJ !== 'false';
const OPENCNPJ_BASE_URL = (process.env.OPENCNPJ_BASE_URL || 'https://opencnpj.org').replace(/\/$/, '');

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

  const raw = String(value).trim().replace(/[^\d,.-]/g, '');
  if (!raw) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);

  // Sem separador decimal/milhar: número inteiro vindo da API.
  if (lastSep === -1) {
    const parsed = Number(raw.replace(/[^\d-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const decimals = raw.slice(lastSep + 1).replace(/\D/g, '');
  const before = raw.slice(0, lastSep).replace(/[^\d-]/g, '');

  // Se há exatamente 1 ou 2 casas após o último separador, trate como decimal.
  // Isso preserva formatos de API como "50000.00" = 50000.
  if (decimals.length > 0 && decimals.length <= 2) {
    const parsed = Number(`${before}.${decimals}`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Se há 3 casas após o separador, normalmente é milhar: "50.000" = 50000.
  const parsed = Number(raw.replace(/[.,]/g, '').replace(/[^\d-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
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

function toDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [d, m, y] = text.split('/');
    return `${y}-${m}-${d}`;
  }
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

function cleanPhone(area?: unknown, number?: unknown): string | null {
  const ddd = onlyDigits(area);
  const num = onlyDigits(number);
  const full = onlyDigits(`${area || ''}${number || ''}`);
  if (ddd && num) return `${ddd}${num}`;
  return full || null;
}

async function fetchJson(name: ProviderResult['name'], url: string): Promise<ProviderResult> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'destrava-credito/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404) return { name, ok: false, status: 404, error: 'CNPJ não encontrado' };
    if (!response.ok) return { name, ok: false, status: response.status, error: `HTTP ${response.status}` };

    const data = await response.json();
    return { name, ok: true, status: response.status, data };
  } catch (err: any) {
    return { name, ok: false, error: err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'erro de consulta' };
  }
}

function normalizeBrasilApi(data?: AnyRecord | null): AnyRecord {
  if (!data) return {};
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
    qsa: Array.isArray(data.qsa) ? data.qsa : [],
    inscricoes_estaduais: normalizeStateRegistrations(firstNonEmpty(data.inscricoes_estaduais, data.registrations, [])),
    inscricao_estadual: firstStateRegistration(normalizeStateRegistrations(firstNonEmpty(data.inscricoes_estaduais, data.registrations, []))),
  };
}

function normalizeCnpja(data?: AnyRecord | null): AnyRecord {
  if (!data) return {};

  const company = data.company || {};
  const address = data.address || data.office?.address || {};
  const status = data.status || data.registrationStatus || {};
  const nature = company.nature || data.nature || {};
  const size = company.size || data.size || {};
  const mainActivity = data.mainActivity || data.main_activity || data.primaryActivity || {};
  const sideActivities = data.sideActivities || data.side_activities || data.secondaryActivities || [];
  const phones = Array.isArray(data.phones) ? data.phones : [];
  const emails = Array.isArray(data.emails) ? data.emails : [];
  const members = Array.isArray(company.members) ? company.members : Array.isArray(data.members) ? data.members : [];
  const simples = data.simples || data.simei || data.taxRegime || {};
  const registrations = normalizeStateRegistrations(firstNonEmpty(data.registrations, data.inscricoes_estaduais, data.stateRegistrations, []));

  return {
    cnpj: onlyDigits(firstNonEmpty(data.taxId, data.cnpj, data.tax_id)),
    razao_social: emptyToNull(firstNonEmpty(company.name, data.companyName, data.name, data.razao_social)),
    nome_fantasia: emptyToNull(firstNonEmpty(data.alias, data.tradeName, data.nome_fantasia)),
    email: emptyToNull(firstNonEmpty(emails[0]?.address, data.email)),
    ddd_telefone_1: cleanPhone(phones[0]?.area, phones[0]?.number) || emptyToNull(data.phone),
    ddd_telefone_2: cleanPhone(phones[1]?.area, phones[1]?.number),
    cep: emptyToNull(firstNonEmpty(address.zip, address.zipCode, address.cep)),
    logradouro: emptyToNull(firstNonEmpty(address.street, address.logradouro)),
    numero: emptyToNull(firstNonEmpty(address.number, address.numero)),
    complemento: emptyToNull(firstNonEmpty(address.details, address.complement, address.complemento)),
    bairro: emptyToNull(firstNonEmpty(address.district, address.neighborhood, address.bairro)),
    municipio: emptyToNull(firstNonEmpty(address.city, address.municipality, address.municipio)),
    uf: emptyToNull(firstNonEmpty(address.state, address.uf)),
    descricao_situacao_cadastral: emptyToNull(firstNonEmpty(status.text, status.name, data.statusText, data.situacao_cadastral)),
    data_situacao_cadastral: toDate(firstNonEmpty(data.statusDate, data.status_date, data.data_situacao_cadastral)),
    motivo_situacao_cadastral: emptyToNull(firstNonEmpty(data.reason, data.reasonText, data.motivo_situacao_cadastral)),
    natureza_juridica: emptyToNull(firstNonEmpty(nature.text, nature.name, data.natureza_juridica)),
    porte: emptyToNull(firstNonEmpty(size.acronym, size.text, size.name, data.porte)),
    descricao_porte: emptyToNull(firstNonEmpty(size.text, size.name, data.descricao_porte)),
    data_inicio_atividade: toDate(firstNonEmpty(data.founded, data.opened, data.data_inicio_atividade)),
    capital_social: normalizeMoney(firstNonEmpty(company.equity, data.equity, data.capital_social)),
    cnae_fiscal: firstNonEmpty(mainActivity.id, mainActivity.code, data.cnae_fiscal),
    cnae_fiscal_descricao: emptyToNull(firstNonEmpty(mainActivity.text, mainActivity.description, data.cnae_fiscal_descricao)),
    cnaes_secundarios: Array.isArray(sideActivities)
      ? sideActivities.map((item: AnyRecord) => ({ codigo: item.id || item.code || item.codigo, descricao: item.text || item.description || item.descricao })).filter((c: AnyRecord) => c.codigo || c.descricao)
      : [],
    identificador_matriz_filial: data.head === true ? 1 : data.head === false ? 2 : null,
    descricao_identificador_matriz_filial: data.head === true ? 'Matriz' : data.head === false ? 'Filial' : null,
    opcao_pelo_simples: normalizeBooleanText(firstNonEmpty(simples.optant, simples.simples, data.optantSimples, data.opcao_pelo_simples)),
    opcao_pelo_mei: normalizeBooleanText(firstNonEmpty(simples.simei, simples.mei, data.optantMei, data.opcao_pelo_mei)),
    qsa: members.map((m: AnyRecord) => ({
      nome_socio: firstNonEmpty(m.person?.name, m.name, m.nome_socio),
      cnpj_cpf_do_socio: onlyDigits(firstNonEmpty(m.person?.taxId, m.taxId, m.document, m.cnpj_cpf_do_socio)),
      qualificacao_socio: firstNonEmpty(m.role?.text, m.role?.name, m.role, m.qualificacao_socio),
      descricao_qualificacao_socio: firstNonEmpty(m.role?.text, m.role?.name, m.role, m.descricao_qualificacao_socio),
      data_entrada_sociedade: toDate(firstNonEmpty(m.since, m.data_entrada_sociedade)),
      pais: firstNonEmpty(m.person?.country, m.country, m.pais),
      representante_legal: firstNonEmpty(m.agent?.name, m.representative?.name, m.nome_do_representante) ? 'SIM' : null,
      nome_do_representante: firstNonEmpty(m.agent?.name, m.representative?.name, m.nome_do_representante),
      qualificacao_representante_legal: firstNonEmpty(m.agent?.role?.text, m.representative?.role?.text, m.qualificacao_representante_legal),
      dados_extra: m,
    })).filter((m: AnyRecord) => m.nome_socio),
    inscricoes_estaduais: registrations,
    inscricao_estadual: firstStateRegistration(registrations),
    suframa: Array.isArray(data.suframa) ? data.suframa : [],
  };
}

function normalizeOpenCnpj(data?: AnyRecord | null): AnyRecord {
  if (!data) return {};
  const estabelecimento = data.estabelecimento || data.office || data.empresa || data;
  const socios = data.socios || data.qsa || data.partners || estabelecimento.socios || [];
  const atividadePrincipal = estabelecimento.atividade_principal || estabelecimento.cnae_principal || data.atividade_principal || {};
  const atividadesSecundarias = estabelecimento.atividades_secundarias || estabelecimento.cnaes_secundarios || data.cnaes_secundarios || [];
  const registrations = normalizeStateRegistrations(firstNonEmpty(data.inscricoes_estaduais, data.registrations, estabelecimento.inscricoes_estaduais, []));

  return {
    cnpj: onlyDigits(firstNonEmpty(data.cnpj, estabelecimento.cnpj)),
    razao_social: emptyToNull(firstNonEmpty(data.razao_social, data.nome, estabelecimento.razao_social, estabelecimento.nome_empresarial)),
    nome_fantasia: emptyToNull(firstNonEmpty(estabelecimento.nome_fantasia, data.nome_fantasia)),
    email: emptyToNull(firstNonEmpty(estabelecimento.email, data.email)),
    ddd_telefone_1: cleanPhone(estabelecimento.ddd1 || estabelecimento.ddd, estabelecimento.telefone1 || estabelecimento.telefone) || emptyToNull(estabelecimento.telefone),
    ddd_telefone_2: cleanPhone(estabelecimento.ddd2 || estabelecimento.ddd, estabelecimento.telefone2),
    cep: emptyToNull(firstNonEmpty(estabelecimento.cep, data.cep)),
    logradouro: emptyToNull(firstNonEmpty(estabelecimento.logradouro, data.logradouro)),
    numero: emptyToNull(firstNonEmpty(estabelecimento.numero, data.numero)),
    complemento: emptyToNull(firstNonEmpty(estabelecimento.complemento, data.complemento)),
    bairro: emptyToNull(firstNonEmpty(estabelecimento.bairro, data.bairro)),
    municipio: emptyToNull(firstNonEmpty(estabelecimento.cidade?.nome, estabelecimento.municipio?.nome, estabelecimento.municipio, data.municipio)),
    uf: emptyToNull(firstNonEmpty(estabelecimento.estado?.sigla, estabelecimento.uf, data.uf)),
    descricao_situacao_cadastral: emptyToNull(firstNonEmpty(estabelecimento.situacao_cadastral, estabelecimento.situacao?.descricao, data.situacao_cadastral)),
    data_situacao_cadastral: toDate(firstNonEmpty(estabelecimento.data_situacao_cadastral, data.data_situacao_cadastral)),
    motivo_situacao_cadastral: emptyToNull(firstNonEmpty(estabelecimento.motivo_situacao_cadastral, data.motivo_situacao_cadastral)),
    natureza_juridica: emptyToNull(firstNonEmpty(data.natureza_juridica?.descricao, data.natureza_juridica, estabelecimento.natureza_juridica)),
    porte: emptyToNull(firstNonEmpty(data.porte?.sigla, data.porte?.descricao, data.porte)),
    descricao_porte: emptyToNull(firstNonEmpty(data.porte?.descricao, data.descricao_porte)),
    data_inicio_atividade: toDate(firstNonEmpty(estabelecimento.data_inicio_atividade, data.data_inicio_atividade)),
    capital_social: normalizeMoney(firstNonEmpty(data.capital_social, estabelecimento.capital_social)),
    cnae_fiscal: firstNonEmpty(atividadePrincipal.codigo, atividadePrincipal.id, estabelecimento.cnae_fiscal, data.cnae_fiscal),
    cnae_fiscal_descricao: emptyToNull(firstNonEmpty(atividadePrincipal.descricao, atividadePrincipal.text, estabelecimento.cnae_fiscal_descricao, data.cnae_fiscal_descricao)),
    cnaes_secundarios: Array.isArray(atividadesSecundarias)
      ? atividadesSecundarias.map((item: AnyRecord) => ({ codigo: item.codigo || item.id || item.cnae_fiscal, descricao: item.descricao || item.text || item.cnae_fiscal_descricao })).filter((c: AnyRecord) => c.codigo || c.descricao)
      : [],
    identificador_matriz_filial: firstNonEmpty(estabelecimento.tipo === 'Matriz' ? 1 : null, estabelecimento.matriz === true ? 1 : null, estabelecimento.matriz === false ? 2 : null),
    descricao_identificador_matriz_filial: emptyToNull(firstNonEmpty(estabelecimento.tipo, estabelecimento.matriz === true ? 'Matriz' : estabelecimento.matriz === false ? 'Filial' : null)),
    opcao_pelo_simples: normalizeBooleanText(firstNonEmpty(data.simples?.optante, data.opcao_pelo_simples)),
    opcao_pelo_mei: normalizeBooleanText(firstNonEmpty(data.mei?.optante, data.opcao_pelo_mei)),
    inscricoes_estaduais: registrations,
    inscricao_estadual: firstStateRegistration(registrations),
    qsa: Array.isArray(socios) ? socios.map((s: AnyRecord) => ({
      nome_socio: firstNonEmpty(s.nome, s.nome_socio, s.razao_social),
      cnpj_cpf_do_socio: onlyDigits(firstNonEmpty(s.cpf_cnpj, s.cnpj_cpf_do_socio, s.documento, s.cpf, s.cnpj)),
      qualificacao_socio: firstNonEmpty(s.qualificacao_socio, s.qualificacao?.descricao, s.cargo, s.papel),
      descricao_qualificacao_socio: firstNonEmpty(s.qualificacao_socio, s.qualificacao?.descricao, s.cargo, s.papel),
      data_entrada_sociedade: toDate(firstNonEmpty(s.data_entrada_sociedade, s.data_entrada)),
      pais: firstNonEmpty(s.pais?.nome, s.pais),
      representante_legal: firstNonEmpty(s.representante_legal, s.representante?.nome) ? 'SIM' : null,
      nome_do_representante: firstNonEmpty(s.representante?.nome, s.nome_do_representante),
      qualificacao_representante_legal: firstNonEmpty(s.representante?.qualificacao, s.qualificacao_representante_legal),
      dados_extra: s,
    })).filter((m: AnyRecord) => m.nome_socio) : [],
  };
}

function mergeArrays(primary: any[], fallback: any[]): any[] {
  const result: any[] = [];
  const seen = new Set<string>();
  for (const item of [...(primary || []), ...(fallback || [])]) {
    const key = JSON.stringify(item || {}).toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function mergeNormalized(rawCnpj: string, brasil: AnyRecord, cnpja: AnyRecord, opencnpj: AnyRecord): AnyRecord {
  const merged: AnyRecord = { cnpj: rawCnpj };
  const keys = new Set([...Object.keys(brasil), ...Object.keys(cnpja), ...Object.keys(opencnpj)]);

  for (const key of keys) {
    if (key === 'qsa' || key === 'cnaes_secundarios') continue;
    // CNPJá geralmente traz estrutura societária/IE/Simples mais rica; BrasilAPI fica como compatibilidade.
    merged[key] = firstNonEmpty(cnpja[key], brasil[key], opencnpj[key]);
  }

  merged.qsa = mergeArrays(cnpja.qsa || [], mergeArrays(brasil.qsa || [], opencnpj.qsa || []));
  merged.cnaes_secundarios = mergeArrays(cnpja.cnaes_secundarios || [], mergeArrays(brasil.cnaes_secundarios || [], opencnpj.cnaes_secundarios || []));

  return merged;
}

/**
 * GET /api/cnpj/:cnpj
 *
 * Consulta CNPJ mantendo compatibilidade com BrasilAPI e enriquecendo com CNPJá
 * Open/OpenCNPJ. Retorna o mesmo formato esperado pelo frontend atual + campos
 * extras: fontes_consulta, provedor_principal e dados_fontes.
 */
router.get('/:cnpj', async (req: Request, res: Response) => {
  const raw = onlyDigits(req.params.cnpj);
  if (raw.length !== 14) {
    return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos.' });
  }

  const providers: Promise<ProviderResult>[] = [
    fetchJson('brasilapi', `https://brasilapi.com.br/api/cnpj/v1/${raw}`),
  ];

  if (ENABLE_OPEN_CNPJA) providers.push(fetchJson('cnpja_open', `https://open.cnpja.com/office/${raw}`));
  if (ENABLE_OPENCNPJ) providers.push(fetchJson('opencnpj', `${OPENCNPJ_BASE_URL}/${raw}`));

  const results = await Promise.all(providers);
  const success = results.filter((r) => r.ok && r.data);

  if (success.length === 0) {
    const has404 = results.some((r) => r.status === 404);
    return res.status(has404 ? 404 : 502).json({
      error: has404 ? 'CNPJ não encontrado na Receita Federal.' : 'Erro ao consultar CNPJ nas fontes configuradas.',
      fontes_consulta: results.map(({ name, ok, status, error }) => ({ name, ok, status, error })),
    });
  }

  const brasilRaw = results.find((r) => r.name === 'brasilapi')?.data || null;
  const cnpjaRaw = results.find((r) => r.name === 'cnpja_open')?.data || null;
  const opencnpjRaw = results.find((r) => r.name === 'opencnpj')?.data || null;

  const brasil = normalizeBrasilApi(brasilRaw);
  const cnpja = normalizeCnpja(cnpjaRaw);
  const opencnpj = normalizeOpenCnpj(opencnpjRaw);
  const merged = mergeNormalized(raw, brasil, cnpja, opencnpj);

  return res.json({
    ...merged,
    provedor_principal: success.find((r) => r.name === 'cnpja_open')?.name || success[0].name,
    fontes_consulta: results.map(({ name, ok, status, error }) => ({ name, ok, status, error })),
    dados_fontes: {
      brasilapi: brasilRaw,
      cnpja_open: cnpjaRaw,
      opencnpj: opencnpjRaw,
    },
  });
});

export default router;
