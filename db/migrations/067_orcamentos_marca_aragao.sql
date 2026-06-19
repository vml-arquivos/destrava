-- 067_orcamentos_marca_aragao.sql
-- Permite a seleção da empresa prestadora Aragão Serviços nos orçamentos.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.orcamentos_timbrados'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%marca%'
  LOOP
    EXECUTE format('ALTER TABLE public.orcamentos_timbrados DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.orcamentos_timbrados
ADD CONSTRAINT orcamentos_timbrados_marca_check
CHECK (marca IN ('destrava','permupay','aragao'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados_anexos TO destravadb;
