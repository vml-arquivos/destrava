import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";

let _pool: Pool | null = null;

export function setAuditoriaPool(pool: Pool) {
  _pool = pool;
}

export interface AuditoriaPayload {
  acao: string;
  entidade?: string;
  entidade_id?: number | null;
  dados_antes?: Record<string, unknown> | null;
  dados_depois?: Record<string, unknown> | null;
}

/**
 * Registra uma ação de auditoria no banco de dados.
 * Falha silenciosamente para não interromper o fluxo principal.
 */
export async function registrarAuditoria(
  req: Request,
  payload: AuditoriaPayload
): Promise<void> {
  if (!_pool) return;
  try {
    const usuario = (req as any).usuario;
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;

    await _pool.query(
      `INSERT INTO audit_logs
         (usuario_id, usuario_nome, usuario_cargo, acao, entidade, entidade_id,
          dados_antes, dados_depois, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        usuario?.id ?? null,
        usuario?.nome ?? null,
        usuario?.cargo ?? null,
        payload.acao,
        payload.entidade ?? null,
        payload.entidade_id ?? null,
        payload.dados_antes ? JSON.stringify(payload.dados_antes) : null,
        payload.dados_depois ? JSON.stringify(payload.dados_depois) : null,
        ip,
        userAgent,
      ]
    );
  } catch (err) {
    // Falha silenciosa — auditoria nunca deve quebrar a requisição principal
    console.error("[auditoria] Erro ao registrar log:", err);
  }
}

/**
 * GET /api/admin/audit-logs
 * Retorna os últimos logs de auditoria (somente administradores/diretores).
 */
export function rotaAuditLogs(pool: Pool) {
  return async (req: Request, res: Response) => {
    try {
      const limite = Math.min(Number(req.query.limite) || 100, 500);
      const pagina = Math.max(Number(req.query.pagina) || 1, 1);
      const offset = (pagina - 1) * limite;
      const entidade = req.query.entidade as string | undefined;
      const acao = req.query.acao as string | undefined;
      const usuario_id = req.query.usuario_id as string | undefined;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (entidade) { conditions.push(`entidade = $${idx++}`); params.push(entidade); }
      if (acao)     { conditions.push(`acao ILIKE $${idx++}`); params.push(`%${acao}%`); }
      if (usuario_id) { conditions.push(`usuario_id = $${idx++}`); params.push(Number(usuario_id)); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows, total] = await Promise.all([
        pool.query(
          `SELECT id, usuario_id, usuario_nome, usuario_cargo, acao, entidade, entidade_id,
                  dados_antes, dados_depois, ip, criado_em
           FROM audit_logs ${where}
           ORDER BY criado_em DESC
           LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limite, offset]
        ),
        pool.query(`SELECT COUNT(*) FROM audit_logs ${where}`, params),
      ]);

      res.json({
        logs: rows.rows,
        total: Number(total.rows[0].count),
        pagina,
        limite,
        paginas: Math.ceil(Number(total.rows[0].count) / limite),
      });
    } catch (err: any) {
      console.error("[GET /api/admin/audit-logs]", err);
      res.status(500).json({ error: err.message });
    }
  };
}
