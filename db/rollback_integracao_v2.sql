-- ============================================================
-- DESTRAVA CRÉDITO — Rollback da Migração de Integração v2.0
-- ATENÇÃO: Destrói dados criados após a migração v2.
-- Usar APENAS em caso de emergência.
-- ============================================================

BEGIN;

-- Remover tabelas novas (em ordem de dependência)
DROP TABLE IF EXISTS public.crm_mensagens CASCADE;
DROP TABLE IF EXISTS public.crm_conversas CASCADE;

-- Reverter colunas adicionadas em crm_eventos_webhook
ALTER TABLE public.crm_eventos_webhook
  DROP COLUMN IF EXISTS event_id,
  DROP COLUMN IF EXISTS origem,
  DROP COLUMN IF EXISTS tipo_evento,
  DROP COLUMN IF EXISTS status_processamento,
  DROP COLUMN IF EXISTS erro_detalhe,
  DROP COLUMN IF EXISTS processado_em;

-- Reverter colunas adicionadas em colaboradores
ALTER TABLE public.colaboradores
  DROP COLUMN IF EXISTS perfil;

-- Reverter colunas adicionadas em leads
ALTER TABLE public.leads
  DROP COLUMN IF EXISTS chatwoot_contact_id,
  DROP COLUMN IF EXISTS whatsapp_jid,
  DROP COLUMN IF EXISTS status_atendimento,
  DROP COLUMN IF EXISTS ultimo_canal;

-- Reverter colunas adicionadas em empresas
ALTER TABLE public.empresas
  DROP COLUMN IF EXISTS owner_principal_id,
  DROP COLUMN IF EXISTS compartilhada;

COMMIT;
