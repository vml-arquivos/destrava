import { describe, expect, it } from 'vitest';
import { validarSqlSomenteLeitura } from '../server/services/adminSqlReadOnly';

describe('SQL administrativo somente leitura', () => {
  it('aceita SELECT/CTE únicos e ignora palavras em literais', () => {
    expect(validarSqlSomenteLeitura("SELECT 'delete from empresas' AS texto;").ok).toBe(true);
    expect(validarSqlSomenteLeitura('WITH x AS (SELECT 1) SELECT * FROM x').ok).toBe(true);
  });

  it('bloqueia escrita, SELECT INTO e múltiplas instruções', () => {
    for (const sql of ['DELETE FROM empresas', 'SELECT * INTO copia FROM empresas', 'SELECT 1; DROP TABLE empresas']) {
      expect(validarSqlSomenteLeitura(sql).ok).toBe(false);
    }
  });
});
