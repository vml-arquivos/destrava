-- Migration 043: Tabela de logs de auditoria
-- Registra ações críticas realizadas por usuários no sistema.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome  TEXT,
  usuario_cargo TEXT,
  acao          TEXT NOT NULL,          -- ex: 'lead.status_alterado', 'contrato.gerado', 'empresa.editada'
  entidade      TEXT,                   -- ex: 'lead', 'empresa', 'contrato', 'usuario'
  entidade_id   INTEGER,                -- ID do registro afetado
  dados_antes   JSONB,                  -- snapshot antes da alteração
  dados_depois  JSONB,                  -- snapshot depois da alteração
  ip            TEXT,
  user_agent    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario_id  ON audit_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entidade     ON audit_logs(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_acao         ON audit_logs(acao);
CREATE INDEX IF NOT EXISTS idx_audit_logs_criado_em    ON audit_logs(criado_em DESC);

COMMENT ON TABLE audit_logs IS 'Registro imutável de ações críticas realizadas por usuários no sistema Destrava.';
