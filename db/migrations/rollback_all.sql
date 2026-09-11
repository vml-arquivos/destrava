-- ============================================================
-- SCRIPT DE ROLLBACK — Destrava Crédito (Evolução CRM v2)
-- Versão: 1.0 | Data: 2026-04-01
--
-- ATENÇÃO: Este script desfaz TODAS as alterações aplicadas
-- pelas migrations 001 a 008. Use com cautela em produção,
-- pois dados inseridos nas novas tabelas serão PERDIDOS.
-- ============================================================

BEGIN;

-- ─── 008: Dashboards e visibilidade por perfil ───────────────
DROP VIEW IF EXISTS public.vw_leads_por_responsavel;
DROP VIEW IF EXISTS public.vw_triagem_resumo;
DROP VIEW IF EXISTS public.vw_funil_conversao;
DROP VIEW IF EXISTS public.vw_performance_colaboradores;
DROP VIEW IF EXISTS public.vw_pipeline_por_etapa;
DROP VIEW IF EXISTS public.vw_dashboard_gestor;

-- ─── 007: Sincronização Chatwoot, n8n, CRM e IA por caixa ────
DROP VIEW IF EXISTS public.vw_ia_status_caixas;
DROP VIEW IF EXISTS public.vw_conversas_ativas;
DROP FUNCTION IF EXISTS public.fn_ia_deve_responder(UUID);
DROP FUNCTION IF EXISTS public.fn_caixa_por_canal(TEXT);

ALTER TABLE public.triagem_leads
  DROP COLUMN IF EXISTS captador_id;

ALTER TABLE public.crm_conversas
  DROP COLUMN IF EXISTS ia_motivo_pausa,
  DROP COLUMN IF EXISTS ia_pausada_ate,
  DROP COLUMN IF EXISTS ia_ativa,
  DROP COLUMN IF EXISTS agente_responsavel_id,
  DROP COLUMN IF EXISTS caixa_id;

-- ─── 006: Campos extras em leads para operação CRM ───────────
ALTER TABLE public.triagem_leads
  DROP COLUMN IF EXISTS ia_pausada_ate,
  DROP COLUMN IF EXISTS ia_ativa;

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS ia_motivo_pausa,
  DROP COLUMN IF EXISTS ia_pausada_ate,
  DROP COLUMN IF EXISTS ia_ativa,
  DROP COLUMN IF EXISTS analise_credito_ia,
  DROP COLUMN IF EXISTS prazo_aprovacao_estimado,
  DROP COLUMN IF EXISTS linha_recomendada,
  DROP COLUMN IF EXISTS proxima_acao_ia,
  DROP COLUMN IF EXISTS probabilidade_conversao,
  DROP COLUMN IF EXISTS probabilidade_aprovacao;

-- ─── 005: Nova camada operacional do CRM ─────────────────────
DROP TRIGGER IF EXISTS trg_sync_followup_insert ON public.crm_followups;
DROP FUNCTION IF EXISTS public.fn_sync_proximo_followup();

DROP TABLE IF EXISTS public.crm_followups CASCADE;
DROP TABLE IF EXISTS public.crm_notas_internas CASCADE;

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS delegado_em,
  DROP COLUMN IF EXISTS delegado_de;

DROP TABLE IF EXISTS public.crm_delegacoes CASCADE;

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS prioridade,
  DROP COLUMN IF EXISTS caixa_id;

DROP TABLE IF EXISTS public.crm_caixas CASCADE;

-- ─── 004: Correção de usuários duplicados e cargos ───────────
DROP INDEX IF EXISTS public.idx_colaboradores_cargo;

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.colaboradores'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%cargo%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.colaboradores DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_colaboradores_email_unique;

-- ─── 003: Correção do mover-funil: histórico e atividade ─────
DROP TRIGGER IF EXISTS trg_leads_movimentacao_funil ON public.leads;
DROP FUNCTION IF EXISTS public.fn_registrar_movimentacao_funil();

-- ─── 002: Correção do etapa_funil (Kanban invisível) ─────────
-- Nota: O rollback do CHECK constraint volta para a versão antiga
-- que não incluía 'qualificado', 'documentacao', 'aprovacao'.
-- Isso pode falhar se houver leads nessas etapas.
-- Por segurança, movemos todos para 'novo' antes de aplicar o CHECK antigo.
UPDATE public.leads
SET etapa_funil = 'novo'
WHERE etapa_funil IN ('qualificado', 'documentacao', 'aprovacao');

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%etapa_funil%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_etapa_funil_check
  CHECK (etapa_funil IN (
    'novo','contato_feito','proposta_enviada',
    'negociacao','ganho','perdido','inativo'
  ));

-- ─── 001: Criação da tabela triagem_leads ────────────────────
-- ATENÇÃO: Se a tabela já existia antes (criada manualmente),
-- este DROP irá apagá-la. Comente esta linha se não quiser
-- perder os dados de triagem.
-- DROP TABLE IF EXISTS public.triagem_leads CASCADE;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Rollback concluído com sucesso em %', NOW();
END $$;
