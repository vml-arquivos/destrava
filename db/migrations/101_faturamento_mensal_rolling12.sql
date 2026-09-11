-- Migration 101 — faturamento mensal por competência (base para a janela móvel
-- de 12 meses). Idempotente e aditiva. Não toca em nenhuma tabela ou coluna
-- existente relacionada a faturamento (ex.: os campos extraídos do documento
-- `faturamento_12_meses` em extracaoDocumentalLocal.ts continuam existindo e
-- funcionando exatamente como antes); esta migration ADICIONA um registro
-- estruturado, um valor por competência (ano/mês), ao lado do que já existe.
--
-- Contexto (Missão de evolução do Acervo Documental): o sistema até aqui só
-- guarda o faturamento como texto/metadado dentro do documento anexado, sem
-- um valor por competência que possa ser somado numa janela móvel de 12
-- meses. Isso impede, por exemplo, consolidar meses em que a empresa era
-- Lucro Presumido com meses em que passou a ser Lucro Real dentro da mesma
-- janela de 12 meses (uma mudança de regime no meio do caminho não pode
-- exigir um único tipo de documento cobrindo os 12 meses inteiros). Esta
-- tabela guarda um valor por competência, sem nunca ser sobrescrita por uma
-- evidência mais fraca (ver faturamentoRolling12MesesService.ts).

CREATE TABLE IF NOT EXISTS public.empresas_faturamento_mensal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  valor NUMERIC(18,2) NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'documento',
  documento_id UUID NULL,
  regime_no_periodo TEXT NULL,
  confianca NUMERIC(4,3) NULL,
  observacao TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT empresas_faturamento_mensal_mes_valido CHECK (mes >= 1 AND mes <= 12)
);

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.empresas_faturamento_mensal') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_faturamento_mensal_empresa_fk'
     ) THEN
    ALTER TABLE public.empresas_faturamento_mensal
      ADD CONSTRAINT empresas_faturamento_mensal_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.empresas_faturamento_mensal') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_faturamento_mensal_documento_fk'
     ) THEN
    ALTER TABLE public.empresas_faturamento_mensal
      ADD CONSTRAINT empresas_faturamento_mensal_documento_fk
      FOREIGN KEY (documento_id) REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Um único valor por empresa/competência: o serviço faz upsert lógico (nunca
-- duas linhas para o mesmo ano/mês), preservando sempre a evidência de maior
-- confiança já registrada em vez de duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturamento_mensal_empresa_competencia
  ON public.empresas_faturamento_mensal (empresa_id, ano, mes);

CREATE INDEX IF NOT EXISTS idx_faturamento_mensal_empresa
  ON public.empresas_faturamento_mensal (empresa_id, ano, mes);

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_101()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.empresas_faturamento_mensal') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_faturamento_mensal_atualizado ON public.empresas_faturamento_mensal;
    CREATE TRIGGER trg_faturamento_mensal_atualizado
      BEFORE UPDATE ON public.empresas_faturamento_mensal
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_101();
  END IF;
END $$;
