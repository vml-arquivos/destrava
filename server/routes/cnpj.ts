import { Router, Request, Response } from 'express';

// Consulta CNPJ com composição de fontes.
// Mantém o contrato antigo da BrasilAPI para não quebrar o frontend, mas passa
// a enriquecer os dados com CNPJá Open e, quando configurado/disponível, OpenCNPJ.

const router = Router();

type AnyRecord = Record<string, any>;

type ProviderResult = {
  name: 'brasilapi' | 'opencnpj' | 'cnpja_open';
  ok: boolean;
  status?: number;
  data?: AnyRecord | null;
  error?: string;
};

const REQUEST_TIMEOUT_MS = Number(process.env.CNPJ_API_TIMEOUT_MS || 8_000);
const ENABLE_OPENCNPJ = process.env.CNPJ_ENABLE_OPENCNPJ !== 'false';
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
  const qualificacao = firstNonEmpty(
    raw.qualificacao_socio,
    raw.descricao_qualificacao_socio,
    raw.qualificacao?.descricao,
    raw.qualificacao?.nome,
    raw.qualificacao,
    raw.role?.text,
    raw.role?.name,
    raw.role,
    raw.cargo,
    raw.papel
  );
  const representante = raw.representante || raw.representative || raw.agent || raw.representante_legal || {};
  const nomeRepresentante = firstNonEmpty(
    raw.nome_representante_legal,
    raw.nome_do_representante,
    raw.nome_representante,
    representante?.nome,
    representante?.name
  );
  const documento = firstNonEmpty(
    raw.cnpj_cpf_do_socio,
    raw.cnpj_cpf,
    raw.cpf_cnpj,
    raw.documento,
    raw.document,
    raw.taxId,
    raw.tax_id,
    raw.cpf,
    raw.cnpj,
    pessoa?.cnpj_cpf_do_socio,
    pessoa?.taxId,
    pessoa?.document,
    pessoa?.cpf,
    pessoa?.cnpj
  );
  const nome = emptyToNull(firstNonEmpty(
    raw.nome_socio,
    raw.nome_do_socio,
    raw.nome,
    raw.name,
    raw.razao_social,
    pessoa?.nome,
    pessoa?.name,
    pessoa?.razao_social
  ));
  if (!nome) return null;

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
    qualificacao_representante_legal: emptyToNull(firstNonEmpty(
      raw.qualificacao_representante_legal,
      raw.qualificacao_do_representante,
      raw.qualificacao_representante,
      representante?.qualificacao?.descricao,
      representante?.qualificacao,
      representante?.role?.text,
      representante?.role?.name,
      representante?.role
    )),
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

function cleanPhone(area?: unknown, number?: unknown): string | null {
  const ddd = onlyDigits(area);
  const num = onlyDigits(number);
  const full = onlyDigits(`${area || ''}${number || ''}`);
  if (ddd && num) return `${ddd}${num}`;
  return full || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(name: ProviderResult['name'], url: string): Promise<ProviderResult> {
  const backoffs = [0, 1000, 2000, 4000];
  let lastError = 'erro de consulta';
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < backoffs.length; attempt += 1) {
    if (backoffs[attempt] > 0) await sleep(backoffs[attempt]);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'destrava-credito/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      lastStatus = response.status;

      if (response.status === 404) return { name, ok: false, status: 404, error: 'CNPJ não encontrado' };
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
        continue;
      }

      const data = await response.json();
      return { name, ok: true, status: response.status, data };
    } catch (err: any) {
      lastError = err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'erro de consulta';
    }
  }

  return { name, ok: false, status: lastStatus, error: lastError };
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
    qsa: normalizeSociosApi(data.qsa, 'brasilapi'),
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
    qsa: normalizeSociosApi(members, 'cnpja_open'),
    inscricoes_estaduais: registrations,
    inscricao_estadual: firstStateRegistration(registrations),
    suframa: Array.isArray(data.suframa) ? data.suframa : [],
  };
}

