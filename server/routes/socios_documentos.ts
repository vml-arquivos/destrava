import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pkg from 'pg';
import { auth } from '../middleware/auth';
import { consultarCPFHub, validarCPF as validarCPFHub } from '../services/cpfhub';
import { consultarCPFCNPJ } from '../services/cpfcnpj';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

const uploadContratoSocial = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas PDF é permitido para contrato social'));
  },
});

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDateForPg(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return null;

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    const y = Number(br[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1800) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1800) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

function validarCpf(cpfInput: unknown): boolean {
  const cpf = onlyDigits(cpfInput);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, factor: number) => {
    let total = 0;
    for (const digit of base) total += Number(digit) * factor--;
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function validarRegimeBens(value: unknown): boolean {
  if (!value) return true;
  return ['comunhao_universal', 'comunhao_parcial', 'separacao_bens', 'participacao_aquestos', 'separacao_obrigatoria', 'outro'].includes(String(value));
}


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
    data_entrada_sociedade: normalizeDateForPg(input?.data_entrada_sociedade ?? input?.data_entrada),
    pais: input?.pais ?? null,
    rg: input?.rg ?? null,
    rg_orgao_emissor: input?.rg_orgao_emissor ?? input?.orgao_emissor ?? null,
    rg_uf_emissao: input?.rg_uf_emissao ?? null,
    rg_data_emissao: normalizeDateForPg(input?.rg_data_emissao),
    data_nascimento: normalizeDateForPg(input?.data_nascimento ?? input?.nascimento),
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
    conjuge_data_nasc: normalizeDateForPg(input?.conjuge_data_nasc),
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
  'cpf_completo_manual',
  'cpf_validado',
  'cpf_fonte',
  'ultima_atualizacao_pessoal',
  'assinante_contrato',
  'pendencias_contrato',
  'cadastro_completo_contrato',
  'dados_extra',
  'genero',
  'cpfhub_consultado_at',
  'cpfhub_status',
  'cpfcnpj_consultado_at',
  'cpfcnpj_status',
  'cpfcnpj_fonte',
  'cpfcnpj_payload_resumo',
]);

const SOCIOS_MANUAL_PROTECTED_COLUMNS = new Set([
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
  'cpf_completo_manual',
  'cpf_validado',
  'cpf_fonte',
  'ultima_atualizacao_pessoal',
]);

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}


let sociosSchemaReady = false;
let sociosColumnsCache: Set<string> | null = null;

async function ensureSociosEmpresaSchema(): Promise<Set<string>> {
  if (sociosColumnsCache) return sociosColumnsCache;

  // AUTO-CREATE idempotente: cria a tabela/colunas automaticamente se não existirem,
  // sem depender de variável de ambiente. Isso evita que a sincronização com a Receita
  // e o cadastro de sócios quebrem em qualquer ambiente onde a migration manual não
  // tenha sido executada (deploy novo, restore de schema, etc).
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
    ADD COLUMN IF NOT EXISTS cpf_completo_manual VARCHAR(14),
    ADD COLUMN IF NOT EXISTS cpf_validado BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cpf_fonte VARCHAR(50) DEFAULT 'opencnpj',
    ADD COLUMN IF NOT EXISTS ultima_atualizacao_pessoal TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS assinante_contrato BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS pendencias_contrato TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS cadastro_completo_contrato BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cpfhub_consultado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cpfhub_status TEXT,
    ADD COLUMN IF NOT EXISTS cpfcnpj_consultado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cpfcnpj_status TEXT,
    ADD COLUMN IF NOT EXISTS cpfcnpj_fonte TEXT,
    ADD COLUMN IF NOT EXISTS cpfcnpj_payload_resumo JSONB DEFAULT '{}'::jsonb`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf ON public.socios_empresa(cpf_cnpj)');

  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'socios_empresa'`
  );
  sociosColumnsCache = new Set(rows.map((r: { column_name: string }) => r.column_name));
  sociosSchemaReady = true;
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

  const docDigits = onlyDigits(normalized.cpf_cnpj);
  if (docDigits.length === 11 && String(normalized.fonte_dados || '').toLowerCase().includes('cpfcnpj')) {
    payload.cpf_cnpj = docDigits;
    payload.cpf_completo_manual = docDigits;
    payload.cpf_validado = true;
    payload.cpf_fonte = 'cpfcnpj';
    payload.cpfcnpj_status = 'success';
    payload.cpfcnpj_fonte = 'cpfcnpj';
    payload.cpfcnpj_consultado_at = new Date();
    payload.ultima_atualizacao_pessoal = new Date();
  }

  return payload;
}

