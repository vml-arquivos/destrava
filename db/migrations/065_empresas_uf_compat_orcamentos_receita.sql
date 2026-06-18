-- 065_empresas_uf_compat_orcamentos_receita.sql
-- Compatibilidade sem regressão: algumas rotas legadas ainda referenciam empresas.uf,
-- enquanto o cadastro principal usa empresas.estado. Mantém os dois campos sincronizados.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS uf TEXT;

UPDATE public.empresas
   SET uf = UPPER(SUBSTRING(COALESCE(NULLIF(TRIM(uf), ''), NULLIF(TRIM(estado), '')) FROM 1 FOR 2))
 WHERE COALESCE(NULLIF(TRIM(uf), ''), '') = ''
   AND COALESCE(NULLIF(TRIM(estado), ''), '') <> '';

UPDATE public.empresas
   SET estado = UPPER(SUBSTRING(COALESCE(NULLIF(TRIM(estado), ''), NULLIF(TRIM(uf), '')) FROM 1 FOR 2))
 WHERE COALESCE(NULLIF(TRIM(estado), ''), '') = ''
   AND COALESCE(NULLIF(TRIM(uf), ''), '') <> '';

CREATE OR REPLACE FUNCTION public.sincronizar_empresas_estado_uf()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado IS NOT NULL AND TRIM(NEW.estado) <> '' THEN
    NEW.estado := UPPER(SUBSTRING(TRIM(NEW.estado) FROM 1 FOR 2));
  END IF;

  IF NEW.uf IS NOT NULL AND TRIM(NEW.uf) <> '' THEN
    NEW.uf := UPPER(SUBSTRING(TRIM(NEW.uf) FROM 1 FOR 2));
  END IF;

  IF (NEW.uf IS NULL OR TRIM(NEW.uf) = '') AND NEW.estado IS NOT NULL AND TRIM(NEW.estado) <> '' THEN
    NEW.uf := NEW.estado;
  END IF;

  IF (NEW.estado IS NULL OR TRIM(NEW.estado) = '') AND NEW.uf IS NOT NULL AND TRIM(NEW.uf) <> '' THEN
    NEW.estado := NEW.uf;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresas_estado_uf_sync ON public.empresas;

CREATE TRIGGER trg_empresas_estado_uf_sync
BEFORE INSERT OR UPDATE OF estado, uf ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_empresas_estado_uf();

CREATE INDEX IF NOT EXISTS idx_empresas_uf ON public.empresas(uf);

GRANT SELECT, INSERT, UPDATE ON public.empresas TO destravadb;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO destravadb;
