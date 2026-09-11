/**
 * automationEngine.ts
 *
 * Endpoints operacionais do Automation Engine: visibilidade do outbox de
 * eventos e retry manual (administradores), e a lista de alertas
 * (7d/3d/1d/hoje/atrasado) para o sino de notificações de qualquer
 * colaborador autenticado -- espelha o que o Nexus decidiu, calculado em
 * services/automation/alertJob.ts do lado do Nexus.
 */
import { Router, Request, Response } from "express";
import type { Pool } from "pg";
import { auth } from "../middleware/auth";
import { authorize } from "../middleware/authorize";
import { buscarEventoPorId } from "../services/automation/outboxRepository";
import { despacharAgora } from "../services/automation/dispatcher";

export default function createAutomationEngineRouter(pool: Pool) {
  const router = Router();

  router.get("/events", auth, authorize(["administrador"]), async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const limite = Math.min(Number(req.query.limit) || 50, 200);
      const { rows } = await pool.query(
        status
          ? `SELECT * FROM automation_events WHERE status = $1 ORDER BY created_at DESC LIMIT $2`
          : `SELECT * FROM automation_events ORDER BY created_at DESC LIMIT $1`,
        status ? [status, limite] : [limite]
      );
      res.json({ events: rows });
    } catch (err) {
      console.error("[GET /api/automation/events]", err);
      res.status(500).json({ error: "Erro ao listar eventos do Automation Engine." });
    }
  });

  router.post("/events/:id/retry", auth, authorize(["administrador"]), async (req: Request, res: Response) => {
    try {
      const evento = await buscarEventoPorId(pool, req.params.id);
      if (!evento) {
        res.status(404).json({ error: "Evento não encontrado." });
        return;
      }
      const empresaId = typeof evento.payload?.empresa_id === "string" ? (evento.payload.empresa_id as string) : null;
      await despacharAgora(pool, evento, empresaId);
      const atualizado = await buscarEventoPorId(pool, req.params.id);
      res.json({ event: atualizado });
    } catch (err) {
      console.error("[POST /api/automation/events/:id/retry]", err);
      res.status(500).json({ error: "Erro ao reprocessar evento." });
    }
  });

  router.get("/alertas", auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT ac.id, ac.tarefa_id, ac.empresa_id, e.razao_social AS empresa_nome,
                ac.workflow_tipo, ac.tier, ac.titulo, ac.prazo, ac.criado_em
           FROM automation_alerts_cache ac
           LEFT JOIN empresas e ON e.id = ac.empresa_id
          WHERE ac.criado_em >= NOW() - INTERVAL '14 days'
          ORDER BY CASE ac.tier WHEN 'atrasado' THEN 0 WHEN 'hoje' THEN 1 WHEN 'd1' THEN 2 WHEN 'd3' THEN 3 WHEN 'd7' THEN 4 ELSE 5 END,
                   ac.criado_em DESC
          LIMIT 100`
      );
      res.json({ alertas: rows });
    } catch (err) {
      console.error("[GET /api/automation/alertas]", err);
      res.status(500).json({ error: "Erro ao listar alertas do Automation Engine." });
    }
  });

  return router;
}