async function upsertSocioEmpresa(empresaId: string, socio: SocioInput) {
  const columns = await ensureSociosEmpresaSchema();
  const payload = buildSocioPayload(empresaId, socio);
  if (!payload) return null;
  const nome = String(payload.nome || '').trim();
  const documento = String(payload.cpf_cnpj || '').replace(/\D/g, '');
  const existing = documento
    ? await pool.query(
        `SELECT * FROM public.socios_empresa
         WHERE empresa_id=$1
           AND (regexp_replace(COALESCE(cpf_cnpj,''), '\\D', '', 'g')=$2 OR lower(nome)=lower($3))
         ORDER BY CASE WHEN regexp_replace(COALESCE(cpf_cnpj,''), '\\D', '', 'g')=$2 THEN 0 ELSE 1 END
         LIMIT 1`,
        [empresaId, documento, nome]
      )
    : await pool.query('SELECT * FROM public.socios_empresa WHERE empresa_id=$1 AND lower(nome)=lower($2) LIMIT 1', [empresaId, nome]);

  if (existing.rows.length === 0) return insertSocioEmpresa(empresaId, socio);

  const current = existing.rows[0];
  const updatePayload: Record<string, unknown> = {};
  const source = String(payload.fonte_dados || '').toLowerCase();
  const isPublicSync = source.includes('api') || source.includes('cnpj') || source.includes('opencnpj') || source.includes('brasilapi');
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'empresa_id') continue;
    if (!SOCIOS_BASE_COLUMNS.has(key) || !columns.has(key)) continue;
    if (SOCIOS_MANUAL_PROTECTED_COLUMNS.has(key) && hasValue(current[key]) && isPublicSync) continue;
    if (hasValue(value)) updatePayload[key] = value;
    else if (!hasValue(current[key])) updatePayload[key] = value;
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
  const payload = buildSocioPayload(empresaId, socio);
  if (!payload?.nome) return null;

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


function mergeJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function cpfHubStatusFromError(error?: string): string {
  const text = String(error || '').toLowerCase();
  if (text.includes('não configurada') || text.includes('nao configurada')) return 'cpfhub_sem_chave';
  if (text.includes('não encontrado') || text.includes('nao encontrado') || text.includes('404')) return 'cpfhub_nao_encontrado';
  if (text.includes('rate') || text.includes('limite') || text.includes('429')) return 'cpfhub_limite';
  if (text.includes('timeout')) return 'cpfhub_timeout';
  return 'cpfhub_erro';
}

