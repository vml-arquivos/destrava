import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const indexSource = readFileSync(resolve(root, 'server/index.ts'), 'utf8');
const migrationSource = readFileSync(resolve(root, 'db/migrations/105_recadastro_registros_removidos.sql'), 'utf8');
const monolithicMigrationSource = readFileSync(resolve(root, 'db/migrate.sql'), 'utf8');

describe('cadastros removidos e recadastro', () => {
  it('mantém unicidade de empresa somente para registros não removidos', () => {
    expect(indexSource).toContain("AND COALESCE(cadastro_status, '') <> 'removido'");
    expect(migrationSource).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_cnpj_unico_ativo[\s\S]*?COALESCE\(cadastro_status, ''\) <> 'removido'/);
    expect(monolithicMigrationSource).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_cnpj_unico_ativo[\s\S]*?COALESCE\(cadastro_status, ''\) <> 'removido'/);
  });

  it('permite reutilizar CPF de cliente PF inativo/removido sem perder unicidade dos ativos', () => {
    expect(indexSource).toMatch(/FROM clientes_pf[\s\S]*?COALESCE\(ativo, true\) = true[\s\S]*?COALESCE\(cadastro_status, ''\) <> 'removido'/);
    expect(migrationSource).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pf_cpf_unico_ativo[\s\S]*?COALESCE\(ativo, true\) = true[\s\S]*?COALESCE\(cadastro_status, ''\) <> 'removido'/);
    expect(migrationSource).toContain("DROP CONSTRAINT IF EXISTS %I");
  });

  it('não contabiliza clientes PF removidos na área de cadastros incompletos', () => {
    const section = indexSource.slice(indexSource.indexOf('app.get("/api/cadastros-incompletos"'), indexSource.indexOf('// ─── AÇÕES DA ÁREA DE CADASTROS INCOMPLETOS'));
    expect(section).toContain('COALESCE(ativo, true) = true');
    expect(section).toContain("COALESCE(cadastro_status, '') <> 'removido'");
  });

  it('não devolve removidos nas listas principais, busca e catálogo unificado', () => {
    expect(indexSource).toContain('COALESCE(e.cadastro_status, \'\') <> \'removido\'');
    expect(indexSource).toContain('COALESCE(c.cadastro_status, \'\') <> \'removido\'');
    expect(indexSource).toContain("COALESCE(c.ativo, true) = true");
    expect(indexSource).toContain("COALESCE(e.arquivado_por_duplicidade, false) = false");
  });

  it('não deixa lead removido bloquear o mesmo CPF/CNPJ', () => {
    const helperStart = indexSource.indexOf('async function existeLeadComDocumento');
    const helperEnd = indexSource.indexOf('async function getTableColumns', helperStart);
    const helper = indexSource.slice(helperStart, helperEnd);
    expect(helper).toContain("COALESCE(arquivado_por_duplicidade, false) = false");
    expect(helper).toContain("COALESCE(cadastro_status, '') <> 'removido'");
    expect(migrationSource).toMatch(/ux_leads_documento_unico_ativo[\s\S]*?COALESCE\(cadastro_status, ''\) <> 'removido'/);
  });
});
