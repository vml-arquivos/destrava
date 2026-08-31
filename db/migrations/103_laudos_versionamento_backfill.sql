-- Migration 103 — versionamento de laudos, classificação fail-closed e backfill controlado.
-- Aditiva e idempotente: nenhuma linha de documento ou laudo é removida.

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL THEN
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS analysis_signature TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS classifier_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS extractor_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS rule_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS schema_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'REANALISE_NECESSARIA';
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS tipo_esperado TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS tipo_detectado TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS identidade_status TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS temporalidade_status TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS cobertura_status TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS satisfaz_requisito BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL THEN
    UPDATE public.documentos_extracoes_ia
       SET analysis_status = CASE
         WHEN status IN ('concluido', 'revisao_humana') AND analysis_signature IS NOT NULL THEN 'ATIVO'
         ELSE 'REANALISE_NECESSARIA'
       END
     WHERE analysis_status IS NULL OR analysis_status = '';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL THEN
    UPDATE public.documentos_extracoes_ia
       SET analysis_status = 'REANALISE_NECESSARIA',
           stale_at = COALESCE(stale_at, NOW()),
           satisfaz_requisito = FALSE
     WHERE analysis_status = 'ATIVO'
       AND (extractor_version IS NULL OR rule_version IS NULL OR schema_version IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'documentos_extracoes_ia_analysis_status_chk'
     ) THEN
    ALTER TABLE public.documentos_extracoes_ia
      ADD CONSTRAINT documentos_extracoes_ia_analysis_status_chk
      CHECK (analysis_status IN ('ATIVO', 'STALE', 'REANALISE_NECESSARIA', 'SUPERSEDED'));
  END IF;
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_signature
  ON public.documentos_extracoes_ia (arquivo_id, prompt_codigo, analysis_signature);

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_active
  ON public.documentos_extracoes_ia (arquivo_id, prompt_codigo, analysis_status, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS public.documentos_backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL,
  empresa_id UUID NULL,
  prompt_codigo TEXT NOT NULL,
  prioridade INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  tentativas INTEGER NOT NULL DEFAULT 0,
  disponivel_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_em TIMESTAMPTZ NULL,
  bloqueado_por TEXT NULL,
  concluido_em TIMESTAMPTZ NULL,
  ultimo_erro TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentos_backfill_jobs_status_chk CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU'))
);

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.documentos_backfill_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'documentos_backfill_jobs_documento_fk'
     ) THEN
    ALTER TABLE public.documentos_backfill_jobs
      ADD CONSTRAINT documentos_backfill_jobs_documento_fk
      FOREIGN KEY (documento_id) REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.documentos_backfill_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'documentos_backfill_jobs_empresa_fk'
     ) THEN
    ALTER TABLE public.documentos_backfill_jobs
      ADD CONSTRAINT documentos_backfill_jobs_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_backfill_jobs_documento_prompt
  ON public.documentos_backfill_jobs (documento_id, prompt_codigo);

CREATE INDEX IF NOT EXISTS idx_documentos_backfill_jobs_dispatch
  ON public.documentos_backfill_jobs (status, prioridade, disponivel_em, criado_em);

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_103()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.documentos_backfill_jobs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_documentos_backfill_jobs_atualizado ON public.documentos_backfill_jobs;
    CREATE TRIGGER trg_documentos_backfill_jobs_atualizado
      BEFORE UPDATE ON public.documentos_backfill_jobs
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_103();
  END IF;
END $$;