async function atualizarStatusSocioEmpresa(empresaId: string, socioId: string, updates: Record<string, unknown>) {
  const columns = await ensureSociosEmpresaSchema();
  const entries = Object.entries(updates).filter(([key]) => SOCIOS_BASE_COLUMNS.has(key) && columns.has(key));
  if (!entries.length) {
    const current = await pool.query('SELECT * FROM public.socios_empresa WHERE id=$1 AND empresa_id=$2 LIMIT 1', [socioId, empresaId]);
    return current.rows[0] || null;
  }
  const sets = entries.map(([key], index) => `${key}=$${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(socioId, empresaId);
  const { rows } = await pool.query(
    `UPDATE public.socios_empresa
        SET ${sets.join(', ')}, updated_at=NOW()
      WHERE id=$${values.length - 1} AND empresa_id=$${values.length}
      RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function enriquecerSocioComCPFHubAutomatico(empresaId: string, socioRow: any) {
  const cpf = onlyDigits(socioRow?.cpf_completo_manual || socioRow?.cpf_cnpj);
  if (cpf.length !== 11 || !validarCPFHub(cpf)) {
    return await atualizarStatusSocioEmpresa(empresaId, socioRow.id, {
      cpfhub_status: 'cpf_completo_ausente',
      ultima_atualizacao_pessoal: new Date(),
    }) || socioRow;
  }

  const result = await consultarCPFHub(cpf);
  if (!result.success || !result.data) {
    return await atualizarStatusSocioEmpresa(empresaId, socioRow.id, {
      cpfhub_status: cpfHubStatusFromError(result.error),
      cpfhub_consultado_at: new Date(),
      ultima_atualizacao_pessoal: new Date(),
    }) || socioRow;
  }

  const data = result.data;
  const updates: Record<string, unknown> = {
    cpf_cnpj: cpf,
    cpf_completo_manual: hasValue(socioRow?.cpf_completo_manual) ? socioRow.cpf_completo_manual : cpf,
    cpf_validado: true,
    cpf_fonte: hasValue(socioRow?.cpf_fonte) && socioRow.cpf_fonte !== 'opencnpj' ? socioRow.cpf_fonte : 'cpfhub',
    ultima_atualizacao_pessoal: new Date(),
    cpfhub_consultado_at: new Date(),
    cpfhub_status: 'success',
  };

  // CPFHub não descobre CPF. Ele só enriquece dados quando já existe CPF completo.
  // Ao receber CPF manual, sincronizamos nascimento/gênero imediatamente e atualizamos
  // os campos mesmo quando havia valor anterior, porque CPFHub passa a ser a fonte validada.
  if (data.nome && !hasValue(socioRow?.nome)) updates.nome = data.nome;
  if (data.data_nascimento) updates.data_nascimento = normalizeDateForPg(data.data_nascimento);
  if (data.genero) updates.genero = data.genero;

  updates.dados_extra = JSON.stringify({
    ...mergeJsonObject(socioRow?.dados_extra),
    cpfhub: {
      cpf: data.cpf,
      nome: data.nome,
      nome_maiusculo: data.nome_maiusculo,
      genero: data.genero,
      data_nascimento: data.data_nascimento,
      consultado_em: new Date().toISOString(),
      raw: data.raw,
    },
  });

  return await atualizarStatusSocioEmpresa(empresaId, socioRow.id, updates) || socioRow;
}

function normalizarNomeParaMatch(nome: unknown): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function obterCnpjEmpresa(empresaId: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT cnpj FROM public.empresas WHERE id=$1 LIMIT 1', [empresaId]);
  const cnpj = onlyDigits(rows[0]?.cnpj);
  return cnpj.length === 14 ? cnpj : null;
}

async function empresaPrecisaCpfCompleto(empresaId: string): Promise<boolean> {
  const total = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.socios_empresa WHERE empresa_id=$1 AND COALESCE(ativo, true)=true`,
    [empresaId]
  );
  if (Number(total.rows[0]?.total || 0) === 0) return true;

  const { rows } = await pool.query(
    `SELECT 1 FROM public.socios_empresa
      WHERE empresa_id=$1
        AND COALESCE(ativo, true)=true
        AND LENGTH(regexp_replace(COALESCE(cpf_completo_manual, cpf_cnpj, ''), '\\D', '', 'g')) <> 11
      LIMIT 1`,
    [empresaId]
  );
  return rows.length > 0;
}

async function consultarEAplicarCPFCNPJ(empresaId: string, cnpjInput?: unknown, force = false) {
  const cnpj = onlyDigits(cnpjInput) || (await obterCnpjEmpresa(empresaId)) || '';
  if (!cnpj || cnpj.length !== 14) {
    return { success: false, status: 'cnpj_ausente', socios: [], error: 'CNPJ ausente para consulta CPF.CNPJ.' };
  }

  if (!force) {
    const precisa = await empresaPrecisaCpfCompleto(empresaId);
    if (!precisa) return { success: true, status: 'skipped_cpf_ja_existente', socios: [] };
  }

  const result = await consultarCPFCNPJ(cnpj);
  if (!result.success) {
    await pool.query(
      `UPDATE public.socios_empresa
          SET cpfcnpj_status=$1,
              cpfcnpj_consultado_at=NOW(),
              cpfcnpj_fonte='cpfcnpj',
              cpfcnpj_payload_resumo=$2,
              updated_at=NOW()
        WHERE empresa_id=$3 AND COALESCE(ativo, true)=true`,
      [String(result.error || 'erro').slice(0, 120), JSON.stringify(result.resumo || { error: result.error }), empresaId]
    ).catch(() => undefined);
    return { success: false, status: 'error', socios: [], error: result.error, resumo: result.resumo };
  }

  const aplicados = [] as any[];
  for (const socio of result.socios) {
    const row = await upsertSocioEmpresa(empresaId, {
      ...socio,
      fonte_dados: 'cpfcnpj',
      dados_extra: {
        ...socio.dados_extra,
        cpfcnpj: result.resumo,
      },
    });
    if (!row) continue;
    const enriched = await atualizarStatusSocioEmpresa(empresaId, row.id, {
      cpfcnpj_status: onlyDigits(socio.cpf_cnpj).length === 11 ? 'success' : 'documento_nao_revelado',
      cpfcnpj_fonte: 'cpfcnpj',
      cpfcnpj_consultado_at: new Date(),
      cpfcnpj_payload_resumo: JSON.stringify(result.resumo || {}),
      dados_extra: JSON.stringify({
        ...mergeJsonObject(row.dados_extra),
        cpfcnpj: {
          ...(result.resumo || {}),
          socio_match: socio.dados_extra,
        },
      }),
    }) || row;
    aplicados.push(enriched);
  }

  return { success: true, status: 'success', socios: aplicados, resumo: result.resumo };
}


async function ensureSociosConjugeSchema(): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.socios_conjuge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id UUID NOT NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    conjuge_nome VARCHAR(255),
    conjuge_cpf VARCHAR(14),
    regime_bens VARCHAR(100),
    data_casamento DATE,
    estado_civil VARCHAR(50),
    fonte VARCHAR(50) DEFAULT 'manual',
    criado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    atualizado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    data_insercao TIMESTAMPTZ DEFAULT NOW(),
    ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_socios_conjuge_socio_id ON public.socios_conjuge(socio_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_socios_conjuge_empresa_id ON public.socios_conjuge(empresa_id)');
}

async function ensureContratosSociaisSchema(): Promise<void> {
  const existing = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'empresas_contratos_sociais'`
  );
  if (existing.rows.length > 0) return;

  // AUTO-CREATE idempotente: cria a tabela automaticamente, sem depender de env.
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.empresas_contratos_sociais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome_arquivo VARCHAR(255) NOT NULL,
    caminho_arquivo VARCHAR(500) NOT NULL,
    url VARCHAR(500),
    tamanho_bytes INT,
    tipo_mime VARCHAR(50) DEFAULT 'application/pdf',
    data_assinatura DATE,
    numero_registro VARCHAR(50),
    data_registro DATE,
    numero_alteracoes INT DEFAULT 0,
    ultima_alteracao DATE,
    descricao TEXT,
    uploaded_by UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    data_upload TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_contratos_sociais_empresa_id ON public.empresas_contratos_sociais(empresa_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_contratos_sociais_data_upload ON public.empresas_contratos_sociais(data_upload)');
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
    const { socios, replace, cnpj, enriquecer_cpfcnpj, force_cpfcnpj, enriquecer_cpfhub } = req.body as {
      socios?: SocioInput[];
      replace?: boolean;
      cnpj?: string;
      enriquecer_cpfcnpj?: boolean;
      force_cpfcnpj?: boolean;
      enriquecer_cpfhub?: boolean;
    };

    // Não apagamos mais dados manuais sensíveis (estado civil, cônjuge, RG, endereço etc.)
    // durante sincronização pública. A importação faz merge/upsert e preserva campos preenchidos manualmente.

    const inserted = [];
    const failed: Array<{ nome?: string; error: unknown }> = [];
    const seen = new Set<string>();

    if (Array.isArray(socios)) {
      for (const rawSocio of socios) {
        const socio = normalizeSocioInput(rawSocio);
        const key = `${(socio.nome || '').trim().toLowerCase()}|${String(socio.cpf_cnpj || '').replace(/\D/g, '')}`;
        if (!socio.nome || seen.has(key)) continue;
        seen.add(key);
        try {
          const row = await upsertSocioEmpresa(req.params.id, socio);
          if (row) inserted.push(row);
        } catch (err) {
          failed.push({ nome: socio?.nome, error: pgErrorDetails(err) });
          console.error('[POST /api/empresas/:id/socios/bulk] item', socio?.nome, pgErrorDetails(err));
        }
      }
    }

    let cpfcnpjResult: any = null;
    // CPF.CNPJ fica DESLIGADO por padrão para evitar custo automático.
    // Só roda se o payload pedir explicitamente enriquecer_cpfcnpj=true E a env CPFCNPJ_ENABLED=true.
    // No fluxo atual do Destrava, usamos apenas BrasilAPI/OpenCNPJ + CPF manual + CPFHub.
    const cpfcnpjAutoEnabled = String(process.env.CPFCNPJ_ENABLED || '').toLowerCase() === 'true';
    if ((enriquecer_cpfcnpj === true) && cpfcnpjAutoEnabled) {
      cpfcnpjResult = await consultarEAplicarCPFCNPJ(req.params.id, cnpj, Boolean(force_cpfcnpj));
      if (Array.isArray(cpfcnpjResult?.socios)) {
        for (const row of cpfcnpjResult.socios) {
          if (row?.id && !inserted.some((s: any) => s.id === row.id)) inserted.push(row);
        }
      }
    }

    // CPFHub automático só roda se explicitamente solicitado. Sincronização Receita não pode
    // falhar por enriquecimento externo ou custo/timeout de terceiro.
    if (enriquecer_cpfhub === true) {
      const { rows: candidatosCpfHub } = await pool.query(
        `SELECT * FROM public.socios_empresa
          WHERE empresa_id=$1 AND COALESCE(ativo, true)=true
          ORDER BY nome ASC`,
        [req.params.id]
      );
      for (const row of candidatosCpfHub) {
        try {
          const enriched = await enriquecerSocioComCPFHubAutomatico(req.params.id, row);
          if (enriched?.id && !inserted.some((s: any) => s.id === enriched.id)) inserted.push(enriched);
        } catch (err) {
          failed.push({ nome: row?.nome, error: pgErrorDetails(err) });
          console.error('[CPFHub automatico socio]', row?.nome, pgErrorDetails(err));
        }
      }
    }

    const { rows: finalRows } = await pool.query(
      'SELECT * FROM public.socios_empresa WHERE empresa_id=$1 AND COALESCE(ativo, true)=true ORDER BY nome ASC',
      [req.params.id]
    );

    if (finalRows.length > 0) {
      const fonteExtra = cpfcnpjResult?.success ? ' e CPF.CNPJ' : '';
      await registrarHistoricoEmpresa(req.params.id, 'socios_importados', `${finalRows.length} sócio(s) sincronizado(s) com as fontes públicas de CNPJ${fonteExtra}.`, (req as any).colaborador?.nome || 'Sistema');
    }
    const status = failed.length > 0 ? 207 : 200;
    res.status(status).json({
      inserted: finalRows.length,
      socios: finalRows.map(enrichSocioRow),
      failed,
      cpfcnpj: cpfcnpjResult ? { success: cpfcnpjResult.success, status: cpfcnpjResult.status, error: cpfcnpjResult.error, socios: cpfcnpjResult.socios?.length || 0 } : null,
    });
  } catch (err) {
    // Não derrubar o fluxo de sincronização da empresa por falha no QSA.
    // Retorna 200 com erro detalhado para a tela seguir salvando os dados da Receita.
    console.error('[POST /api/empresas/:id/socios/bulk]', pgErrorDetails(err));
    res.status(200).json({
      inserted: 0,
      socios: [],
      failed: [{ error: pgErrorDetails(err) }],
      warning: 'Falha ao importar sócios. Dados cadastrais da empresa não foram revertidos.',
    });
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


// PUT /api/empresas/:id/socios/:sid/cpf-manual
router.put('/:id/socios/:sid/cpf-manual', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosEmpresaSchema();
    const cpf = onlyDigits(req.body?.cpf_completo);
    if (!validarCpf(cpf)) {
      res.status(400).json({ error: 'CPF inválido. Verifique os dígitos informados.' });
      return;
    }
    const validado = req.body?.validado !== false;
    const columns = await ensureSociosEmpresaSchema();
    const updates: Record<string, unknown> = {
      cpf_cnpj: cpf,
      cpf_completo_manual: cpf,
      cpf_validado: validado,
      cpf_fonte: 'manual',
      ultima_atualizacao_pessoal: new Date(),
    };
    const entries = Object.entries(updates).filter(([key]) => columns.has(key));
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
    const enriquecido = await enriquecerSocioComCPFHubAutomatico(req.params.id, rows[0]);
    await registrarHistoricoEmpresa(req.params.id, 'cpf_socio_atualizado', `CPF completo do sócio ${rows[0].nome} atualizado manualmente e enviado para enriquecimento CPFHub.`, (req as any).colaborador?.nome || 'Sistema');
    res.json(enrichSocioRow(enriquecido || rows[0]));
  } catch (err) {
    console.error('[PUT /api/empresas/:id/socios/:sid/cpf-manual]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao atualizar CPF manual', details: pgErrorDetails(err) });
  }
});



