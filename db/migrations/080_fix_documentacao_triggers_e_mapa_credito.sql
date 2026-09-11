BEGIN;

CREATE OR REPLACE FUNCTION public.atualizar_atualizacao_em_documentacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizacao_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_documentacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documentacao_blocos_atualizacao_em ON public.documentacao_blocos;
CREATE TRIGGER trg_documentacao_blocos_atualizacao_em
BEFORE UPDATE ON public.documentacao_blocos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentacao_entidade_blocos_atualizacao_em ON public.documentacao_entidade_blocos;
CREATE TRIGGER trg_documentacao_entidade_blocos_atualizacao_em
BEFORE UPDATE ON public.documentacao_entidade_blocos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentacao_bloco_arquivos_atualizacao_em ON public.documentacao_bloco_arquivos;
CREATE TRIGGER trg_documentacao_bloco_arquivos_atualizacao_em
BEFORE UPDATE ON public.documentacao_bloco_arquivos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentos_extracoes_ia_atualizacao_em ON public.documentos_extracoes_ia;
CREATE TRIGGER trg_documentos_extracoes_ia_atualizacao_em
BEFORE UPDATE ON public.documentos_extracoes_ia
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentacao_analises_ia_atualizacao_em ON public.documentacao_analises_ia;
CREATE TRIGGER trg_documentacao_analises_ia_atualizacao_em
BEFORE UPDATE ON public.documentacao_analises_ia
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_documentacao();

COMMIT;
