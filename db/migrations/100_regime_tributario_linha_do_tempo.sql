-- Migration 100 — linha do tempo do regime tributário (histórico versionado).
-- Idempotente e aditiva. Não apaga nem altera o campo público.empresas.regime_tributario
-- (que continua sendo o "regime vigente" consumido pelo restante do sistema); esta
-- migration ADICIONA um histórico completo ao lado dele, sem substituir nada.
--
-- Contexto (Missão de evolução do Acervo Documental, seção 11): o sistema até aqui só
-- guarda "regime_tributario" como um valor único e atual. Isso não permite responder
-- "qual era o regime da empresa em 12/2025?" nem impede que um documento histórico
-- (ex.: um PGDAS-D de um período em que a empresa ainda era Simples Nacional)
-- contamine, por engano, o regime considerado vigente hoje. Esta tabela guarda cada
-- período do regime tributário com data de início/fim, a fonte da informação, a
-- confiança da leitura e o documento que serviu de evidência -- sem nunca ser
-- reescrita: um novo regime fecha o período anterior (preenchendo data_fim) e abre
-- um novo período, preservando o histórico completo.

CREATE TABLE IF NOT EXISTS public.empresas_regime_tributario_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  regime TEXT NOT NULL,
  data_inicio DATE NULL,
  data_fim DATE NULL,
  fonte TEXT NOT NULL DEFAULT 'documento',
  confianca NUMERIC(4,3) NULL,
  documento_evidencia_id UUID NULL,
  observacao TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.empresas_regime_tributario_historico') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_regime_historico_empresa_fk'
     ) THEN
    ALTER TABLE public.empresas_regime_tributario_historico
      ADD CONSTRAINT empresas_regime_historico_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.empresas_regime_tributario_historico') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_regime_historico_documento_fk'
     ) THEN
    ALTER TABLE public.empresas_regime_tributario_historico
      ADD CONSTRAINT empresas_regime_historico_documento_fk
      FOREIGN KEY (documento_evidencia_id) REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_regime_historico_empresa_periodo
  ON public.empresas_regime_tributario_historico (empresa_id, data_inicio, data_fim);

-- No máximo um período "vigente" (data_fim IS NULL) por empresa: o registrador
-- (regimeTributarioTemporalService.ts) sempre fecha o período aberto anterior antes
-- de abrir um novo, e este índice único é a garantia de banco desse invariante.
CREATE UNIQUE INDEX IF NOT EXISTS uq_regime_historico_periodo_vigente
  ON public.empresas_regime_tributario_historico (empresa_id)
  WHERE data_fim IS NULL;

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_100()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.empresas_regime_tributario_historico') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_regime_historico_atualizado ON public.empresas_regime_tributario_historico;
    CREATE TRIGGER trg_regime_historico_atualizado
      BEFORE UPDATE ON public.empresas_regime_tributario_historico
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_100();
  END IF;
END $$;
