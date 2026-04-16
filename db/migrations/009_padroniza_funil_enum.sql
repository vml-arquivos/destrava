-- ============================================================
-- MIGRAÇÃO 009 — Padronização do funil comercial
-- Objetivo: substituir a taxonomia legada por um enum controlado
-- sem perder dados e sem quebrar leituras existentes.
-- ============================================================

BEGIN;

-- ─── 1. Criar enum canônico do funil ──────────────────────────
DO $$ BEGIN
  CREATE TYPE etapa_funil_enum AS ENUM (
    'entrada',
    'triagem',
    'contato',
    'qualificacao',
    'documentos',
    'analise',
    'proposta',
    'negociacao',
    'ganho',
    'perdido',
    'reativacao',
    'carteira'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── 2. Garantir coluna existente e sem nulls ────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS etapa_funil TEXT;

UPDATE public.leads
SET etapa_funil = 'entrada'
WHERE etapa_funil IS NULL OR BTRIM(etapa_funil) = '';

-- ─── 3. Normalizar valores legados para a taxonomia nova ──────
UPDATE public.leads
SET etapa_funil = CASE LOWER(BTRIM(etapa_funil))
  WHEN 'novo' THEN 'entrada'
  WHEN 'entrada' THEN 'entrada'
  WHEN 'triagem' THEN 'triagem'
  WHEN 'contato_feito' THEN 'contato'
  WHEN 'contato' THEN 'contato'
  WHEN 'qualificado' THEN 'qualificacao'
  WHEN 'qualificacao' THEN 'qualificacao'
  WHEN 'documentacao' THEN 'documentos'
  WHEN 'documentos' THEN 'documentos'
  WHEN 'aprovacao' THEN 'analise'
  WHEN 'analise' THEN 'analise'
  WHEN 'proposta_enviada' THEN 'proposta'
  WHEN 'proposta' THEN 'proposta'
  WHEN 'negociacao' THEN 'negociacao'
  WHEN 'ganho' THEN 'ganho'
  WHEN 'perdido' THEN 'perdido'
  WHEN 'inativo' THEN 'reativacao'
  WHEN 'reativacao' THEN 'reativacao'
  WHEN 'carteira' THEN 'carteira'
  ELSE 'entrada'
END;

-- ─── 4. Remover check antigo sobre etapa_funil, se existir ────
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%etapa_funil%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END $$;

-- ─── 5. Converter coluna para enum ────────────────────────────
ALTER TABLE public.leads
  ALTER COLUMN etapa_funil DROP DEFAULT;

ALTER TABLE public.leads
  ALTER COLUMN etapa_funil TYPE etapa_funil_enum
  USING (
    CASE LOWER(BTRIM(etapa_funil::TEXT))
      WHEN 'entrada' THEN 'entrada'::etapa_funil_enum
      WHEN 'triagem' THEN 'triagem'::etapa_funil_enum
      WHEN 'contato' THEN 'contato'::etapa_funil_enum
      WHEN 'qualificacao' THEN 'qualificacao'::etapa_funil_enum
      WHEN 'documentos' THEN 'documentos'::etapa_funil_enum
      WHEN 'analise' THEN 'analise'::etapa_funil_enum
      WHEN 'proposta' THEN 'proposta'::etapa_funil_enum
      WHEN 'negociacao' THEN 'negociacao'::etapa_funil_enum
      WHEN 'ganho' THEN 'ganho'::etapa_funil_enum
      WHEN 'perdido' THEN 'perdido'::etapa_funil_enum
      WHEN 'reativacao' THEN 'reativacao'::etapa_funil_enum
      WHEN 'carteira' THEN 'carteira'::etapa_funil_enum
      ELSE 'entrada'::etapa_funil_enum
    END
  );

ALTER TABLE public.leads
  ALTER COLUMN etapa_funil SET DEFAULT 'entrada'::etapa_funil_enum,
  ALTER COLUMN etapa_funil SET NOT NULL;

-- ─── 6. Recriar views operacionais dependentes do funil ───────
CREATE OR REPLACE VIEW public.vw_crm_pipeline AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.email,
  l.empresa,
  l.tipo_pessoa,
  l.cpf_cnpj,
  l.cargo,
  l.cidade,
  l.estado,
  l.canal_origem,
  l.produto_interesse,
  l.valor_solicitado,
  l.prazo_meses,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  l.score_manual,
  l.score_efetivo,
  l.tags,
  l.proximo_followup,
  l.ultimo_contato_em,
  l.resumo_ia,
  l.observacoes_ia,
  l.chatwoot_conv_id,
  l.responsavel_id,
  c.nome AS responsavel_nome,
  l.origem,
  l.status,
  l.created_at,
  l.updated_at,
  COALESCE(d.total_docs, 0) AS total_docs,
  COALESCE(d.docs_recebidos, 0) AS docs_recebidos,
  COALESCE(d.docs_pendentes_obrig, 0) AS docs_pendentes_obrig,
  a.titulo AS ultima_atividade,
  a.created_at AS ultima_atividade_em,
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM public.leads l
LEFT JOIN public.colaboradores c ON c.id = l.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_docs,
    COUNT(*) FILTER (WHERE status IN ('recebido','aprovado')) AS docs_recebidos,
    COUNT(*) FILTER (WHERE obrigatorio AND status = 'pendente') AS docs_pendentes_obrig
  FROM public.crm_documentos
  WHERE lead_id = l.id
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT titulo, created_at
  FROM public.crm_atividades
  WHERE lead_id = l.id
  ORDER BY created_at DESC
  LIMIT 1
) a ON TRUE;

