-- 040_fix_crm_funil_enum_to_text.sql
-- Corrige definitivamente o erro 500 em POST /api/crm/mover-funil.
--
-- Problema: migration 009 converteu leads.etapa_funil para o tipo enum
-- etapa_funil_enum. O Node/pg envia strings via $1 e o PostgreSQL rejeita
-- a atribuição direta de TEXT a ENUM sem cast explícito, causando erro 500.
--
-- Solução: converter etapa_funil de volta para TEXT com CHECK constraint
-- equivalente, preservando todos os dados existentes.
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

BEGIN;

-- ─── 1. Verificar se etapa_funil ainda é enum e converter para TEXT ─────────
DO $$
DECLARE
  v_col_type TEXT;
BEGIN
  SELECT data_type INTO v_col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'leads'
     AND column_name  = 'etapa_funil';

  IF v_col_type = 'USER-DEFINED' THEN
    -- Remover default antes de alterar tipo
    ALTER TABLE public.leads ALTER COLUMN etapa_funil DROP DEFAULT;

    -- Converter enum para TEXT preservando todos os valores
    ALTER TABLE public.leads
      ALTER COLUMN etapa_funil TYPE TEXT
      USING etapa_funil::TEXT;

    -- Restaurar default como TEXT
    ALTER TABLE public.leads
      ALTER COLUMN etapa_funil SET DEFAULT 'entrada';

    RAISE NOTICE 'etapa_funil convertida de ENUM para TEXT com sucesso.';
  ELSE
    RAISE NOTICE 'etapa_funil já é TEXT (tipo: %). Nenhuma alteração necessária.', v_col_type;
  END IF;
END $$;

-- ─── 2. Garantir NOT NULL e DEFAULT ─────────────────────────────────────────
UPDATE public.leads
   SET etapa_funil = 'entrada'
 WHERE etapa_funil IS NULL OR BTRIM(etapa_funil) = '';

ALTER TABLE public.leads
  ALTER COLUMN etapa_funil SET NOT NULL,
  ALTER COLUMN etapa_funil SET DEFAULT 'entrada';

-- ─── 3. Remover qualquer CHECK antigo sobre etapa_funil em leads ─────────────
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.leads'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%etapa_funil%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Constraint removida: %', c.conname;
  END LOOP;
END $$;

-- ─── 4. Adicionar CHECK constraint compatível com todas as etapas ────────────
-- Inclui tanto os valores da taxonomia legada (migration 009) quanto os novos
ALTER TABLE public.leads
  ADD CONSTRAINT leads_etapa_funil_check
  CHECK (etapa_funil IN (
    -- Taxonomia migration 009 (usada para persistência)
    'entrada', 'triagem', 'contato', 'qualificacao', 'documentos',
    'analise', 'proposta', 'negociacao', 'ganho', 'perdido',
    'reativacao', 'carteira',
    -- Taxonomia nova do frontend (caso algum valor novo seja gravado diretamente)
    'novo_lead', 'tentando_contato', 'em_atendimento', 'qualificado',
    'proposta_enviada', 'documentos_pendentes', 'contrato_gerado',
    'aguardando_pagamento', 'fechado', 'em_execucao', 'pos_venda',
    -- Taxonomia schema_crm antigo
    'novo', 'contato_feito', 'documentacao', 'aprovacao', 'inativo'
  ));

-- ─── 5. Garantir que o tipo enum ainda exista (não remover para compatibilidade) ─
-- O enum etapa_funil_enum pode ser usado por outras tabelas/funções;
-- não o removemos para evitar quebrar dependências.

-- ─── 6. Recriar trigger de movimentação de funil (compatível com TEXT) ───────
DROP TRIGGER IF EXISTS trg_leads_movimentacao_funil ON public.leads;

CREATE OR REPLACE FUNCTION public.fn_registrar_movimentacao_funil()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.etapa_funil IS DISTINCT FROM NEW.etapa_funil THEN
    -- Garantir que crm_historico_funil existe com as colunas necessárias
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

    -- Registrar atividade automática
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

-- ─── 7. Garantir crm_historico_funil com todas as colunas necessárias ────────
CREATE TABLE IF NOT EXISTS public.crm_historico_funil (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID       REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  etapa_de      TEXT,
  etapa_para    TEXT,
  etapa_anterior TEXT,
  etapa_nova    TEXT,
  motivo        TEXT,
  origem_ia     BOOLEAN     DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_de       TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_para     TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_anterior TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS etapa_nova     TEXT;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS origem_ia      BOOLEAN DEFAULT FALSE;
ALTER TABLE public.crm_historico_funil ADD COLUMN IF NOT EXISTS motivo         TEXT;

-- ─── 8. Garantir crm_atividades com tipo status_change permitido ──────────────
CREATE TABLE IF NOT EXISTS public.crm_atividades (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  tipo           TEXT        NOT NULL DEFAULT 'nota',
  titulo         TEXT        NOT NULL DEFAULT 'Atividade',
  descricao      TEXT,
  resultado      TEXT,
  origem_ia      BOOLEAN     DEFAULT FALSE,
  concluido      BOOLEAN     DEFAULT TRUE,
  agendado_para  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS titulo       TEXT;
ALTER TABLE public.crm_atividades ALTER COLUMN titulo SET DEFAULT 'Atividade';
UPDATE public.crm_atividades SET titulo = COALESCE(titulo, descricao, tipo, 'Atividade') WHERE titulo IS NULL;
ALTER TABLE public.crm_atividades ALTER COLUMN titulo SET NOT NULL;

ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS origem_ia    BOOLEAN DEFAULT FALSE;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS concluido    BOOLEAN DEFAULT TRUE;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS descricao    TEXT;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS resultado    TEXT;
ALTER TABLE public.crm_atividades ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ;

-- Remover constraints antigas de tipo/resultado que possam bloquear status_change
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
    EXECUTE format('ALTER TABLE public.crm_atividades DROP CONSTRAINT IF EXISTS %I', c.conname);
    RAISE NOTICE 'Constraint removida de crm_atividades: %', c.conname;
  END LOOP;
END $$;

-- Recriar constraints abrangentes
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

-- ─── 9. Índices de performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_etapa_funil
  ON public.leads (etapa_funil);

CREATE INDEX IF NOT EXISTS idx_crm_historico_funil_lead_data
  ON public.crm_historico_funil (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_atividades_lead_data
  ON public.crm_atividades (lead_id, created_at DESC);

-- ─── 10. Garantir crm_logs existe ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        REFERENCES public.leads(id) ON DELETE CASCADE,
  usuario_id UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  acao       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_logs_lead_id
  ON public.crm_logs (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_logs_usuario_id
  ON public.crm_logs (usuario_id, created_at DESC);

COMMIT;