function normalizeOpenCnpj(data?: AnyRecord | null): AnyRecord {
  if (!data) return {};
  const estabelecimento = data.estabelecimento || data.office || data.empresa || data;
  const socios = firstNonEmpty(data.socios, data.qsa, data.partners, data.quadro_societario, data.sociedade, estabelecimento.socios, estabelecimento.qsa, estabelecimento.partners, []);
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
    qsa: normalizeSociosApi(socios, 'opencnpj'),
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
  const keys = new Set([...Object.keys(brasil), ...Object.keys(opencnpj), ...Object.keys(cnpja)]);

  for (const key of keys) {
    if (key === 'qsa' || key === 'cnaes_secundarios') continue;
    // APIs gratuitas podem estar cacheadas em momentos diferentes. Para reduzir defasagem,
    // priorize CNPJá/OpenCNPJ quando trouxerem campo, e use BrasilAPI como fallback.
    // A fonte oficial anexada (Cartão CNPJ) é tratada na rota de sincronização da empresa.
    merged[key] = firstNonEmpty(cnpja[key], opencnpj[key], brasil[key]);
  }

  merged.qsa = mergeArrays(cnpja.qsa || [], mergeArrays(opencnpj.qsa || [], brasil.qsa || []));
  merged.cnaes_secundarios = mergeArrays(cnpja.cnaes_secundarios || [], mergeArrays(opencnpj.cnaes_secundarios || [], brasil.cnaes_secundarios || []));

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

  const results: ProviderResult[] = [];

  // BrasilAPI/Receita primeiro e sempre. Ela é a fonte que deve salvar dados cadastrais
  // como município/UF, CNAE principal, natureza jurídica, porte, situação e endereço.
  const brasilResult = await fetchJson('brasilapi', `https://brasilapi.com.br/api/cnpj/v1/${raw}`);
  results.push(brasilResult);
  const brasilQsaCount = normalizeBrasilApi(brasilResult.data).qsa?.length || 0;
  console.log(`[CNPJ] BrasilAPI ${raw}: ${brasilResult.ok ? `OK (${brasilQsaCount} sócio(s))` : brasilResult.error || brasilResult.status}`);

  const cnpjaResult = await fetchJson('cnpja_open', `https://open.cnpja.com/office/${raw}`);
  results.push(cnpjaResult);
  const cnpjaQsaCount = normalizeCnpja(cnpjaResult.data).qsa?.length || 0;
  console.log(`[CNPJ] CNPJá Open ${raw}: ${cnpjaResult.ok ? `OK (${cnpjaQsaCount} sócio(s))` : cnpjaResult.error || cnpjaResult.status}`);

  if (ENABLE_OPENCNPJ) {
    const openResult = await fetchJson('opencnpj', `${OPENCNPJ_BASE_URL}/${raw}`);
    results.push(openResult);
    const openQsaCount = normalizeOpenCnpj(openResult.data).qsa?.length || 0;
    console.log(`[CNPJ] OpenCNPJ ${raw}: ${openResult.ok ? `OK (${openQsaCount} sócio(s))` : openResult.error || openResult.status}`);
  }

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

  const dataSincronizacao = new Date().toISOString();
  const fontesConsulta = results.map(({ name, ok, status, error }) => ({ name, ok, status, error }));

  return res.json({
    ...merged,
    provedor_principal: success[0].name,
    provedor: success[0].name,
    data_sincronizacao: dataSincronizacao,
    ultima_sincronizacao_receita: dataSincronizacao,
    fontes_consulta: fontesConsulta,
    dados_extra: { fontes_consulta: fontesConsulta, qsa_count: merged.qsa?.length || 0 },
    qsa_count: merged.qsa?.length || 0,
    qsa_mensagem: (merged.qsa || []).length > 0 ? null : 'Nenhum sócio retornado pelas fontes gratuitas para este CNPJ',
    dados_fontes: {
      brasilapi: brasilRaw,
      opencnpj: opencnpjRaw,
    },
  });
});

export default router;
