-- ─── Migration 021: Chatwoot → CRM atividades e deduplicação por email ──────
-- Expande o CHECK constraint de crm_atividades.tipo para incluir tipos de WhatsApp
-- Garante que leads.email existe para deduplicação
-- Garante que crm_atividades.origem_ia existe

BEGIN;

-- 1. Garantir campo email em leads (já existe no schema base, mas por segurança)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Garantir campo origem_ia em crm_atividades
ALTER TABLE public.crm_atividades
  ADD COLUMN IF NOT EXISTS origem_ia BOOLEAN DEFAULT FALSE;

-- 3. Garantir campo concluido em crm_atividades
ALTER TABLE public.crm_atividades
  ADD COLUMN IF NOT EXISTS concluido BOOLEAN DEFAULT TRUE;

-- 4. Expandir o CHECK constraint de crm_atividades.tipo para incluir tipos de WhatsApp
--    (whatsapp_mensagem, whatsapp_inicio, whatsapp_encerrado)
DO $$
BEGIN
  -- Remover constraint existente se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'crm_atividades'
      AND constraint_name = 'crm_atividades_tipo_check'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.crm_atividades DROP CONSTRAINT crm_atividades_tipo_check;
  END IF;

  -- Adicionar constraint expandida
  ALTER TABLE public.crm_atividades
    ADD CONSTRAINT crm_atividades_tipo_check
    CHECK (tipo IN (
      'nota','ligacao','whatsapp','email','reuniao','proposta','documento',
      'status_change','ia_acao','followup','outro',
      'whatsapp_mensagem','whatsapp_inicio','whatsapp_encerrado'
    ));
END;
$$;

-- 5. Índice para deduplicação por email em leads
CREATE INDEX IF NOT EXISTS idx_leads_email_lower
  ON public.leads (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

-- 6. Índice para crm_atividades por tipo (para consultas de WhatsApp)
CREATE INDEX IF NOT EXISTS idx_crm_atividades_tipo_whatsapp
  ON public.crm_atividades (lead_id, created_at DESC)
  WHERE tipo IN ('whatsapp_mensagem','whatsapp_inicio','whatsapp_encerrado','whatsapp');

COMMIT;
