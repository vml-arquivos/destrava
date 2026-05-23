import { Router, Request, Response } from 'express';
import pkg from 'pg';
import { auth } from '../middleware/auth.ts';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

// ─── SOCIOS_EMPRESA ──────────────────────────────────────────────────────────

// GET /api/empresas/:id/socios
router.get('/:id/socios', auth, async (req: Request, res: Response) => {
  try {
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
    const { nome, cpf_cnpj, qualificacao_socio, percentual_capital, representante_legal } = req.body;
    if (!nome || !nome.trim()) {
      res.status(400).json({ error: 'Nome do sócio é obrigatório' });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO socios_empresa (empresa_id, nome, cpf_cnpj, qualificacao_socio, percentual_capital, representante_legal)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, nome.trim(), cpf_cnpj || null, qualificacao_socio || null, percentual_capital || null, representante_legal ?? false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios]', err);
    res.status(500).json({ error: 'Erro ao criar sócio' });
  }
});

// POST /api/empresas/:id/socios/bulk
router.post('/:id/socios/bulk', auth, async (req: Request, res: Response) => {
  try {
    const { socios } = req.body as {
      socios: Array<{
        nome: string;
        cpf_cnpj?: string;
        qualificacao_socio?: string;
        percentual_capital?: number;
        representante_legal?: boolean;
      }>;
    };
    if (!Array.isArray(socios) || socios.length === 0) {
      res.status(400).json({ error: 'Lista de sócios inválida' });
      return;
    }
    const inserted = [];
    for (const s of socios) {
      if (!s.nome?.trim()) continue;
      const { rows } = await pool.query(
        `INSERT INTO socios_empresa (empresa_id, nome, cpf_cnpj, qualificacao_socio, percentual_capital, representante_legal)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, s.nome.trim(), s.cpf_cnpj || null, s.qualificacao_socio || null, s.percentual_capital || null, s.representante_legal ?? false]
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    res.status(201).json({ inserted: inserted.length, socios: inserted });
  } catch (err) {
    console.error('[POST /api/empresas/:id/socios/bulk]', err);
    res.status(500).json({ error: 'Erro ao importar sócios' });
  }
});

// PUT /api/empresas/:id/socios/:sid
router.put('/:id/socios/:sid', auth, async (req: Request, res: Response) => {
  try {
    const { nome, cpf_cnpj, qualificacao_socio, percentual_capital, representante_legal } = req.body;
    const { rows } = await pool.query(
      `UPDATE socios_empresa SET nome=$1, cpf_cnpj=$2, qualificacao_socio=$3, percentual_capital=$4, representante_legal=$5
       WHERE id=$6 AND empresa_id=$7 RETURNING *`,
      [nome, cpf_cnpj || null, qualificacao_socio || null, percentual_capital || null, representante_legal ?? false, req.params.sid, req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Sócio não encontrado' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /api/empresas/:id/socios/:sid]', err);
    res.status(500).json({ error: 'Erro ao atualizar sócio' });
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
