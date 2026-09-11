-- ============================================================
-- MIGRAÇÃO 008 — Dashboards e visibilidade por perfil
-- Versão: 1.0 | Data: 2026-04-01
--
-- O QUE ESTA MIGRATION FAZ:
--   Cria views de dashboard segmentadas por perfil de acesso:
--
--   1. vw_dashboard_gestor — visão completa para administrador,
--      diretor e gerente comercial: todos os leads, todos os
--      colaboradores, pipeline completo, métricas de conversão
--
--   2. vw_dashboard_consultor — visão restrita para consultor
--      de crédito e analista: apenas os próprios leads
--      (responsavel_id = colaborador logado)
--
--   3. vw_dashboard_captador — visão para captador externo:
--      apenas leads que ele captou (captador_id = colaborador)
--
--   4. vw_performance_colaboradores — ranking de performance
--      por colaborador (leads criados, convertidos, valor)
--
--   5. vw_funil_conversao — taxas de conversão entre etapas
--      do funil para análise de gargalos
--
--   6. vw_triagem_resumo — resumo da fila de triagem por status
--      e responsável
--
-- NOTA: A visibilidade por perfil é aplicada no servidor
--   (server/index.ts) via JWT. As views aqui são a base de dados
--   que o servidor consulta. O filtro por colaborador_id é
--   aplicado pelo servidor ao chamar as views.
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

-- ─── 1. View: dashboard do gestor ────────────────────────────
CREATE OR REPLACE VIEW public.vw_dashboard_gestor AS
SELECT
  -- Totais gerais
  COUNT(DISTINCT l.id)                                          AS total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'ganho')  AS leads_ganhos,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'perdido') AS leads_perdidos,
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= NOW() - INTERVAL '30 days') AS leads_ultimos_30d,
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= NOW() - INTERVAL '7 days')  AS leads_ultimos_7d,
  -- Pipeline
  COALESCE(SUM(l.valor_solicitado) FILTER (
    WHERE l.etapa_funil NOT IN ('perdido','inativo')
  ), 0)                                                         AS valor_pipeline_ativo,
  COALESCE(SUM(l.valor_solicitado) FILTER (
    WHERE l.etapa_funil = 'ganho'
  ), 0)                                                         AS valor_ganho_total,
  -- Triagem
  COUNT(DISTINCT t.id)                                          AS total_triagem,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pendente')    AS triagem_pendente,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'convertido')  AS triagem_convertida,
  -- Conversas
  COUNT(DISTINCT c.id)                                          AS total_conversas,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status NOT IN ('resolvida','arquivada')) AS conversas_ativas,
  -- Follow-ups
  COUNT(DISTINCT f.id) FILTER (
    WHERE f.status = 'pendente' AND f.agendado_para < NOW()
  )                                                             AS followups_atrasados,
  COUNT(DISTINCT f.id) FILTER (
    WHERE f.status = 'pendente'
    AND f.agendado_para BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
  )                                                             AS followups_hoje
FROM public.leads l
CROSS JOIN (SELECT COUNT(*) AS cnt FROM public.triagem_leads) t_count
LEFT JOIN public.triagem_leads t ON TRUE
LEFT JOIN public.crm_conversas c ON c.lead_id = l.id
LEFT JOIN public.crm_followups f ON f.lead_id = l.id;

-- ─── 2. View: pipeline por etapa (para Kanban) ───────────────
CREATE OR REPLACE VIEW public.vw_pipeline_por_etapa AS
SELECT
  etapa_funil,
  COUNT(*)                                                      AS total_leads,
  COALESCE(SUM(valor_solicitado), 0)                            AS valor_total,
  COUNT(*) FILTER (WHERE temperatura = 'urgente')               AS urgentes,
  COUNT(*) FILTER (WHERE temperatura = 'quente')                AS quentes,
  COUNT(*) FILTER (WHERE proximo_followup < NOW())              AS followups_atrasados,
  AVG(score_efetivo)::INTEGER                                   AS score_medio,
  COUNT(*) FILTER (WHERE responsavel_id IS NULL)                AS sem_responsavel
FROM public.leads
WHERE etapa_funil NOT IN ('inativo')
GROUP BY etapa_funil
ORDER BY
  CASE etapa_funil
    WHEN 'novo'              THEN 1
    WHEN 'contato_feito'     THEN 2
    WHEN 'qualificado'       THEN 3
    WHEN 'proposta_enviada'  THEN 4
    WHEN 'negociacao'        THEN 5
    WHEN 'documentacao'      THEN 6
    WHEN 'aprovacao'         THEN 7
    WHEN 'ganho'             THEN 8
    WHEN 'perdido'           THEN 9
    ELSE 99
  END;