// POST /api/empresas/:id/socios/:sid/enriquecer-cpf
router.post('/:id/socios/:sid/enriquecer-cpf', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    const columns = await ensureSociosEmpresaSchema();
    const cpf = onlyDigits(req.body?.cpf || req.body?.cpf_completo);
    if (!validarCPFHub(cpf)) {
      res.status(400).json({ error: 'CPF inválido. Informe o CPF completo do sócio para consultar a API CPFHub.' });
      return;
    }

    const currentResult = await pool.query(
      'SELECT * FROM public.socios_empresa WHERE id=$1 AND empresa_id=$2 LIMIT 1',
      [req.params.sid, req.params.id]
    );
    if (currentResult.rows.length === 0) {
      res.status(404).json({ error: 'Sócio não encontrado' });
      return;
    }

    const result = await consultarCPFHub(cpf);
    if (!result.success || !result.data) {
      res.status(result.status && result.status >= 400 ? 502 : 400).json({ error: result.error || 'CPFHub não retornou dados para este CPF.' });
      return;
    }

    const data = result.data;
    const updates: Record<string, unknown> = {
      cpf_cnpj: cpf,
      cpf_completo_manual: cpf,
      cpf_validado: true,
      cpf_fonte: 'cpfhub',
      ultima_atualizacao_pessoal: new Date(),
      fonte_dados: 'cpfhub',
      cpfhub_consultado_at: new Date(),
      cpfhub_status: 'success',
    };

    if (data.nome && !hasValue(currentResult.rows[0].nome)) updates.nome = data.nome;
    if (data.data_nascimento) updates.data_nascimento = normalizeDateForPg(data.data_nascimento);
    if (data.genero && columns.has('genero')) updates.genero = data.genero;

    const currentExtra = currentResult.rows[0].dados_extra && typeof currentResult.rows[0].dados_extra === 'object'
      ? currentResult.rows[0].dados_extra
      : {};
    updates.dados_extra = JSON.stringify({
      ...currentExtra,
      cpfhub: {
        cpf: data.cpf,
        nome: data.nome,
        nome_maiusculo: data.nome_maiusculo,
        genero: data.genero,
        data_nascimento: data.data_nascimento,
        consultado_em: new Date().toISOString(),
        raw: data.raw,
      },
    });

    const entries = Object.entries(updates).filter(([key]) => SOCIOS_BASE_COLUMNS.has(key) && columns.has(key));
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

    await registrarHistoricoEmpresa(req.params.id, 'cpfhub_socio_consultado', `Dados CPFHub do sócio ${rows[0].nome} consultados e salvos.`, (req as any).colaborador?.nome || 'Sistema');
    res.json({ socio: enrichSocioRow(rows[0]), cpfhub: data });
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios/:sid/enriquecer-cpf]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao consultar CPFHub para o sócio', details: pgErrorDetails(err) });
  }
});

