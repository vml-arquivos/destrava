-- Migration 105 — recadastro após exclusão/arquivamento.
-- Remove UNIQUE documental legado e restringe a unicidade aos registros reutilizáveis.
-- Não apaga dados nem reativa registros removidos.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'empresas'
         AND con.contype = 'u'
         AND (
           SELECT array_to_string(array_agg(att.attname::TEXT ORDER BY ordinality), ',')
             FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
         ) = 'cnpj'
    LOOP
      EXECUTE format('ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;
  END IF;

  IF to_regclass('public.clientes_pf') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'clientes_pf'
         AND con.contype = 'u'
         AND (
           SELECT array_to_string(array_agg(att.attname::TEXT ORDER BY ordinality), ',')
             FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
         ) = 'cpf'
    LOOP
      EXECUTE format('ALTER TABLE public.clientes_pf DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;
  END IF;

  IF to_regclass('public.leads') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'leads'
         AND con.contype = 'u'
         AND (
           SELECT array_to_string(array_agg(att.attname::TEXT ORDER BY ordinality), ',')
             FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
         ) = 'cpf_cnpj'
    LOOP
      EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.clientes_pf') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.ux_clientes_pf_cpf_unico_ativo;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pf_cpf_unico_ativo
      ON public.clientes_pf ((regexp_replace(COALESCE(cpf,''), '[^0-9]', '', 'g')))
     WHERE length(regexp_replace(COALESCE(cpf,''), '[^0-9]', '', 'g')) = 11
       AND COALESCE(ativo, true) = true
       AND COALESCE(arquivado_por_duplicidade, false) = false
       AND COALESCE(cadastro_status, '') <> 'removido';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.ux_empresas_cnpj_unico_ativo;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_cnpj_unico_ativo
      ON public.empresas ((regexp_replace(COALESCE(cnpj,''), '[^0-9]', '', 'g')))
     WHERE length(regexp_replace(COALESCE(cnpj,''), '[^0-9]', '', 'g')) = 14
       AND COALESCE(arquivado_por_duplicidade, false) = false
       AND COALESCE(cadastro_status, '') <> 'removido';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.ux_leads_documento_unico_ativo;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_documento_unico_ativo
      ON public.leads ((regexp_replace(COALESCE(cpf_cnpj,''), '[^0-9]', '', 'g')))
     WHERE length(regexp_replace(COALESCE(cpf_cnpj,''), '[^0-9]', '', 'g')) IN (11,14)
       AND COALESCE(arquivado_por_duplicidade, false) = false
       AND COALESCE(cadastro_status, '') <> 'removido';
  END IF;
END $$;