CREATE OR REPLACE VIEW public.vw_crm_metricas AS
SELECT
  etapa_funil,
  temperatura,
  COUNT(*) AS total_leads,
  SUM(valor_solicitado) AS valor_total_pipeline,
  AVG(score_efetivo)::INTEGER AS score_medio,
  COUNT(*) FILTER (WHERE proximo_followup <= NOW()) AS followups_atrasados,
  COUNT(*) FILTER (WHERE dias_sem_contato > 7) AS sem_contato_7d
FROM public.vw_crm_pipeline
GROUP BY etapa_funil, temperatura;

CREATE OR REPLACE VIEW public.vw_pipeline_por_etapa AS
SELECT
  etapa_funil,
  COUNT(*) AS total_leads,
  COALESCE(SUM(valor_solicitado), 0) AS valor_total,
  COUNT(*) FILTER (WHERE temperatura = 'urgente') AS urgentes,
  COUNT(*) FILTER (WHERE temperatura = 'quente') AS quentes,
  COUNT(*) FILTER (WHERE proximo_followup < NOW()) AS followups_atrasados,
  AVG(score_efetivo)::INTEGER AS score_medio,
  COUNT(*) FILTER (WHERE responsavel_id IS NULL) AS sem_responsavel
FROM public.leads
GROUP BY etapa_funil
ORDER BY
  CASE etapa_funil
    WHEN 'entrada' THEN 1
    WHEN 'triagem' THEN 2
    WHEN 'contato' THEN 3
    WHEN 'qualificacao' THEN 4
    WHEN 'documentos' THEN 5
    WHEN 'analise' THEN 6
    WHEN 'proposta' THEN 7
    WHEN 'negociacao' THEN 8
    WHEN 'ganho' THEN 9
    WHEN 'perdido' THEN 10
    WHEN 'reativacao' THEN 11
    WHEN 'carteira' THEN 12
    ELSE 99
  END;

CREATE OR REPLACE VIEW public.vw_funil_conversao AS
WITH etapas AS (
  SELECT unnest(ARRAY[
    'entrada','triagem','contato','qualificacao','documentos','analise',
    'proposta','negociacao','ganho','perdido','reativacao','carteira'
  ]::TEXT[]) AS etapa,
  generate_series(1, 12) AS ordem
),
contagens AS (
  SELECT etapa_funil::TEXT AS etapa_funil, COUNT(*) AS total
  FROM public.leads
  WHERE etapa_funil IS NOT NULL
  GROUP BY etapa_funil
)
SELECT
  e.etapa,
  e.ordem,
  COALESCE(c.total, 0) AS total_leads,
  LAG(COALESCE(c.total, 0)) OVER (ORDER BY e.ordem) AS total_etapa_anterior,
  CASE
    WHEN LAG(COALESCE(c.total, 0)) OVER (ORDER BY e.ordem) > 0
    THEN ROUND(
      COALESCE(c.total, 0)::NUMERIC
      / LAG(COALESCE(c.total, 0)) OVER (ORDER BY e.ordem) * 100, 1
    )
    ELSE NULL
  END AS taxa_retencao_pct
FROM etapas e
LEFT JOIN contagens c ON c.etapa_funil = e.etapa
ORDER BY e.ordem;

COMMIT;
