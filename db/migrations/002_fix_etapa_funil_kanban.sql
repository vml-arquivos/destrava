-- ============================================================
-- MIGRAÇÃO 002 — Correção do etapa_funil (Kanban invisível)
-- Versão: 1.0 | Data: 2026-04-01
--
-- PROBLEMA IDENTIFICADO:
--   O schema_fase1_1_delta.sql criou o DEFAULT da coluna
--   etapa_funil como 'Novo' (maiúsculo), mas:
--   (a) o CRM.tsx filtra por 'novo' (minúsculo)
--   (b) a view vw_crm_pipeline exclui etapa_funil = 'inativo'
--   (c) o CHECK constraint do migrate.sql aceita apenas minúsculos
--   Resultado: leads com etapa_funil = 'Novo' ficam INVISÍVEIS
--   no Kanban porque não batem com nenhuma coluna do ETAPAS_FUNIL.
--
-- ADICIONALMENTE:
--   O CRM.tsx define 9 etapas no frontend:
--     novo, contato_feito, qualificado, proposta_enviada,
--     negociacao, documentacao, aprovacao, ganho, perdido
--   Mas o migrate.sql define apenas 7 etapas no CHECK:
--     novo, contato_feito, proposta_enviada, negociacao,
--     ganho, perdido, inativo
--   As etapas 'qualificado', 'documentacao', 'aprovacao'
--   existem no frontend mas não no CHECK do banco.
--   Esta migration alinha o CHECK constraint com o frontend.
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

BEGIN;

-- ─── 1. Normalizar etapa_funil existente para minúsculas ─────
UPDATE public.leads
SET etapa_funil = LOWER(etapa_funil)
WHERE etapa_funil IS DISTINCT FROM LOWER(etapa_funil);

-- ─── 2. Backfill de NULLs ────────────────────────────────────
UPDATE public.leads
SET etapa_funil = 'novo'
WHERE etapa_funil IS NULL;

-- ─── 3. Corrigir valores fora do conjunto válido ─────────────
-- Leads com etapa_funil não reconhecida voltam para 'novo'
UPDATE public.leads
SET etapa_funil = 'novo'
WHERE etapa_funil NOT IN (
  'novo','contato_feito','qualificado','proposta_enviada',
  'negociacao','documentacao','aprovacao','ganho','perdido','inativo'
);

-- ─── 4. Remover o CHECK constraint antigo (se existir) ───────
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
    RAISE NOTICE 'CHECK constraint % removido', v_constraint;
  END IF;
END $$;

-- ─── 5. Adicionar CHECK constraint atualizado ────────────────
ALTER TABLE public.leads
  ADD CONSTRAINT leads_etapa_funil_check
  CHECK (etapa_funil IN (
    'novo','contato_feito','qualificado','proposta_enviada',
    'negociacao','documentacao','aprovacao','ganho','perdido','inativo'
  ));

-- ─── 6. Garantir DEFAULT correto (minúsculo) ─────────────────
ALTER TABLE public.leads
  ALTER COLUMN etapa_funil SET DEFAULT 'novo';

-- ─── 7. Recriar view vw_crm_pipeline com etapas corretas ─────
-- Inclui todas as etapas do frontend; exclui apenas 'inativo'
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
  c.nome                                                          AS responsavel_nome,
  l.origem,
  l.status,
  l.created_at,
  l.updated_at,
  COALESCE(d.total_docs, 0)                                       AS total_docs,
  COALESCE(d.docs_recebidos, 0)                                   AS docs_recebidos,
  COALESCE(d.docs_pendentes_obrig, 0)                             AS docs_pendentes_obrig,
  a.titulo                                                        AS ultima_atividade,
  a.created_at                                                    AS ultima_atividade_em,
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM public.leads l
LEFT JOIN public.colaboradores c ON c.id = l.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                      AS total_docs,
    COUNT(*) FILTER (WHERE status IN ('recebido','aprovado'))     AS docs_recebidos,
    COUNT(*) FILTER (WHERE obrigatorio AND status = 'pendente')   AS docs_pendentes_obrig
  FROM public.crm_documentos WHERE lead_id = l.id
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT titulo, created_at
  FROM public.crm_atividades
  WHERE lead_id = l.id
  ORDER BY created_at DESC LIMIT 1
) a ON TRUE
WHERE l.etapa_funil NOT IN ('inativo');

-- ─── 8. Recriar view vw_crm_metricas ─────────────────────────
CREATE OR REPLACE VIEW public.vw_crm_metricas AS
SELECT
  etapa_funil,
  temperatura,
  COUNT(*)                    AS total_leads,
  SUM(valor_solicitado)       AS valor_total_pipeline,
  AVG(score_efetivo)::INTEGER AS score_medio,
  COUNT(*) FILTER (WHERE proximo_followup <= NOW()) AS followups_atrasados,
  COUNT(*) FILTER (WHERE dias_sem_contato > 7)      AS sem_contato_7d
FROM public.vw_crm_pipeline
GROUP BY etapa_funil, temperatura;

COMMIT;

-- ─── Verificação ──────────────────────────────────────────────
SELECT etapa_funil, COUNT(*) AS total
FROM public.leads
GROUP BY etapa_funil
ORDER BY etapa_funil;
