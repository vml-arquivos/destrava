import { Router, Request, Response } from 'express';
import pkg from 'pg';
import { auth } from '../middleware/auth';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();


function isGestorCargo(cargo: string | null | undefined): boolean {
  return ['administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor'].includes((cargo || '').toLowerCase());
}

function colaboradorPodeVerTudo(colaborador: any): boolean {
  return Boolean(colaborador?.pode_ver_todos_leads || ['admin', 'gestor'].includes((colaborador?.perfil || '').toLowerCase()) || isGestorCargo(colaborador?.cargo));
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

async function empresaExiste(empresaId: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM empresas WHERE id=$1 LIMIT 1', [empresaId]);
  return rows.length > 0;
}

async function canAccessEmpresa(colaborador: any, empresaId: string): Promise<boolean> {
  if (!empresaId) return false;
  if (colaboradorPodeVerTudo(colaborador)) return await empresaExiste(empresaId);
  if (!colaborador?.id) return false;
  const columns = await getTableColumns('empresas');
  const conds: string[] = [];
  if (columns.has('responsavel_id')) conds.push('responsavel_id=$2');
  if (columns.has('analista_id')) conds.push('analista_id=$2');
  if (columns.has('captador_id')) conds.push('captador_id=$2');
  if (!conds.length) return false;
  const { rows } = await pool.query(`SELECT 1 FROM empresas WHERE id=$1 AND (${conds.join(' OR ')}) LIMIT 1`, [empresaId, colaborador.id]);
  return rows.length > 0;
}

async function requireEmpresaAccess(req: Request, res: Response): Promise<boolean> {
  const allowed = await canAccessEmpresa((req as any).colaborador || (req as any).user, req.params.id);
  if (!allowed) {
    res.status(403).json({ error: 'Acesso negado à empresa' });
    return false;
  }
  return true;
}

async function registrarHistoricoEmpresa(empresaId: string, tipo: string, descricao: string, autor?: string | null): Promise<void> {
  try {
    const columns = await getTableColumns('empresa_historico');
    if (!columns.has('empresa_id') || !columns.has('descricao')) return;
    const payload: Record<string, unknown> = { empresa_id: empresaId, tipo, descricao, autor: autor || 'Sistema' };
    const entries = Object.entries(payload).filter(([k]) => columns.has(k));
    const cols = entries.map(([k]) => k);
    const vals = entries.map(([, v]) => v);
    await pool.query(`INSERT INTO empresa_historico (${cols.join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')})`, vals);
  } catch (err) {
    console.warn('[empresa_historico]', err instanceof Error ? err.message : err);
  }
}

function toNullableNumeric(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

type SocioInput = {
  nome?: string;
  cpf_cnpj?: string | null;
  qualificacao_socio?: string | null;
  percentual_capital?: number | string | null;
  representante_legal?: boolean | null;
  nome_representante?: string | null;
  qualificacao_representante?: string | null;
  data_entrada_sociedade?: string | null;
  pais?: string | null;
  rg?: string | null;
  rg_orgao_emissor?: string | null;
  rg_uf_emissao?: string | null;
  rg_data_emissao?: string | null;
  data_nascimento?: string | null;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  conjuge_nome?: string | null;
  conjuge_cpf?: string | null;
  conjuge_rg?: string | null;
  conjuge_data_nasc?: string | null;
  conjuge_profissao?: string | null;
  conjuge_email?: string | null;
  conjuge_telefone?: string | null;
  regime_bens?: string | null;
  pep?: boolean | null;
  ativo?: boolean | null;
  fonte_dados?: string | null;
  dados_extra?: Record<string, unknown> | string | null;
};


function normalizeSocioInput(input: any): SocioInput {
  const nome = String(input?.nome || input?.nome_socio || input?.nome_do_socio || '').trim();
  const cpfCnpj = input?.cpf_cnpj ?? input?.cpf ?? input?.documento ?? input?.cnpj_cpf_do_socio ?? input?.cnpj_cpf ?? null;
  const qualificacao = input?.qualificacao_socio ?? input?.descricao_qualificacao_socio ?? input?.qualificacao ?? input?.cargo ?? null;
  const representanteRaw = input?.representante_legal;
  const representanteLegal =
    representanteRaw === true ||
    representanteRaw === 1 ||
    representanteRaw === '1' ||
    String(representanteRaw || '').toLowerCase() === 'true' ||
    String(representanteRaw || '').toLowerCase() === 'sim' ||
    String(representanteRaw || '').toLowerCase() === 's';

  return {
    nome,
    cpf_cnpj: cpfCnpj ? String(cpfCnpj) : null,
    qualificacao_socio: qualificacao ? String(qualificacao) : null,
    percentual_capital: input?.percentual_capital ?? input?.percentual ?? null,
    representante_legal: representanteLegal,
    nome_representante: input?.nome_representante ?? input?.nome_do_representante ?? null,
    qualificacao_representante: input?.qualificacao_representante ?? input?.qualificacao_representante_legal ?? null,
    data_entrada_sociedade: input?.data_entrada_sociedade ?? input?.data_entrada ?? null,
    pais: input?.pais ?? null,
    rg: input?.rg ?? null,
    rg_orgao_emissor: input?.rg_orgao_emissor ?? input?.orgao_emissor ?? null,
    rg_uf_emissao: input?.rg_uf_emissao ?? null,
    rg_data_emissao: input?.rg_data_emissao ?? null,
    data_nascimento: input?.data_nascimento ?? input?.nascimento ?? null,
    nacionalidade: input?.nacionalidade ?? null,
    estado_civil: input?.estado_civil ?? null,
    profissao: input?.profissao ?? null,
    email: input?.email ?? null,
    telefone: input?.telefone ?? null,
    whatsapp: input?.whatsapp ?? null,
    cep: input?.cep ?? null,
    logradouro: input?.logradouro ?? null,
    numero: input?.numero ?? null,
    complemento: input?.complemento ?? null,
    bairro: input?.bairro ?? null,
    cidade: input?.cidade ?? null,
    uf: input?.uf ?? null,
    conjuge_nome: input?.conjuge_nome ?? null,
    conjuge_cpf: input?.conjuge_cpf ?? null,
    conjuge_rg: input?.conjuge_rg ?? null,
    conjuge_data_nasc: input?.conjuge_data_nasc ?? null,
    conjuge_profissao: input?.conjuge_profissao ?? null,
    conjuge_email: input?.conjuge_email ?? null,
    conjuge_telefone: input?.conjuge_telefone ?? null,
    regime_bens: input?.regime_bens ?? null,
    pep: input?.pep ?? false,
    ativo: input?.ativo ?? true,
    fonte_dados: input?.fonte_dados ?? input?.fonte ?? 'api_publica_cnpj',
    dados_extra: input?.dados_extra ?? input,
  };
}

const SOCIOS_BASE_COLUMNS = new Set([
  'empresa_id',
  'nome',
  'cpf_cnpj',
  'qualificacao_socio',
  'percentual_capital',
  'representante_legal',
  'nome_representante',
  'qualificacao_representante',
  'data_entrada_sociedade',
  'pais',
  'rg',
  'rg_orgao_emissor',
  'rg_uf_emissao',
  'rg_data_emissao',
  'data_nascimento',
  'nacionalidade',
  'estado_civil',
  'profissao',
  'email',
  'telefone',
  'whatsapp',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'conjuge_nome',
  'conjuge_cpf',
  'conjuge_rg',
  'conjuge_data_nasc',
  'conjuge_profissao',
  'conjuge_email',
  'conjuge_telefone',
  'regime_bens',
  'pep',
  'ativo',
  'fonte_dados',
  'dados_extra',
]);

let sociosSchemaReady = false;
let sociosColumnsCache: Set<string> | null = null;

async function ensureSociosEmpresaSchema(): Promise<Set<string>> {
  if (!sociosSchemaReady) {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.socios_empresa (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        cpf_cnpj TEXT,
        qualificacao_socio TEXT,
        percentual_capital NUMERIC(5,2),
        representante_legal BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON public.socios_empresa(empresa_id)');
    await pool.query(`ALTER TABLE public.socios_empresa
      ADD COLUMN IF NOT EXISTS nome_representante TEXT,
      ADD COLUMN IF NOT EXISTS qualificacao_representante TEXT,
      ADD COLUMN IF NOT EXISTS data_entrada_sociedade DATE,
      ADD COLUMN IF NOT EXISTS pais TEXT,
      ADD COLUMN IF NOT EXISTS rg TEXT,
      ADD COLUMN IF NOT EXISTS rg_orgao_emissor TEXT,
      ADD COLUMN IF NOT EXISTS rg_uf_emissao CHAR(2),
      ADD COLUMN IF NOT EXISTS rg_data_emissao DATE,
      ADD COLUMN IF NOT EXISTS data_nascimento DATE,
      ADD COLUMN IF NOT EXISTS nacionalidade TEXT,
      ADD COLUMN IF NOT EXISTS estado_civil TEXT,
      ADD COLUMN IF NOT EXISTS profissao TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS telefone TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp TEXT,
      ADD COLUMN IF NOT EXISTS cep TEXT,
      ADD COLUMN IF NOT EXISTS logradouro TEXT,
      ADD COLUMN IF NOT EXISTS numero TEXT,
      ADD COLUMN IF NOT EXISTS complemento TEXT,
      ADD COLUMN IF NOT EXISTS bairro TEXT,
      ADD COLUMN IF NOT EXISTS cidade TEXT,
      ADD COLUMN IF NOT EXISTS uf CHAR(2),
      ADD COLUMN IF NOT EXISTS conjuge_nome TEXT,
      ADD COLUMN IF NOT EXISTS conjuge_cpf TEXT,
      ADD COLUMN IF NOT EXISTS conjuge_rg TEXT,
      ADD COLUMN IF NOT EXISTS conjuge_data_nasc DATE,
      ADD COLUMN IF NOT EXISTS conjuge_profissao TEXT,
      ADD COLUMN IF NOT EXISTS conjuge_email TEXT,
      ADD COLUMN IF NOT EXISTS conjuge_telefone TEXT,
      ADD COLUMN IF NOT EXISTS regime_bens TEXT,
      ADD COLUMN IF NOT EXISTS pep BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS fonte_dados TEXT,
      ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf ON public.socios_empresa(cpf_cnpj)');
    sociosSchemaReady = true;
  }

  if (!sociosColumnsCache) {
    const { rows } = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'socios_empresa'`
    );
    sociosColumnsCache = new Set(rows.map((r: { column_name: string }) => r.column_name));
  }

  return sociosColumnsCache;
}


function sociosPendenciasContrato(s: any): string[] {
  const pendencias: string[] = [];
  const doc = String(s?.cpf_cnpj || '').replace(/\D/g, '');
  if (!s?.nome) pendencias.push('Nome do sócio obrigatório');
  if (doc.length !== 11 && doc.length !== 14) pendencias.push('CPF/CNPJ completo do sócio obrigatório');
  if (!s?.qualificacao_socio) pendencias.push('Qualificação societária obrigatória');
  if (!s?.estado_civil) pendencias.push('Estado civil obrigatório para contratos');
  if (!s?.profissao) pendencias.push('Profissão obrigatória para contratos');
  if (!s?.nacionalidade) pendencias.push('Nacionalidade obrigatória');
  if (!s?.rg) pendencias.push('RG/documento pessoal obrigatório');
  if (!s?.telefone && !s?.whatsapp) pendencias.push('Telefone/WhatsApp obrigatório');
  if (!s?.email) pendencias.push('E-mail obrigatório');
  if (!s?.cep || !s?.logradouro || !s?.cidade || !s?.uf) pendencias.push('Endereço residencial completo obrigatório');
  const estadoCivil = String(s?.estado_civil || '').toLowerCase();
  if (estadoCivil.includes('casad') || estadoCivil.includes('união') || estadoCivil.includes('uniao')) {
    if (!s?.conjuge_nome) pendencias.push('Nome do cônjuge obrigatório');
    const cpfConjuge = String(s?.conjuge_cpf || '').replace(/\D/g, '');
    if (cpfConjuge.length !== 11) pendencias.push('CPF do cônjuge obrigatório');
    if (!s?.regime_bens) pendencias.push('Regime de bens obrigatório');
  }
  return pendencias;
}

function enrichSocioRow(s: any) {
  const pendencias = sociosPendenciasContrato(s);
  return {
    ...s,
    pendencias_contrato: pendencias,
    cadastro_completo_contrato: pendencias.length === 0,
    origem_dados: s?.fonte_dados || 'manual/api_publica',
  };
}

function buildSocioPayload(empresaId: string, socio: SocioInput): Record<string, unknown> | null {
  const normalized = normalizeSocioInput(socio);
  const nome = normalized.nome?.trim();
  if (!nome) return null;
  return {
    empresa_id: empresaId,
    nome,
    cpf_cnpj: normalized.cpf_cnpj || null,
    qualificacao_socio: normalized.qualificacao_socio || null,
    percentual_capital: toNullableNumeric(normalized.percentual_capital),
    representante_legal: normalized.representante_legal ?? false,
    nome_representante: normalized.nome_representante || null,
    qualificacao_representante: normalized.qualificacao_representante || null,
    data_entrada_sociedade: normalized.data_entrada_sociedade || null,
    pais: normalized.pais || null,
    rg: normalized.rg || null,
    rg_orgao_emissor: normalized.rg_orgao_emissor || null,
    rg_uf_emissao: normalized.rg_uf_emissao || null,
    rg_data_emissao: normalized.rg_data_emissao || null,
    data_nascimento: normalized.data_nascimento || null,
    nacionalidade: normalized.nacionalidade || null,
    estado_civil: normalized.estado_civil || null,
    profissao: normalized.profissao || null,
    email: normalized.email || null,
    telefone: normalized.telefone || null,
    whatsapp: normalized.whatsapp || null,
    cep: normalized.cep || null,
    logradouro: normalized.logradouro || null,
    numero: normalized.numero || null,
    complemento: normalized.complemento || null,
    bairro: normalized.bairro || null,
    cidade: normalized.cidade || null,
    uf: normalized.uf || null,
    conjuge_nome: normalized.conjuge_nome || null,
    conjuge_cpf: normalized.conjuge_cpf || null,
    conjuge_rg: normalized.conjuge_rg || null,
    conjuge_data_nasc: normalized.conjuge_data_nasc || null,
    conjuge_profissao: normalized.conjuge_profissao || null,
    conjuge_email: normalized.conjuge_email || null,
    conjuge_telefone: normalized.conjuge_telefone || null,
    regime_bens: normalized.regime_bens || null,
    pep: normalized.pep ?? false,
    ativo: normalized.ativo ?? true,
    fonte_dados: normalized.fonte_dados || 'api_publica_cnpj',
    dados_extra: typeof normalized.dados_extra === 'string' ? normalized.dados_extra : JSON.stringify(normalized.dados_extra || {}),
  };
}

async function upsertSocioEmpresa(empresaId: string, socio: SocioInput) {
  const columns = await ensureSociosEmpresaSchema();
  const payload = buildSocioPayload(empresaId, socio);
  if (!payload) return null;
  const nome = String(payload.nome || '').trim();
  const documento = String(payload.cpf_cnpj || '').replace(/\D/g, '');
  const existing = documento
    ? await pool.query("SELECT * FROM public.socios_empresa WHERE empresa_id=$1 AND regexp_replace(COALESCE(cpf_cnpj,''), '\\D', '', 'g')=$2 LIMIT 1", [empresaId, documento])
    : await pool.query('SELECT * FROM public.socios_empresa WHERE empresa_id=$1 AND lower(nome)=lower($2) LIMIT 1', [empresaId, nome]);

  if (existing.rows.length === 0) return insertSocioEmpresa(empresaId, socio);

  const current = existing.rows[0];
  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'empresa_id') continue;
    if (!SOCIOS_BASE_COLUMNS.has(key) || !columns.has(key)) continue;
    // Campos importados por API atualizam apenas quando vierem preenchidos ou quando o campo atual estiver vazio.
    if (value !== null && value !== undefined && value !== '') updatePayload[key] = value;
    else if (current[key] === null || current[key] === undefined) updatePayload[key] = value;
  }
  const entries = Object.entries(updatePayload);
  if (!entries.length) return current;
  const sets = entries.map(([key], index) => `${key}=$${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(current.id, empresaId);
  const { rows } = await pool.query(
    `UPDATE public.socios_empresa SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${values.length - 1} AND empresa_id=$${values.length} RETURNING *`,
    values
  );
  return rows[0] || current;
}

async function insertSocioEmpresa(empresaId: string, socio: SocioInput) {
  const columns = await ensureSociosEmpresaSchema();
  const normalized = normalizeSocioInput(socio);
  const nome = normalized.nome?.trim();
  if (!nome) return null;

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    nome,
    cpf_cnpj: normalized.cpf_cnpj || null,
    qualificacao_socio: normalized.qualificacao_socio || null,
    percentual_capital: toNullableNumeric(normalized.percentual_capital),
    representante_legal: normalized.representante_legal ?? false,
    nome_representante: normalized.nome_representante || null,
    qualificacao_representante: normalized.qualificacao_representante || null,
    data_entrada_sociedade: normalized.data_entrada_sociedade || null,
    pais: normalized.pais || null,
    rg: normalized.rg || null,
    rg_orgao_emissor: normalized.rg_orgao_emissor || null,
    rg_uf_emissao: normalized.rg_uf_emissao || null,
    rg_data_emissao: normalized.rg_data_emissao || null,
    data_nascimento: normalized.data_nascimento || null,
    nacionalidade: normalized.nacionalidade || null,
    estado_civil: normalized.estado_civil || null,
    profissao: normalized.profissao || null,
    email: normalized.email || null,
    telefone: normalized.telefone || null,
    whatsapp: normalized.whatsapp || null,
    cep: normalized.cep || null,
    logradouro: normalized.logradouro || null,
    numero: normalized.numero || null,
    complemento: normalized.complemento || null,
    bairro: normalized.bairro || null,
    cidade: normalized.cidade || null,
    uf: normalized.uf || null,
    conjuge_nome: normalized.conjuge_nome || null,
    conjuge_cpf: normalized.conjuge_cpf || null,
    conjuge_rg: normalized.conjuge_rg || null,
    conjuge_data_nasc: normalized.conjuge_data_nasc || null,
    conjuge_profissao: normalized.conjuge_profissao || null,
    conjuge_email: normalized.conjuge_email || null,
    conjuge_telefone: normalized.conjuge_telefone || null,
    regime_bens: normalized.regime_bens || null,
    pep: normalized.pep ?? false,
    ativo: normalized.ativo ?? true,
    fonte_dados: normalized.fonte_dados || 'api_publica_cnpj',
    dados_extra: typeof normalized.dados_extra === 'string' ? normalized.dados_extra : JSON.stringify(normalized.dados_extra || {}),
  };

  const safeEntries = Object.entries(payload).filter(([key]) => SOCIOS_BASE_COLUMNS.has(key) && columns.has(key));
  const insertColumns = safeEntries.map(([key]) => key);
  const values = safeEntries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);

  const { rows } = await pool.query(
    `INSERT INTO public.socios_empresa (${insertColumns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING *`,
    values
  );
  return rows[0] || null;
}

function pgErrorDetails(err: unknown) {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const e = err as { message?: string; code?: string; detail?: string; constraint?: string; table?: string; column?: string };
  return {
    message: e.message,
    code: e.code,
    detail: e.detail,
    constraint: e.constraint,
    table: e.table,
    column: e.column,
  };
}

// ─── SOCIOS_EMPRESA ──────────────────────────────────────────────────────────

// GET /api/empresas/:id/socios
router.get('/:id/socios', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosEmpresaSchema();
    const { rows } = await pool.query(
      'SELECT * FROM socios_empresa WHERE empresa_id = $1 AND COALESCE(ativo, true) = true ORDER BY nome ASC',
      [req.params.id]
    );
    res.json(rows.map(enrichSocioRow));
  } catch (err) {
    console.error('[GET /api/empresas/:id/socios]', err);
    res.status(500).json({ error: 'Erro ao listar sócios' });
  }
});

// POST /api/empresas/:id/socios
router.post('/:id/socios', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    const inserted = await insertSocioEmpresa(req.params.id, req.body as SocioInput);
    if (!inserted) {
      res.status(400).json({ error: 'Nome do sócio é obrigatório' });
      return;
    }
    await registrarHistoricoEmpresa(req.params.id, 'socio_adicionado', `Sócio adicionado: ${inserted.nome}`, (req as any).colaborador?.nome || 'Sistema');
    res.status(201).json(inserted);
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao criar sócio', details: pgErrorDetails(err) });
  }
});

// POST /api/empresas/:id/socios/bulk
router.post('/:id/socios/bulk', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosEmpresaSchema();
    const { socios, replace } = req.body as { socios: SocioInput[]; replace?: boolean };
    if (!Array.isArray(socios) || socios.length === 0) {
      res.status(200).json({ inserted: 0, socios: [], warning: 'Nenhum sócio enviado para importação' });
      return;
    }

    // Não apagamos mais dados manuais sensíveis (estado civil, cônjuge, RG, endereço etc.)
    // durante sincronização pública. A importação faz merge/upsert e preserva campos preenchidos manualmente.

    const inserted = [];
    const failed: Array<{ nome?: string; error: unknown }> = [];
    const seen = new Set<string>();

    for (const rawSocio of socios) {
      const socio = normalizeSocioInput(rawSocio);
      const key = `${(socio.nome || '').trim().toLowerCase()}|${String(socio.cpf_cnpj || '').replace(/\D/g, '')}`;
      if (!socio.nome || seen.has(key)) continue;
      seen.add(key);
      try {
        const row = await upsertSocioEmpresa(req.params.id, socio);
        if (row) inserted.push(enrichSocioRow(row));
      } catch (err) {
        failed.push({ nome: socio?.nome, error: pgErrorDetails(err) });
        console.error('[POST /api/empresas/:id/socios/bulk] item', socio?.nome, pgErrorDetails(err));
      }
    }

    if (inserted.length > 0) {
      await registrarHistoricoEmpresa(req.params.id, 'socios_importados', `${inserted.length} sócio(s) sincronizado(s) com a Receita Federal.`, (req as any).colaborador?.nome || 'Sistema');
    }
    const status = failed.length > 0 ? 207 : 200;
    res.status(status).json({ inserted: inserted.length, socios: inserted, failed });
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios/bulk]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao importar sócios', details: pgErrorDetails(err) });
  }
});

// PUT /api/empresas/:id/socios/:sid
router.put('/:id/socios/:sid', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosEmpresaSchema();
    const payload = buildSocioPayload(req.params.id, req.body as SocioInput);
    if (!payload?.nome) { res.status(400).json({ error: 'Nome do sócio é obrigatório' }); return; }
    const columns = await ensureSociosEmpresaSchema();
    const entries = Object.entries(payload).filter(([key]) => key !== 'empresa_id' && SOCIOS_BASE_COLUMNS.has(key) && columns.has(key));
    const sets = entries.map(([key], index) => `${key}=$${index + 1}`);
    const values = entries.map(([, value]) => value);
    values.push(req.params.sid, req.params.id);
    const { rows } = await pool.query(
      `UPDATE public.socios_empresa
          SET ${sets.join(', ')}, updated_at=NOW()
        WHERE id=$${values.length - 1} AND empresa_id=$${values.length}
        RETURNING *`,
      values
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Sócio não encontrado' }); return; }
    await registrarHistoricoEmpresa(req.params.id, 'socio_atualizado', `Dados cadastrais do sócio ${payload.nome} atualizados.`, (req as any).colaborador?.nome || 'Sistema');
    res.json(enrichSocioRow(rows[0]));
  } catch (err) {
    console.error('[PUT /api/empresas/:id/socios/:sid]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao atualizar sócio', details: pgErrorDetails(err) });
  }
});

// DELETE /api/empresas/:id/socios/:sid
router.delete('/:id/socios/:sid', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await pool.query('DELETE FROM socios_empresa WHERE id=$1 AND empresa_id=$2', [req.params.sid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/empresas/:id/socios/:sid]', err);
    res.status(500).json({ error: 'Erro ao remover sócio' });
  }
});

// ─── DOCUMENTOS_EMPRESA (GED) ─────────────────────────────────────────────────

const TIPOS_VALIDOS_DOC = [
  'contrato_social','alteracao_contratual','estatuto','cartao_cnpj','nire',
  'balanco_patrimonial','dre','declaracao_faturamento','irpj','defis','ecf','extrato_bancario',
  'cnd_receita_inss','cndt_trabalhista','fgts','certidao_estadual','certidao_municipal',
  'rg_socio','cpf_socio','cnh_socio','certidao_casamento','certidao_nascimento',
  'comprovante_residencia_socio','irpf_socio','documento_bem_garantia',
  'score_serasa','score_boavista','restricoes_cnpj','restricoes_cpf_socio','outro',
];

// GET /api/empresas/:id/ged
router.get('/:id/ged', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    const { rows } = await pool.query(
      'SELECT * FROM documentos_empresa WHERE empresa_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/empresas/:id/ged]', err);
    res.status(500).json({ error: 'Erro ao listar documentos' });
  }
});

// POST /api/empresas/:id/ged
router.post('/:id/ged', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    const { nome_arquivo, tipo_documento, url_arquivo, tamanho_bytes, status_validacao, data_vencimento } = req.body;
    if (!nome_arquivo || !url_arquivo) {
      res.status(400).json({ error: 'nome_arquivo e url_arquivo são obrigatórios' });
      return;
    }
    const tipo = TIPOS_VALIDOS_DOC.includes(tipo_documento) ? tipo_documento : 'outro';
    const { rows } = await pool.query(
      `INSERT INTO documentos_empresa (empresa_id, nome_arquivo, tipo_documento, url_arquivo, tamanho_bytes, status_validacao, data_vencimento)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, nome_arquivo, tipo, url_arquivo, tamanho_bytes || null, status_validacao || 'em_analise', data_vencimento || null]
    );
    await registrarHistoricoEmpresa(req.params.id, 'documento_enviado', `Documento GED registrado: ${nome_arquivo}`, (req as any).colaborador?.nome || 'Sistema');
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/empresas/:id/ged]', err);
    res.status(500).json({ error: 'Erro ao registrar documento' });
  }
});