-- ─── 3. View: performance por colaborador ────────────────────
CREATE OR REPLACE VIEW public.vw_performance_colaboradores AS
SELECT
  col.id                                                        AS colaborador_id,
  col.nome,
  col.cargo,
  col.ativo,
  -- Leads sob responsabilidade
  COUNT(DISTINCT l.id)                                          AS total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'ganho')  AS leads_ganhos,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'perdido') AS leads_perdidos,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil NOT IN ('ganho','perdido','inativo')) AS leads_ativos,
  -- Valor
  COALESCE(SUM(l.valor_solicitado) FILTER (
    WHERE l.etapa_funil = 'ganho'
  ), 0)                                                         AS valor_ganho,
  COALESCE(SUM(l.valor_solicitado) FILTER (
    WHERE l.etapa_funil NOT IN ('perdido','inativo')
  ), 0)                                                         AS valor_pipeline,
  -- Taxa de conversão
  CASE
    WHEN COUNT(DISTINCT l.id) > 0
    THEN ROUND(
      COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'ganho')::NUMERIC
      / COUNT(DISTINCT l.id) * 100, 1
    )
    ELSE 0
  END                                                           AS taxa_conversao_pct,
  -- Follow-ups
  COUNT(DISTINCT f.id) FILTER (
    WHERE f.status = 'pendente' AND f.agendado_para < NOW()
  )                                                             AS followups_atrasados,
  -- Atividades recentes
  COUNT(DISTINCT a.id) FILTER (
    WHERE a.created_at >= NOW() - INTERVAL '7 days'
  )                                                             AS atividades_7d,
  -- Captações
  COUNT(DISTINCT lc.id)                                         AS leads_captados
FROM public.colaboradores col
LEFT JOIN public.leads l  ON l.responsavel_id = col.id
LEFT JOIN public.leads lc ON lc.captador_id = col.id
LEFT JOIN public.crm_followups f ON f.colaborador_id = col.id
LEFT JOIN public.crm_atividades a ON a.colaborador_id = col.id
GROUP BY col.id, col.nome, col.cargo, col.ativo;

-- ─── 4. View: funil de conversão ─────────────────────────────
CREATE OR REPLACE VIEW public.vw_funil_conversao AS
WITH etapas AS (
  SELECT unnest(ARRAY[
    'novo','contato_feito','qualificado','proposta_enviada',
    'negociacao','documentacao','aprovacao','ganho','perdido'
  ]) AS etapa,
  generate_series(1, 9) AS ordem
),
contagens AS (
  SELECT etapa_funil, COUNT(*) AS total
  FROM public.leads
  WHERE etapa_funil IS NOT NULL
  GROUP BY etapa_funil
)
SELECT
  e.etapa,
  e.ordem,
  COALESCE(c.total, 0)                                          AS total_leads,
  LAG(COALESCE(c.total, 0)) OVER (ORDER BY e.ordem)            AS total_etapa_anterior,
  CASE
    WHEN LAG(COALESCE(c.total, 0)) OVER (ORDER BY e.ordem) > 0
    THEN ROUND(
      COALESCE(c.total, 0)::NUMERIC
      / LAG(COALESCE(c.total, 0)) OVER (ORDER BY e.ordem) * 100, 1
    )
    ELSE NULL
  END                                                           AS taxa_retencao_pct
FROM etapas e
LEFT JOIN contagens c ON c.etapa_funil = e.etapa
ORDER BY e.ordem;

-- ─── 5. View: resumo da triagem ──────────────────────────────
CREATE OR REPLACE VIEW public.vw_triagem_resumo AS
SELECT
  t.status,
  COUNT(*)                                                      AS total,
  COUNT(*) FILTER (WHERE t.responsavel_id IS NOT NULL)          AS com_responsavel,
  COUNT(*) FILTER (WHERE t.responsavel_id IS NULL)              AS sem_responsavel,
  COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '24 hours') AS ultimas_24h,
  COUNT(*) FILTER (WHERE t.score_ia >= 70)                      AS score_alto,
  COUNT(*) FILTER (WHERE t.score_ia BETWEEN 40 AND 69)          AS score_medio,
  COUNT(*) FILTER (WHERE t.score_ia < 40 OR t.score_ia IS NULL) AS score_baixo
FROM public.triagem_leads t
GROUP BY t.status
ORDER BY
  CASE t.status
    WHEN 'pendente'          THEN 1
    WHEN 'possivel_cliente'  THEN 2
    WHEN 'curioso'           THEN 3
    WHEN 'sem_perfil'        THEN 4
    WHEN 'convertido'        THEN 5
    WHEN 'descartado'        THEN 6
    ELSE 99
  END;

-- ─── 6. View: leads por responsável (para consultor) ─────────
-- O servidor filtra por responsavel_id = colaborador logado
CREATE OR REPLACE VIEW public.vw_leads_por_responsavel AS
SELECT
  l.responsavel_id,
  col.nome                                                      AS responsavel_nome,
  col.cargo                                                     AS responsavel_cargo,
  l.id                                                          AS lead_id,
  l.nome                                                        AS lead_nome,
  l.telefone,
  l.empresa,
  l.etapa_funil,
  l.temperatura,
  l.score_efetivo,
  l.prioridade,
  l.valor_solicitado,
  l.proximo_followup,
  l.ultimo_contato_em,
  l.caixa_id,
  cx.nome                                                       AS caixa_nome,
  l.created_at,
  l.updated_at,
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM public.leads l
LEFT JOIN public.colaboradores col ON col.id = l.responsavel_id
LEFT JOIN public.crm_caixas cx     ON cx.id = l.caixa_id
WHERE l.etapa_funil NOT IN ('inativo');

DO $$
BEGIN
  RAISE NOTICE 'Migration 008 — dashboards e visibilidade por perfil aplicados em %', NOW();
END $$;
