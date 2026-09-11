BEGIN;

-- Busca rápida do catálogo PJ/PF consumido pelo Nexus.
-- Idempotente e sem alteração de dados: adiciona somente extensão e índices.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_empresas_nexus_catalogo_busca_trgm
  ON empresas USING GIN (
    lower(
      COALESCE(razao_social,'') || ' ' || COALESCE(nome_fantasia,'') || ' ' ||
      COALESCE(cnpj,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_clientes_pf_nexus_catalogo_busca_trgm
  ON clientes_pf USING GIN (
    lower(
      COALESCE(nome,'') || ' ' || COALESCE(cpf,'') || ' ' ||
      COALESCE(email,'') || ' ' || COALESCE(telefone,'')
    ) gin_trgm_ops
  );

COMMIT;