// PATCH /api/empresas/:id/ged/:did
router.patch('/:id/ged/:did', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    const { status_validacao, data_vencimento } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (status_validacao) { values.push(status_validacao); updates.push(`status_validacao = $${values.length}`); }
    if (data_vencimento !== undefined) { values.push(data_vencimento); updates.push(`data_vencimento = $${values.length}`); }
    if (updates.length === 0) { res.status(400).json({ error: 'Nenhum campo para atualizar' }); return; }
    values.push(req.params.did);
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE documentos_empresa SET ${updates.join(', ')} WHERE id=$${values.length - 1} AND empresa_id=$${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Documento não encontrado' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /api/empresas/:id/ged/:did]', err);
    res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
});

// DELETE /api/empresas/:id/ged/:did
router.delete('/:id/ged/:did', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await pool.query('DELETE FROM documentos_empresa WHERE id=$1 AND empresa_id=$2', [req.params.did, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/empresas/:id/ged/:did]', err);
    res.status(500).json({ error: 'Erro ao remover documento' });
  }
});


const CHECKLIST_BASE = [
  ['cadastral', 'cartao_cnpj', 'Cartão CNPJ', true],
  ['cadastral', 'contrato_social', 'Contrato Social', true],
  ['cadastral', 'alteracao_contratual', 'Alterações Contratuais', false],
  ['cadastral', 'nire', 'NIRE / Registro na Junta Comercial', false],
  ['financeiro', 'balanco_patrimonial', 'Balanço Patrimonial', true],
  ['financeiro', 'dre', 'DRE - Demonstração do Resultado do Exercício', true],
  ['financeiro', 'declaracao_faturamento', 'Declaração de faturamento dos últimos 12 meses', true],
  ['financeiro', 'extrato_bancario', 'Extratos bancários PJ dos últimos 3 a 6 meses', true],
  ['fiscal', 'irpj', 'IRPJ', false],
  ['fiscal', 'defis', 'DEFIS, se optante pelo Simples Nacional', false],
  ['fiscal', 'ecf', 'ECF, se Lucro Real/Presumido', false],
  ['regularidade', 'cnd_receita_inss', 'CND Receita Federal/INSS', true],
  ['regularidade', 'fgts', 'Certidão de Regularidade do FGTS', true],
  ['regularidade', 'cndt_trabalhista', 'CNDT Trabalhista', true],
  ['regularidade', 'certidao_estadual', 'Certidão estadual', false],
  ['regularidade', 'certidao_municipal', 'Certidão municipal', false],
  ['credito', 'score_serasa', 'Score CNPJ Serasa', false],
  ['credito', 'score_boavista', 'Score CNPJ Boa Vista', false],
  ['credito', 'restricoes_cnpj', 'Restrições no CNPJ', true],
] as const;

