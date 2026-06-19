import { Router, Request, Response } from "express";
import type { Pool } from "pg";

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "")
    .replace(/R\$/g, "")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep === -1) {
    const n = Number(raw.replace(/[^0-9-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  const decimals = raw.slice(lastSep + 1).replace(/\D/g, "");
  const intPart = raw.slice(0, lastSep).replace(/[^0-9-]/g, "");
  const n = Number(`${intPart}.${decimals}`);
  return Number.isFinite(n) ? n : 0;
}

async function getColumns(pool: Pool, tableName: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

function safeDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function normalizeServicos(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      descricao: String(item?.descricao || "").trim(),
      quantidade: Math.max(1, Number(item?.quantidade) || 1),
      valor_unitario: parseMoney(item?.valor_unitario),
    }))
    .filter((item) => item.descricao);
}

function normalizeAssinaturas(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((a) => ({
    tipo: String(a?.tipo || "assinatura").trim() || "assinatura",
    nome: String(a?.nome || "").trim(),
    cargo: String(a?.cargo || "").trim(),
    documento: String(a?.documento || "").trim(),
  }));
}

export default function createOrcamentosOperacoesRouter(pool: Pool) {
  const router = Router();

  router.put("/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID do orçamento é obrigatório" });

    try {
      const columns = await getColumns(pool, "orcamentos_timbrados");
      const atual = await pool.query(
        `SELECT id, status FROM public.orcamentos_timbrados WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (!atual.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });

      const body = req.body || {};
      const servicos = normalizeServicos(body.itens);
      const valorTotal = servicos.length
        ? servicos.reduce((acc, item) => acc + item.quantidade * item.valor_unitario, 0)
        : parseMoney(body.valor_total);
      const assinaturas = normalizeAssinaturas(body.assinaturas);

      const payload: Record<string, unknown> = {
        tipo_cliente: body.tipo_cliente || "empresa",
        empresa_id: body.empresa_id || null,
        cliente_pf_id: body.cliente_pf_id || null,
        cliente_nome: body.cliente_nome || null,
        cliente_documento: body.cliente_documento || null,
        cliente_email: body.cliente_email || null,
        cliente_telefone: body.cliente_telefone || null,
        marca: body.marca || "destrava",
        titulo: body.titulo || "Orçamento de Serviços",
        descricao: body.descricao || null,
        conteudo: body.conteudo || "",
        valor_total: valorTotal,
        validade_dias: Number(body.validade_dias) || 30,
        validade_ate: safeDate(body.validade_ate),
        assinaturas: JSON.stringify(assinaturas),
        payload: JSON.stringify({ ...(body.payload || {}), editado_pelo_painel: true }),
      };

      if (columns.has("itens")) payload.itens = JSON.stringify(servicos);

      // Ao editar um orçamento já finalizado, volta para rascunho para forçar nova finalização/PDF atualizado.
      if (atual.rows[0]?.status === "finalizado") {
        payload.status = "rascunho";
        if (columns.has("finalizado_em")) payload.finalizado_em = null;
      }

      const entries = Object.entries(payload).filter(([key]) => columns.has(key));
      if (!entries.length) return res.status(400).json({ error: "Nenhum campo válido para atualizar" });

      const sets = entries.map(([key], idx) => `${key} = $${idx + 1}`);
      if (columns.has("atualizado_em")) sets.push(`atualizado_em = NOW()`);
      const values = entries.map(([, value]) => value);
      values.push(id);

      const result = await pool.query(
        `UPDATE public.orcamentos_timbrados
            SET ${sets.join(", ")}
          WHERE id = $${values.length}
          RETURNING *`,
        values,
      );

      const row = result.rows[0];
      if (row?.itens && typeof row.itens === "string") {
        try { row.itens = JSON.parse(row.itens); } catch { /* mantém */ }
      }
      res.json(row);
    } catch (err: any) {
      console.error("[orcamentos][PUT]", err);
      res.status(500).json({ error: err?.message || "Erro ao atualizar orçamento" });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID do orçamento é obrigatório" });

    try {
      const result = await pool.query(
        `DELETE FROM public.orcamentos_timbrados WHERE id = $1 RETURNING id, numero`,
        [id],
      );
      if (!result.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      res.json({ ok: true, excluido: result.rows[0] });
    } catch (err: any) {
      console.error("[orcamentos][DELETE]", err);
      res.status(500).json({ error: err?.message || "Erro ao excluir orçamento" });
    }
  });

  return router;
}
