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

type SocioInput = {
  nome?: string;
  cpf_cnpj?: string | null;
  qualificacao_socio?: string | null;
  percentual_capital?: number | string | null;
  representante_legal?: boolean | null;
};

const SOCIOS_BASE_COLUMNS = new Set([
  'empresa_id',
  'nome',
  'cpf_cnpj',
  'qualificacao_socio',
  'percentual_capital',
  'representante_legal',
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

async function insertSocioEmpresa(empresaId: string, socio: SocioInput) {
  const columns = await ensureSociosEmpresaSchema();
  const nome = socio.nome?.trim();
  if (!nome) return null;

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    nome,
    cpf_cnpj: socio.cpf_cnpj || null,
    qualificacao_socio: socio.qualificacao_socio || null,
    percentual_capital: socio.percentual_capital === '' || socio.percentual_capital == null ? null : Number(socio.percentual_capital),
    representante_legal: socio.representante_legal ?? false,
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
    await ensureSociosEmpresaSchema();
    const { rows } = await pool.query(
      'SELECT * FROM socios_empresa WHERE empresa_id = $1 ORDER BY nome ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/empresas/:id/socios]', err);
    res.status(500).json({ error: 'Erro ao listar sócios' });
  }
});

// POST /api/empresas/:id/socios
router.post('/:id/socios', auth, async (req: Request, res: Response) => {
  try {
    const inserted = await insertSocioEmpresa(req.params.id, req.body as SocioInput);
    if (!inserted) {
      res.status(400).json({ error: 'Nome do sócio é obrigatório' });
      return;
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao criar sócio', details: pgErrorDetails(err) });
  }
});

// POST /api/empresas/:id/socios/bulk
router.post('/:id/socios/bulk', auth, async (req: Request, res: Response) => {
  try {
    const { socios } = req.body as { socios: SocioInput[] };
    if (!Array.isArray(socios) || socios.length === 0) {
      res.status(200).json({ inserted: 0, socios: [], warning: 'Nenhum sócio enviado para importação' });
      return;
    }

    const inserted = [];
    const failed: Array<{ nome?: string; error: unknown }> = [];

    for (const socio of socios) {
      try {
        const row = await insertSocioEmpresa(req.params.id, socio);
        if (row) inserted.push(row);
      } catch (err) {
        failed.push({ nome: socio?.nome, error: pgErrorDetails(err) });
        console.error('[POST /api/empresas/:id/socios/bulk] item', socio?.nome, pgErrorDetails(err));
      }
    }

    // Não quebrar o cadastro principal da empresa se algum sócio falhar.
    // Retorna 207 quando houve falha parcial e 201 quando tudo foi importado.
    const status = failed.length > 0 ? 207 : 201;
    res.status(status).json({ inserted: inserted.length, socios: inserted, failed });
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios/bulk]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao importar sócios', details: pgErrorDetails(err) });
  }
});

// PUT /api/empresas/:id/socios/:sid
router.put('/:id/socios/:sid', auth, async (req: Request, res: Response) => {
  try {
    await ensureSociosEmpresaSchema();
    const { nome, cpf_cnpj, qualificacao_socio, percentual_capital, representante_legal } = req.body;
    if (!nome?.trim()) { res.status(400).json({ error: 'Nome do sócio é obrigatório' }); return; }
    const { rows } = await pool.query(
      `UPDATE public.socios_empresa
          SET nome=$1,
              cpf_cnpj=$2,
              qualificacao_socio=$3,
              percentual_capital=$4,
              representante_legal=$5,
              updated_at=NOW()
        WHERE id=$6 AND empresa_id=$7
        RETURNING *`,
      [nome.trim(), cpf_cnpj || null, qualificacao_socio || null, percentual_capital || null, representante_legal ?? false, req.params.sid, req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Sócio não encontrado' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /api/empresas/:id/socios/:sid]', pgErrorDetails(err));
    res.status(500).json({ error: 'Erro ao atualizar sócio', details: pgErrorDetails(err) });
  }
});

// DELETE /api/empresas/:id/socios/:sid
router.delete('/:id/socios/:sid', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM socios_empresa WHERE id=$1 AND empresa_id=$2', [req.params.sid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/empresas/:id/socios/:sid]', err);
    res.status(500).json({ error: 'Erro ao remover sócio' });
  }
});

// ─── DOCUMENTOS_EMPRESA (GED) ─────────────────────────────────────────────────

const TIPOS_VALIDOS_DOC = ['contrato_social', 'alteracao_contratual', 'cartao_cnpj', 'cnh_socio', 'comprovante_residencia', 'faturamento', 'imposto_renda', 'outro'];

// GET /api/empresas/:id/ged
router.get('/:id/ged', auth, async (req: Request, res: Response) => {
  try {
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
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/empresas/:id/ged]', err);
    res.status(500).json({ error: 'Erro ao registrar documento' });
  }
});

// PATCH /api/empresas/:id/ged/:did
router.patch('/:id/ged/:did', auth, async (req: Request, res: Response) => {
  try {
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
    await pool.query('DELETE FROM documentos_empresa WHERE id=$1 AND empresa_id=$2', [req.params.did, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/empresas/:id/ged/:did]', err);
    res.status(500).json({ error: 'Erro ao remover documento' });
  }
});

export default router;
