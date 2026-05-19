/**
 * routesWeeklyMonitor.ts
 * Rotas REST do microsserviço de Acompanhamento Semanal Inteligente
 *
 * Como integrar ao server/index.ts existente:
 *
 *   import { registerWeeklyMonitorRoutes } from "./services/routesWeeklyMonitor.ts";
 *   // Dentro da função registerRoutes(app, pool):
 *   registerWeeklyMonitorRoutes(app, pool, auth, requireAcessoAcompanhamento);
 *
 * Posição no projeto: server/services/routesWeeklyMonitor.ts
 */

import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import { analisarSemana, analisarLote, type PayloadAnalise } from "./analisadorSemanal.ts";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function r2(v: number): number {
  if (!isFinite(v) || isNaN(v)) return 0;
  return Math.round(v * 100) / 100;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DAS ROTAS
// ─────────────────────────────────────────────────────────────────────────────

export function registerWeeklyMonitorRoutes(
  app: Express,
  pool: Pool,
  auth: (req: Request, res: Response, next: any) => void,
  requireAcesso: (req: Request, res: Response, next: any) => void
) {

  // ── POST /api/weekly-monitor/analyze ──────────────────────────────────────
  // Analisa UMA semana. Payload: PayloadAnalise
  // O front-end pode chamar isto on-the-fly (sem salvar), ou ao salvar uma atualização.
  app.post(
    "/api/weekly-monitor/analyze",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const body = req.body || {};

        // Validação rápida
        if (!body.annual_revenue_declared || !body.week_start) {
          res.status(400).json({
            error: "Campos obrigatórios: annual_revenue_declared, week_start.",
          });
          return;
        }
        if (!body.channels || typeof body.channels !== "object") {
          res.status(400).json({ error: "O campo channels é obrigatório." });
          return;
        }

        const payload: PayloadAnalise = {
          client_id:                body.client_id || "manual",
          annual_revenue_declared:  safeNum(body.annual_revenue_declared),
          week_start:               String(body.week_start).slice(0, 10),
          channels:                 body.channels,
          previous_accumulated:     body.previous_accumulated || { monthly_total: 0, annual_total: 0 },
          seasonal_index:           body.seasonal_index ? safeNum(body.seasonal_index) : undefined,
          operational_margin:       body.operational_margin ? safeNum(body.operational_margin) : 30,
        };

        const result = analisarSemana(payload);

        // Persiste o resultado no banco, se client_id (acompanhamento_id) for fornecido
        if (body.client_id && body.client_id !== "manual" && body.persist !== false) {
          await persistirAnalise(pool, body.client_id, result, req);
        }

        res.json(result);
      } catch (err: any) {
        console.error("[WEEKLY-MONITOR analyze]", err);
        res.status(400).json({ error: err?.message || "Erro ao analisar semana." });
      }
    }
  );

  // ── POST /api/weekly-monitor/analyze-batch ────────────────────────────────
  // Reanálise de todas as semanas de um acompanhamento (lote).
  // Útil para regenerar o histórico após mudança de faturamento declarado.
  app.post(
    "/api/weekly-monitor/analyze-batch",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const { acompanhamento_id, operational_margin } = req.body || {};

        if (!acompanhamento_id) {
          res.status(400).json({ error: "acompanhamento_id é obrigatório." });
          return;
        }

        // Buscar acompanhamento
        const acResult = await pool.query(
          `SELECT faturamento_anual, percentual_operacional
             FROM acompanhamentos_bancarios
            WHERE id = $1 LIMIT 1`,
          [acompanhamento_id]
        );
        if (!acResult.rows[0]) {
          res.status(404).json({ error: "Acompanhamento não encontrado." });
          return;
        }

        const acomp = acResult.rows[0];
        const annualRevenue = safeNum(acomp.faturamento_anual);
        const margin = safeNum(operational_margin ?? acomp.percentual_operacional, 30);

        // Buscar todas as atualizações
        const updResult = await pool.query(
          `SELECT * FROM acompanhamento_bancario_atualizacoes
            WHERE acompanhamento_id = $1
            ORDER BY numero_semana ASC`,
          [acompanhamento_id]
        );

        const resultado = analisarLote({
          client_id: acompanhamento_id,
          annual_revenue_declared: annualRevenue,
          operational_margin: margin,
          weeks: updResult.rows,
        });

        res.json(resultado);
      } catch (err: any) {
        console.error("[WEEKLY-MONITOR batch]", err);
        res.status(500).json({ error: err?.message || "Erro ao processar lote." });
      }
    }
  );

  // ── GET /api/weekly-monitor/history ──────────────────────────────────────
  // Retorna histórico de análises de um acompanhamento, já com cálculos aplicados.
  // Query params: acompanhamento_id (obrigatório), limit (opcional, padrão 8)
  app.get(
    "/api/weekly-monitor/history",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const { acompanhamento_id, limit = "8" } = req.query as Record<string, string>;

        if (!acompanhamento_id) {
          res.status(400).json({ error: "acompanhamento_id é obrigatório." });
          return;
        }

        // Buscar acompanhamento
        const acResult = await pool.query(
          `SELECT faturamento_anual, percentual_operacional, nome_empresa
             FROM acompanhamentos_bancarios
            WHERE id = $1 LIMIT 1`,
          [acompanhamento_id]
        );
        if (!acResult.rows[0]) {
          res.status(404).json({ error: "Acompanhamento não encontrado." });
          return;
        }

        const acomp = acResult.rows[0];
        const annualRevenue = safeNum(acomp.faturamento_anual);
        const margin = safeNum(acomp.percentual_operacional, 30);

        // Buscar últimas N semanas
        const updResult = await pool.query(
          `SELECT * FROM acompanhamento_bancario_atualizacoes
            WHERE acompanhamento_id = $1
            ORDER BY numero_semana DESC
            LIMIT $2`,
          [acompanhamento_id, parseInt(limit, 10)]
        );

        // Ordenar ASC para o lote calcular acumulados corretos
        const weeksAsc = [...updResult.rows].reverse();

        // Reanalisar cada semana com acumulados corretos
        let monthlyAcc = 0;
        let annualAcc  = 0;

        const analyses = weeksAsc.map(w => {
          try {
            const result = analisarSemana({
              client_id: acompanhamento_id,
              annual_revenue_declared: annualRevenue,
              week_start: String(w.data_referencia_inicio).slice(0, 10),
              channels: {
                maquininha: safeNum(w.entrada_maquininha),
                pix:        safeNum(w.entrada_pix),
                ted:        safeNum(w.entrada_ted),
                boleto:     safeNum(w.entrada_boleto),
                dinheiro:   safeNum(w.entrada_dinheiro),
                outros:     safeNum(w.outras_entradas),
              },
              previous_accumulated: {
                monthly_total: monthlyAcc,
                annual_total:  annualAcc,
              },
              operational_margin: margin,
            });

            monthlyAcc = r2(monthlyAcc + result.total_week);
            annualAcc  = r2(annualAcc  + result.total_week);

            return { ...result, numero_semana: w.numero_semana };
          } catch {
            return null;
          }
        }).filter(Boolean);

        res.json({
          acompanhamento_id,
          nome_empresa: acomp.nome_empresa,
          annual_revenue_declared: annualRevenue,
          operational_margin: margin,
          analyses,
        });
      } catch (err: any) {
        console.error("[WEEKLY-MONITOR history]", err);
        res.status(500).json({ error: err?.message || "Erro ao buscar histórico." });
      }
    }
  );

  // ── POST /api/weekly-monitor/quick-analyze ────────────────────────────────
  // Análise rápida a partir do acompanhamento_id + número da semana.
  // Busca dados do banco automaticamente — ideal para o dashboard chamar ao abrir.
  app.post(
    "/api/weekly-monitor/quick-analyze",
    auth,
    requireAcesso,
    async (req: Request, res: Response) => {
      try {
        const { acompanhamento_id, numero_semana } = req.body || {};

        if (!acompanhamento_id || !numero_semana) {
          res.status(400).json({ error: "acompanhamento_id e numero_semana são obrigatórios." });
          return;
        }

        const semNum = parseInt(String(numero_semana), 10);

        // Busca acompanhamento
        const acResult = await pool.query(
          `SELECT faturamento_anual, percentual_operacional
             FROM acompanhamentos_bancarios
            WHERE id = $1 LIMIT 1`,
          [acompanhamento_id]
        );
        if (!acResult.rows[0]) {
          res.status(404).json({ error: "Acompanhamento não encontrado." });
          return;
        }

        const acomp = acResult.rows[0];

        // Busca a semana específica
        const semResult = await pool.query(
          `SELECT * FROM acompanhamento_bancario_atualizacoes
            WHERE acompanhamento_id = $1 AND numero_semana = $2
            LIMIT 1`,
          [acompanhamento_id, semNum]
        );
        if (!semResult.rows[0]) {
          res.status(404).json({ error: `Semana ${semNum} não encontrada.` });
          return;
        }

        const w = semResult.rows[0];

        // Busca semanas anteriores para acumulados
        const anteriores = await pool.query(
          `SELECT * FROM acompanhamento_bancario_atualizacoes
            WHERE acompanhamento_id = $1 AND numero_semana < $2
            ORDER BY numero_semana ASC`,
          [acompanhamento_id, semNum]
        );

        const dataRef = String(w.data_referencia_inicio).slice(0, 10);
        const dateRef = new Date(dataRef + "T12:00:00Z");
        const mesRef  = dateRef.getMonth() + 1;
        const anoRef  = dateRef.getFullYear();

        // Acumulados anteriores usando função existente
        const { calcularAcumulados } = await import("../funcoes_acompanhamento.ts");
        const { acumuladoMensalAnterior, acumuladoAnual } = calcularAcumulados(
          anteriores.rows,
          semNum,
          mesRef,
          anoRef
        );

        const result = analisarSemana({
          client_id: acompanhamento_id,
          annual_revenue_declared: safeNum(acomp.faturamento_anual),
          week_start: dataRef,
          channels: {
            maquininha: safeNum(w.entrada_maquininha),
            pix:        safeNum(w.entrada_pix),
            ted:        safeNum(w.entrada_ted),
            boleto:     safeNum(w.entrada_boleto),
            dinheiro:   safeNum(w.entrada_dinheiro),
            outros:     safeNum(w.outras_entradas),
          },
          previous_accumulated: {
            monthly_total: acumuladoMensalAnterior,
            annual_total:  acumuladoAnual,
          },
          operational_margin: safeNum(acomp.percentual_operacional, 30),
        });

        res.json(result);
      } catch (err: any) {
        console.error("[WEEKLY-MONITOR quick]", err);
        res.status(500).json({ error: err?.message || "Erro ao analisar semana." });
      }
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTÊNCIA OPCIONAL DO RESULTADO
// ─────────────────────────────────────────────────────────────────────────────

async function persistirAnalise(
  pool: Pool,
  acompanhamentoId: string,
  result: ReturnType<typeof analisarSemana>,
  req: Request
) {
  try {
    const colaborador = (req as any).colaborador;
    const weekNum = parseInt(result.week_id.split("-W")[1], 10);

    // Apenas atualiza campos de inteligência na linha já existente.
    // Não cria uma nova linha — a linha já é criada pela rota de atualizações existente.
    await pool.query(
      `UPDATE acompanhamento_bancario_atualizacoes
          SET status_aderencia            = $3,
              alerta_aderencia            = $4,
              motivo_alerta_aderencia     = $5,
              meta_base_dinamica          = $6,
              teto_dinamico_proxima       = $7,
              percentual_uso_semanal      = $8,
              percentual_uso_mensal       = $9,
              updated_at                  = NOW()
        WHERE acompanhamento_id = $1
          AND numero_semana = $2`,
      [
        acompanhamentoId,
        weekNum,
        result.status,
        result.alerts.some(a => ["critico", "vermelho_alto", "vermelho_baixo"].includes(a.level)),
        result.alerts[0]?.message ?? null,
        result.compensation?.new_weekly_target ?? null,
        result.compensation?.new_weekly_ceiling ?? null,
        r2((result.total_week / result.corridors.ceiling_weekly) * 100),
        r2((result.accumulated.month / (result.corridors.ceiling_weekly * 4)) * 100),
      ]
    );
  } catch (err) {
    // Silencioso — a persistência do resultado de inteligência é opcional.
    console.warn("[WEEKLY-MONITOR persist]", err);
  }
}