// GET /api/empresas/:id/socios/:sid/conjuge
router.get('/:id/socios/:sid/conjuge', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosConjugeSchema();
    const { rows } = await pool.query('SELECT * FROM public.socios_conjuge WHERE empresa_id=$1 AND socio_id=$2 ORDER BY created_at DESC', [req.params.id, req.params.sid]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/empresas/:id/socios/:sid/conjuge]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao listar cônjuge', details: pgErrorDetails(err) });
  }
});

// POST /api/empresas/:id/socios/:sid/conjuge
router.post('/:id/socios/:sid/conjuge', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosConjugeSchema();
    const cpf = req.body?.conjuge_cpf ? onlyDigits(req.body.conjuge_cpf) : null;
    if (cpf && !validarCpf(cpf)) { res.status(400).json({ error: 'CPF do cônjuge inválido' }); return; }
    if (!validarRegimeBens(req.body?.regime_bens)) { res.status(400).json({ error: 'Regime de bens inválido' }); return; }
    const colab = (req as any).colaborador || (req as any).user;
    const { rows } = await pool.query(
      `INSERT INTO public.socios_conjuge
        (empresa_id, socio_id, conjuge_nome, conjuge_cpf, regime_bens, data_casamento, estado_civil, fonte, criado_por, atualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$8)
       RETURNING *`,
      [req.params.id, req.params.sid, req.body?.conjuge_nome || null, cpf, req.body?.regime_bens || null, req.body?.data_casamento || null, req.body?.estado_civil || null, colab?.id || null]
    );
    await registrarHistoricoEmpresa(req.params.id, 'conjuge_socio_criado', 'Dados de cônjuge do sócio cadastrados manualmente.', colab?.nome || 'Sistema');
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios/:sid/conjuge]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao cadastrar cônjuge', details: pgErrorDetails(err) });
  }
});

