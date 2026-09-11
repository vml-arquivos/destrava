/**
 * acompanhamentoBancarioNexus.ts
 *
 * Workflow 2: a tarefa de cada semana do acompanhamento bancário vive no
 * Nexus (system of record); o Destrava não cria sua própria cópia, só
 * busca/renderiza e escreve de volta via este router -- ver
 * nexus_task_links (db/migrations/072_automation_engine.sql) para o
 * mapeamento semana -> tarefa do Nexus, preenchido pelo dispatcher quando
 * o evento AcompanhamentoCriado é processado.
 *
 * Segue o mesmo padrão de registro direto em `app` (não Router isolado)
 * usado por registerWeeklyMonitorRoutes, porque precisa dos middlewares
 * `auth`/`requireAcesso` definidos no escopo de startServer().
 */
import type { Express, Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import { chamarNexus } from "../services/automation/webhookClient.ts";
import { publishEvent } from "../services/automation/eventBus.ts";

async function buscarLink(pool: Pool, acompanhamentoId: string, numeroSemana: number) {
  const { rows } = await pool.query(
    `SELECT * FROM nexus_task_links WHERE entidade_tipo = 'acompanhamento_semana' AND entidade_id = $1 AND numero_semana = $2`,
    [acompanhamentoId, numeroSemana]
  );
  return rows[0] || null;
}

export function registerAcompanhamentoBancarioNexusRoutes(
  app: Express,
  pool: Pool,
  auth: (req: Request, res: Response, next: NextFunction) => void,
  requireAcesso: (req: Request, res: Response, next: NextFunction) => void
) {
  app.get(
    "/api/acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const numero = Number(req.params.numero);
        const link = await buscarLink(pool, req.params.id, numero);
        if (!link) {
          res.status(404).json({ error: "Esta semana ainda não tem tarefa sincronizada com o Nexus." });
          return;
        }

        const resposta = await chamarNexus("POST", `/api/integracoes/destrava/tarefas/${link.nexus_tarefa_id}`, {});
        if (!resposta.ok) {
          res.status(502).json({ error: `Não foi possível carregar a tarefa do Nexus (HTTP ${resposta.status}).` });
          return;
        }

        const dados = JSON.parse(resposta.body);
        res.json(dados);
      } catch (err) {
        console.error("[GET /acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa]", err);
        res.status(500).json({ error: "Erro ao buscar tarefa do Nexus." });
      }
    }
  );

  app.patch(
    "/api/acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa/checklist",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const numero = Number(req.params.numero);
        const { item_id, feito } = req.body || {};
        if (!item_id || typeof feito !== "boolean") {
          res.status(400).json({ error: "item_id e feito (booleano) são obrigatórios." });
          return;
        }

        const link = await buscarLink(pool, req.params.id, numero);
        if (!link) {
          res.status(404).json({ error: "Esta semana ainda não tem tarefa sincronizada com o Nexus." });
          return;
        }

        const colaborador = (req as any).colaborador || {};
        const corpo = {
          item_id,
          feito,
          executado_por_nome: colaborador.nome || null,
          executado_por_email: colaborador.email || null,
        };

        try {
          const resposta = await chamarNexus("PATCH", `/api/integracoes/destrava/tarefas/${link.nexus_tarefa_id}/checklist`, corpo);
          if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
          res.json({ sincronizado: true, tarefa: JSON.parse(resposta.body).tarefa });
        } catch (chamadaErr) {
          // Chamada síncrona falhou (Nexus indisponível, rede, etc.) -- enfileira
          // no outbox para o retry sweep entregar depois, e avisa o usuário que
          // a mudança foi salva localmente mas ainda está sincronizando.
          await publishEvent(pool, {
            eventType: "SemanaConcluida",
            aggregateType: "acompanhamento_semana",
            aggregateId: req.params.id,
            idempotencyKey: `acomp:${req.params.id}:semana:${numero}:checklist:${item_id}:${Date.now()}`,
            empresaId: null,
            payload: {
              nexus_tarefa_id: link.nexus_tarefa_id,
              acompanhamento_id: req.params.id,
              numero_semana: numero,
              checklist_item_id: item_id,
              feito,
              concluida_por: colaborador.nome || colaborador.email || "colaborador",
            },
          });
          res.status(202).json({ sincronizado: false, mensagem: "Salvo localmente; sincronizando com o Nexus em segundo plano." });
        }
      } catch (err) {
        console.error("[PATCH /acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa/checklist]", err);
        res.status(500).json({ error: "Erro ao atualizar checklist da tarefa no Nexus." });
      }
    }
  );

  app.patch(
    "/api/acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa/status",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const numero = Number(req.params.numero);
        const { status } = req.body || {};
        if (!status) {
          res.status(400).json({ error: "status é obrigatório." });
          return;
        }

        const link = await buscarLink(pool, req.params.id, numero);
        if (!link) {
          res.status(404).json({ error: "Esta semana ainda não tem tarefa sincronizada com o Nexus." });
          return;
        }

        const colaborador = (req as any).colaborador || {};
        const corpo = {
          status,
          executado_por_nome: colaborador.nome || null,
          executado_por_email: colaborador.email || null,
        };

        try {
          const resposta = await chamarNexus("PATCH", `/api/integracoes/destrava/tarefas/${link.nexus_tarefa_id}/status`, corpo);
          if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
          res.json({ sincronizado: true, tarefa: JSON.parse(resposta.body).tarefa });
        } catch (chamadaErr) {
          await publishEvent(pool, {
            eventType: "SemanaConcluida",
            aggregateType: "acompanhamento_semana",
            aggregateId: req.params.id,
            idempotencyKey: `acomp:${req.params.id}:semana:${numero}:status:${status}:${Date.now()}`,
            empresaId: null,
            payload: {
              nexus_tarefa_id: link.nexus_tarefa_id,
              acompanhamento_id: req.params.id,
              numero_semana: numero,
              status,
              concluida_por: colaborador.nome || colaborador.email || "colaborador",
            },
          });
          res.status(202).json({ sincronizado: false, mensagem: "Salvo localmente; sincronizando com o Nexus em segundo plano." });
        }
      } catch (err) {
        console.error("[PATCH /acompanhamentos-bancarios/:id/semanas/:numero/nexus-tarefa/status]", err);
        res.status(500).json({ error: "Erro ao atualizar status da tarefa no Nexus." });
      }
    }
  );
}
