-- ============================================================
-- MIGRAÇÃO 007 — Sincronização Chatwoot, n8n, CRM e IA por caixa
-- Versão: 1.0 | Data: 2026-04-01
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Adiciona caixa_id em crm_conversas (vincula conversa à caixa)
--   2. Adiciona agente_responsavel_id em crm_conversas (quem
--      está atendendo esta conversa no momento)
--   3. Adiciona ia_ativa em crm_conversas (controle por conversa)
--   4. Adiciona ia_pausada_ate em crm_conversas
--   5. Adiciona coluna captador_id em triagem_leads (rastrear origem)
--   6. Cria view vw_conversas_ativas para dashboard em tempo real
--   7. Cria view vw_ia_status para monitoramento de IA por caixa
--   8. Adiciona índices de performance para o webhook handler
--
-- PROBLEMA IDENTIFICADO NO WEBHOOK:
--   O handler POST /api/webhook/chatwoot cria leads com
--   etapa_funil = 'novo' (correto) mas não vincula à caixa.
--   Isso impede o controle de IA por caixa.
--   A solução é adicionar caixa_id em crm_conversas e criar
--   uma função que determina a caixa pelo canal.
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

BEGIN;

-- ─── 1. Colunas em crm_conversas ─────────────────────────────
ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS caixa_id             UUID
    REFERENCES public.crm_caixas(id) ON DELETE SET NULL;

ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS agente_responsavel_id UUID
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;

ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS ia_ativa             BOOLEAN DEFAULT TRUE;

ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS ia_pausada_ate       TIMESTAMPTZ;

ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS ia_motivo_pausa      TEXT;

-- ─── 2. Índices em crm_conversas ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_conversas_caixa
  ON public.crm_conversas(caixa_id)
  WHERE caixa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_agente
  ON public.crm_conversas(agente_responsavel_id)
  WHERE agente_responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_ia_ativa
  ON public.crm_conversas(ia_ativa)
  WHERE ia_ativa = TRUE;

-- ─── 3. Coluna captador_id em triagem_leads ──────────────────
ALTER TABLE public.triagem_leads
  ADD COLUMN IF NOT EXISTS captador_id UUID
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_triagem_captador
  ON public.triagem_leads(captador_id)
  WHERE captador_id IS NOT NULL;

-- ─── 4. Função: determinar caixa pelo canal ──────────────────
-- Usada pelo webhook handler para vincular conversas à caixa correta.
CREATE OR REPLACE FUNCTION public.fn_caixa_por_canal(p_canal TEXT)
RETURNS UUID AS $$
DECLARE
  v_caixa_id UUID;
BEGIN
  SELECT id INTO v_caixa_id
  FROM public.crm_caixas
  WHERE canal = p_canal
    AND ativo = TRUE
  ORDER BY created_at ASC
  LIMIT 1;
  RETURN v_caixa_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 5. Função: controlar IA por caixa ───────────────────────
-- Retorna TRUE se a IA deve responder nesta conversa.
-- Verifica: ia_ativa na conversa, ia_pausada_ate, ia_ativa na caixa.
CREATE OR REPLACE FUNCTION public.fn_ia_deve_responder(p_conversa_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_ia_ativa       BOOLEAN;
  v_ia_pausada_ate TIMESTAMPTZ;
  v_caixa_ia_ativa BOOLEAN;
BEGIN
  SELECT
    c.ia_ativa,
    c.ia_pausada_ate,
    COALESCE(cx.ia_ativa, FALSE)
  INTO v_ia_ativa, v_ia_pausada_ate, v_caixa_ia_ativa
  FROM public.crm_conversas c
  LEFT JOIN public.crm_caixas cx ON cx.id = c.caixa_id
  WHERE c.id = p_conversa_id;

  -- IA pausada temporariamente?
  IF v_ia_pausada_ate IS NOT NULL AND v_ia_pausada_ate > NOW() THEN
    RETURN FALSE;
  END IF;

  -- IA desativada na conversa?
  IF v_ia_ativa = FALSE THEN
    RETURN FALSE;
  END IF;

  -- IA desativada na caixa?
  IF v_caixa_ia_ativa = FALSE THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 6. View: conversas ativas por agente ────────────────────
CREATE OR REPLACE VIEW public.vw_conversas_ativas AS
SELECT
  c.id,
  c.lead_id,
  l.nome                                          AS lead_nome,
  l.telefone                                      AS lead_telefone,
  c.canal,
  c.canal_id_externo,
  c.status,
  c.ia_ativa,
  c.ia_pausada_ate,
  c.caixa_id,
  cx.nome                                         AS caixa_nome,
  c.agente_responsavel_id,
  col.nome                                        AS agente_nome,
  c.ultima_interacao_em,
  EXTRACT(EPOCH FROM (NOW() - c.ultima_interacao_em))::INTEGER AS segundos_sem_resposta,
  c.created_at
FROM public.crm_conversas c
LEFT JOIN public.leads l          ON l.id = c.lead_id
LEFT JOIN public.crm_caixas cx    ON cx.id = c.caixa_id
LEFT JOIN public.colaboradores col ON col.id = c.agente_responsavel_id
WHERE c.status NOT IN ('resolvida', 'arquivada');

-- ─── 7. View: status de IA por caixa ─────────────────────────
CREATE OR REPLACE VIEW public.vw_ia_status_caixas AS
SELECT
  cx.id                                                         AS caixa_id,
  cx.nome                                                       AS caixa_nome,
  cx.canal,
  cx.ia_ativa                                                   AS ia_ativa_caixa,
  COUNT(c.id)                                                   AS total_conversas,
  COUNT(c.id) FILTER (WHERE c.ia_ativa = TRUE
    AND (c.ia_pausada_ate IS NULL OR c.ia_pausada_ate <= NOW())) AS conversas_com_ia,
  COUNT(c.id) FILTER (WHERE c.ia_ativa = FALSE
    OR (c.ia_pausada_ate IS NOT NULL AND c.ia_pausada_ate > NOW())) AS conversas_sem_ia
FROM public.crm_caixas cx
LEFT JOIN public.crm_conversas c ON c.caixa_id = cx.id
  AND c.status NOT IN ('resolvida', 'arquivada')
GROUP BY cx.id, cx.nome, cx.canal, cx.ia_ativa;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Migration 007 — sincronização Chatwoot/n8n/IA por caixa aplicada em %', NOW();
END $$;