// PUT /api/empresas/:id/socios/:sid/conjuge/:cid
router.put('/:id/socios/:sid/conjuge/:cid', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosConjugeSchema();
    const cpf = req.body?.conjuge_cpf ? onlyDigits(req.body.conjuge_cpf) : null;
    if (cpf && !validarCpf(cpf)) { res.status(400).json({ error: 'CPF do cônjuge inválido' }); return; }
    if (!validarRegimeBens(req.body?.regime_bens)) { res.status(400).json({ error: 'Regime de bens inválido' }); return; }
    const colab = (req as any).colaborador || (req as any).user;
    const { rows } = await pool.query(
      `UPDATE public.socios_conjuge
          SET conjuge_nome=$1, conjuge_cpf=$2, regime_bens=$3, data_casamento=$4,
              estado_civil=$5, atualizado_por=$6, ultima_atualizacao=NOW(), updated_at=NOW()
        WHERE id=$7 AND empresa_id=$8 AND socio_id=$9
        RETURNING *`,
      [req.body?.conjuge_nome || null, cpf, req.body?.regime_bens || null, req.body?.data_casamento || null, req.body?.estado_civil || null, colab?.id || null, req.params.cid, req.params.id, req.params.sid]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Cônjuge não encontrado' }); return; }
    await registrarHistoricoEmpresa(req.params.id, 'conjuge_socio_atualizado', 'Dados de cônjuge do sócio atualizados.', colab?.nome || 'Sistema');
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /api/empresas/:id/socios/:sid/conjuge/:cid]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao atualizar cônjuge', details: pgErrorDetails(err) });
  }
});

