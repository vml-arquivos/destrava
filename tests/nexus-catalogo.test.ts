import { describe, expect, it } from 'vitest';
import { normalizarPaginacaoCatalogo, normalizarTipoCatalogo } from '../server/lib/nexusCatalogo';

describe('catálogo Nexus PJ/PF', () => {
  it.each(['empresa', 'empresas', 'pj', 'cliente_pj', 'clientes_pj'])(
    'normaliza %s como empresa',
    (tipo) => expect(normalizarTipoCatalogo(tipo)).toBe('empresa'),
  );

  it.each(['cliente', 'clientes', 'pf', 'pessoa_fisica', 'cliente_pf', 'clientes_pf'])(
    'normaliza %s como pessoa física',
    (tipo) => expect(normalizarTipoCatalogo(tipo)).toBe('pessoa_fisica'),
  );

  it('mantém todos como catálogo unificado', () => {
    expect(normalizarTipoCatalogo('todos')).toBe('todos');
    expect(normalizarTipoCatalogo(undefined)).toBe('todos');
  });

  it('limita a paginação a 500 registros por página', () => {
    expect(normalizarPaginacaoCatalogo(2, 9999)).toEqual({ page: 2, limit: 500, offset: 500 });
  });

  it('corrige paginação inválida sem lançar erro', () => {
    expect(normalizarPaginacaoCatalogo('abc', 0)).toEqual({ page: 1, limit: 1, offset: 0 });
  });
});
