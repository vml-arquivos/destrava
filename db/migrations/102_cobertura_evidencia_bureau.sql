-- Migration 102 — cobertura de evidência entre bureaus (SCR/CCS/CCF/CENPROT/
-- CADIN/PGFN/CND/CNDT/Situação Fiscal/Serasa). Idempotente e aditiva. Não
-- altera em nada o upload por slot já existente (`documentos_arquivos.tipo_documento`
-- continua sendo o mesmo campo, com os mesmos tipos: scr_cnpj, ccs_cnpj,
-- ccf_cnpj etc.) -- esta tabela ADICIONA, por documento, quais requisitos de
-- consulta cadastral aquele arquivo efetivamente comprova, além do próprio
-- slot em que foi anexado.
--
-- Contexto (Missão de evolução do Acervo Documental): hoje um relatório de
-- bureau que já traga SCR + CCF + score numa página só (comum em relatórios
-- consolidados) só é reconhecido como o slot em que foi literalmente anexado
-- -- não há como um único arquivo "contar" para mais de um requisito sem
-- pedir novo upload duplicado para cada um. Esta tabela guarda, para cada
-- documento, a lista de requisitos que ele efetivamente cobre (podem ser
-- vários), com o status de cobertura granular (uma CND negativa não é o
-- mesmo que uma Certidão Positiva com Efeito de Negativa, que por sua vez
-- não é o mesmo que uma Certidão Positiva pura -- tratar as três como
-- equivalentes seria esconder risco).

CREATE TABLE IF NOT EXISTS public.document_evidence_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL,
  requirement_code TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  confidence NUMERIC(4,3) NULL,
  source_section TEXT NULL,
  extracted_value JSONB NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.document_evidence_coverage') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'document_evidence_coverage_documento_fk'
     ) THEN
    ALTER TABLE public.document_evidence_coverage
      ADD CONSTRAINT document_evidence_coverage_documento_fk
      FOREIGN KEY (documento_id) REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Um documento só tem UMA linha de cobertura por requisito (nunca duplica);
-- o serviço faz upsert lógico, preservando sempre a evidência de maior
-- confiança já registrada para aquele par (documento, requisito).
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_coverage_documento_requisito
  ON public.document_evidence_coverage (documento_id, requirement_code);

CREATE INDEX IF NOT EXISTS idx_evidence_coverage_requisito
  ON public.document_evidence_coverage (requirement_code);

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_102()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.document_evidence_coverage') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_evidence_coverage_atualizado ON public.document_evidence_coverage;
    CREATE TRIGGER trg_evidence_coverage_atualizado
      BEFORE UPDATE ON public.document_evidence_coverage
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_102();
  END IF;
END $$;