// DELETE /api/empresas/:id/socios/:sid/conjuge/:cid
router.delete('/:id/socios/:sid/conjuge/:cid', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureSociosConjugeSchema();
    await pool.query('DELETE FROM public.socios_conjuge WHERE id=$1 AND empresa_id=$2 AND socio_id=$3', [req.params.cid, req.params.id, req.params.sid]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/empresas/:id/socios/:sid/conjuge/:cid]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao remover cônjuge', details: pgErrorDetails(err) });
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


// ─── CONTRATO SOCIAL ────────────────────────────────────────────────────────
router.get('/:id/contrato-social', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureContratosSociaisSchema();
    const { rows } = await pool.query('SELECT * FROM public.empresas_contratos_sociais WHERE empresa_id=$1 ORDER BY data_upload DESC', [req.params.id]);
    res.json(rows);
  } catch (err: any) {
    console.error('[GET /api/empresas/:id/contrato-social]', pgErrorDetails(err));
    if (err?.code === '42P01') { res.json([]); return; }
    res.status(500).json({ error: 'Erro ao listar contratos sociais', details: pgErrorDetails(err) });
  }
});

router.post('/:id/contrato-social/upload', auth, uploadContratoSocial.single('file'), async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureContratosSociaisSchema();
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'Arquivo PDF é obrigatório' }); return; }
    if (file.mimetype !== 'application/pdf') { res.status(400).json({ error: 'Apenas PDF é permitido' }); return; }

    const dataDir = process.env.DATA_DIR || '/data';
    const uploadDir = path.join(dataDir, 'uploads', 'contratos-sociais', req.params.id);
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const safeName = path.basename(file.originalname || 'contrato_social.pdf').replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120);
    const fileName = `${Date.now()}_${crypto.randomUUID()}_${safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`}`;
    const filePath = path.join(uploadDir, fileName);
    await fs.promises.writeFile(filePath, file.buffer);
    const url = `/uploads/contratos-sociais/${req.params.id}/${fileName}`;
    const colab = (req as any).colaborador || (req as any).user;
    const { rows } = await pool.query(
      `INSERT INTO public.empresas_contratos_sociais
        (empresa_id, nome_arquivo, caminho_arquivo, url, tamanho_bytes, tipo_mime, data_assinatura, numero_registro, data_registro, numero_alteracoes, ultima_alteracao, descricao, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,'application/pdf',$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.params.id, file.originalname || fileName, filePath, url, file.size, req.body?.data_assinatura || null, req.body?.numero_registro || null, req.body?.data_registro || null, req.body?.numero_alteracoes || 0, req.body?.ultima_alteracao || null, req.body?.descricao || null, colab?.id || null]
    );
    await registrarHistoricoEmpresa(req.params.id, 'contrato_social_upload', `Contrato social enviado: ${file.originalname || fileName}`, colab?.nome || 'Sistema');
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/empresas/:id/contrato-social/upload]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao enviar contrato social', details: pgErrorDetails(err) });
  }
});

router.delete('/:id/contrato-social/:cid', auth, async (req: Request, res: Response) => {
  try {
    if (!(await requireEmpresaAccess(req, res))) return;
    await ensureContratosSociaisSchema();
    const { rows } = await pool.query('DELETE FROM public.empresas_contratos_sociais WHERE id=$1 AND empresa_id=$2 RETURNING caminho_arquivo', [req.params.cid, req.params.id]);
    const filePath = rows[0]?.caminho_arquivo;
    if (filePath && fs.existsSync(filePath)) await fs.promises.unlink(filePath).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/empresas/:id/contrato-social/:cid]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao remover contrato social', details: pgErrorDetails(err) });
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
