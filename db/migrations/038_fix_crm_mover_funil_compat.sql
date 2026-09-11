-- 038_fix_crm_mover_funil_compat.sql
-- Correção resiliente para o erro 500 em POST /api/crm/mover-funil.
--
-- Causas cobertas:
-- 1) Banco com etapa_funil em enum antigo da migration 009 (entrada, contato,
--    qualificacao, proposta etc.) enquanto o frontend envia funil novo
--    (novo_lead, tentando_contato etc.). O código foi corrigido para gravar a
--    taxonomia aceita pelo banco.
-- 2) Trigger antigo trg_leads_movimentacao_funil podia falhar ao inserir em
--    crm_historico_funil porque ambientes diferentes tinham nomes de colunas
--    divergentes: etapa_de/etapa_para x etapa_anterior/etapa_nova.
-- 3) crm_atividades podia ter CHECK constraint sem status_change/origem_ia/
--    concluido, causando rollback do UPDATE de leads e 500 no endpoint.
--
-- Idempotente: seguro para reexecutar.

BEGIN;

-- ─── 1. Garantir tabelas mínimas de histórico/atividades ───────────────────
CREATE TABLE IF NOT EXISTS public.crm_historico_funil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'nota',
  titulo TEXT NOT NULL DEFAULT 'Atividade',
  descricao TEXT,
  resultado TEXT,
  origem_ia BOOLEAN DEFAULT FALSE,
  concluido BOOLEAN DEFAULT TRUE,
  agendado_para TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Harmonizar colunas divergentes de crm_historico_funil ──────────────
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_de TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_para TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_anterior TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_nova TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS origem_ia BOOLEAN DEFAULT FALSE;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.crm_historico_funil
   SET etapa_de = COALESCE(etapa_de, etapa_anterior),
       etapa_para = COALESCE(etapa_para, etapa_nova),
       etapa_anterior = COALESCE(etapa_anterior, etapa_de),
       etapa_nova = COALESCE(etapa_nova, etapa_para)
 WHERE etapa_de IS NULL
    OR etapa_para IS NULL
    OR etapa_anterior IS NULL
    OR etapa_nova IS NULL;

-- ─── 3. Harmonizar crm_atividades ──────────────────────────────────────────
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS titulo TEXT;
ALTER TABLE public.crm_atividades ALTER COLUMN titulo SET DEFAULT 'Atividade';
UPDATE public.crm_atividades SET titulo = COALESCE(titulo, descricao, tipo, 'Atividade') WHERE titulo IS NULL;
ALTER TABLE public.crm_atividades ALTER COLUMN titulo SET NOT NULL;

ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS resultado TEXT;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS origem_ia BOOLEAN DEFAULT FALSE;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS concluido BOOLEAN DEFAULT TRUE;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Remover constraints antigas de tipo/resultado que bloqueiam status_change.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.crm_atividades'::regclass
       AND contype = 'c'
       AND (
         pg_get_constraintdef(oid) ILIKE '%tipo%'
         OR pg_get_constraintdef(oid) ILIKE '%resultado%'
       )
  LOOP
    EXECUTE format('ALTER TABLE public.crm_atividades DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.crm_atividades
  ADD CONSTRAINT crm_atividades_tipo_check
  CHECK (tipo IN (
    'nota','ligacao','whatsapp','email','reuniao','proposta','documento',
    'status_change','ia_acao','followup','outro','chatwoot_message',
    'chatwoot_status','chatwoot_assignment'
  ));

ALTER TABLE public.crm_atividades
  ADD CONSTRAINT crm_atividades_resultado_check
  CHECK (resultado IS NULL OR resultado IN ('positivo','neutro','negativo','sem_resposta'));

-- ─── 4. Recriar trigger de movimentação de funil de forma compatível ───────
DROP TRIGGER IF EXISTS trg_leads_movimentacao_funil ON public.leads;

CREATE OR REPLACE FUNCTION public.fn_registrar_movimentacao_funil()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.etapa_funil IS DISTINCT FROM NEW.etapa_funil THEN
    INSERT INTO public.crm_historico_funil (
      lead_id,
      colaborador_id,
      etapa_de,
      etapa_para,
      etapa_anterior,
      etapa_nova,
      motivo,
      origem_ia,
      created_at
    ) VALUES (
      NEW.id,
      NEW.responsavel_id,
      OLD.etapa_funil::TEXT,
      NEW.etapa_funil::TEXT,
      OLD.etapa_funil::TEXT,
      NEW.etapa_funil::TEXT,
      'Movimentação via sistema',
      FALSE,
      NOW()
    );

    INSERT INTO public.crm_atividades (
      lead_id,
      colaborador_id,
      tipo,
      titulo,
      descricao,
      origem_ia,
      concluido,
      created_at
    ) VALUES (
      NEW.id,
      NEW.responsavel_id,
      'status_change',
      'Funil: ' || COALESCE(OLD.etapa_funil::TEXT, '—') || ' → ' || NEW.etapa_funil::TEXT,
      'Movimentação automática registrada pelo sistema',
      FALSE,
      TRUE,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_movimentacao_funil
  AFTER UPDATE OF etapa_funil ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_movimentacao_funil();

-- ─── 5. Índices úteis ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_historico_funil_lead_data
  ON public.crm_historico_funil (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_atividades_lead_data
  ON public.crm_atividades (lead_id, created_at DESC);

COMMIT;