async function ensureChecklistSchema(): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.empresa_checklist_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    socio_id UUID NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    tipo_documento TEXT NOT NULL,
    nome TEXT NOT NULL,
    obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'pendente',
    origem TEXT NOT NULL DEFAULT 'automatico',
    observacao TEXT,
    arquivo_id UUID NULL,
    data_vencimento DATE NULL,
    criado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (empresa_id, socio_id, tipo_documento)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_empresa_checklist_empresa_id ON public.empresa_checklist_documentos(empresa_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_empresa_checklist_status ON public.empresa_checklist_documentos(status)');
}

async function inserirChecklistItem(args: { empresaId: string; socioId?: string | null; categoria: string; tipo: string; nome: string; obrigatorio: boolean; observacao?: string | null; criadoPor?: string | null }) {
  await pool.query(
    `INSERT INTO public.empresa_checklist_documentos
      (empresa_id, socio_id, categoria, tipo_documento, nome, obrigatorio, observacao, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (empresa_id, socio_id, tipo_documento) DO NOTHING`,
    [args.empresaId, args.socioId || null, args.categoria, args.tipo, args.nome, args.obrigatorio, args.observacao || null, args.criadoPor || null]
  );
}

router.post('/:id/checklist/gerar', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosEmpresaSchema();
    await ensureChecklistSchema();
    const colab = (req as any).colaborador || (req as any).user;
    let criadosAntes = 0;
    const before = await pool.query('SELECT COUNT(*)::int AS total FROM empresa_checklist_documentos WHERE empresa_id=$1', [req.params.id]);
    criadosAntes = before.rows[0]?.total || 0;

    for (const item of CHECKLIST_BASE) {
      await inserirChecklistItem({ empresaId: req.params.id, categoria: item[0], tipo: item[1], nome: item[2], obrigatorio: item[3], criadoPor: colab?.id || null });
    }

    const socios = await pool.query('SELECT id, nome, percentual_capital FROM socios_empresa WHERE empresa_id=$1 ORDER BY nome ASC', [req.params.id]);
    for (const socio of socios.rows) {
      await inserirChecklistItem({ empresaId: req.params.id, socioId: socio.id, categoria: 'socios', tipo: 'rg_socio', nome: `RG/CPF ou CNH - ${socio.nome}`, obrigatorio: true, criadoPor: colab?.id || null });
      await inserirChecklistItem({ empresaId: req.params.id, socioId: socio.id, categoria: 'socios', tipo: 'comprovante_residencia_socio', nome: `Comprovante de residência - ${socio.nome}`, obrigatorio: true, criadoPor: colab?.id || null });
      await inserirChecklistItem({ empresaId: req.params.id, socioId: socio.id, categoria: 'socios', tipo: 'certidao_casamento', nome: `Certidão de casamento/nascimento - ${socio.nome}`, obrigatorio: false, criadoPor: colab?.id || null });
      await inserirChecklistItem({ empresaId: req.params.id, socioId: socio.id, categoria: 'socios', tipo: 'irpf_socio', nome: `IRPF do sócio - ${socio.nome}`, obrigatorio: false, criadoPor: colab?.id || null });
      await inserirChecklistItem({ empresaId: req.params.id, socioId: socio.id, categoria: 'credito', tipo: 'restricoes_cpf_socio', nome: `Restrições CPF do sócio - ${socio.nome}`, obrigatorio: true, criadoPor: colab?.id || null });
      if (socio.percentual_capital === null || socio.percentual_capital === undefined) {
        await inserirChecklistItem({ empresaId: req.params.id, socioId: socio.id, categoria: 'socios', tipo: 'percentual_participacao', nome: `Preencher percentual de participação - ${socio.nome}`, obrigatorio: true, observacao: 'A consulta automática normalmente não retorna o percentual de participação.', criadoPor: colab?.id || null });
      }
    }

    const after = await pool.query('SELECT COUNT(*)::int AS total FROM empresa_checklist_documentos WHERE empresa_id=$1', [req.params.id]);
    const total = after.rows[0]?.total || 0;
    const criados = Math.max(0, total - criadosAntes);
    await registrarHistoricoEmpresa(req.params.id, 'checklist_documentos_criado', `${criados} pendência(s)/checklist(s) criada(s) automaticamente para análise de crédito.`, colab?.nome || 'Sistema');
    res.status(201).json({ success: true, criados, total });
  } catch (err) {
    console.error('[POST /api/empresas/:id/checklist/gerar]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao gerar checklist', details: pgErrorDetails(err) });
  }
});

router.get('/:id/checklist', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureChecklistSchema();
    const { rows } = await pool.query('SELECT * FROM empresa_checklist_documentos WHERE empresa_id=$1 ORDER BY categoria, created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/empresas/:id/checklist]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao listar checklist' });
  }
});

export default router;
