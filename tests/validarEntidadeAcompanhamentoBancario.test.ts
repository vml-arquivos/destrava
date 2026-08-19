import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Bug relatado pelo usuário (zip 10): o upload de um extrato bancário no
// Acompanhamento Bancário (entidade_tipo='acompanhamento_bancario') caía no
// fallback genérico `return {}` de `validarEntidade` (server/routes/documentos.ts) --
// que nem confirma que o acompanhamento existe, nem resolve `empresa_id` a
// partir do banco. O `documentos_arquivos.empresa_id` ficava dependendo
// inteiramente do que o cliente enviasse em `req.body.empresa_id`; se esse
// campo viesse vazio/errado (ex.: corrida de carregamento no front), o
// documento era salvo com `empresa_id` divergente ou nulo. A leitura do
// extrato (`analisarExtratoBancario` -> `carregarContexto`) exige
// `documento.empresa_id === empresaId` e rejeita silenciosamente quando isso
// não bate -- daí a leitura "não rodar" sem nenhum aviso claro. Este teste
// prova que `validarEntidade` agora resolve e confirma o empresa_id a partir
// do próprio registro do acompanhamento no banco, do mesmo jeito que já faz
// para 'socio' e 'contrato'.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

describe('validarEntidade -- acompanhamento_bancario resolve empresa_id a partir do banco', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('resolve empresa_id do próprio acompanhamento, mesmo sem body.empresa_id', async () => {
    mocks.poolQuery.mockImplementation(async (text: string, params?: any[]) => {
      if (String(text).includes('FROM information_schema.tables')) return { rows: [{ '?column?': 1 }] };
      if (String(text).includes('FROM public.acompanhamentos_bancarios')) {
        return params?.[0] === '11111111-1111-4111-8111-111111111111' ? { rows: [{ empresa_id: '33333333-3333-4333-8333-333333333333' }] } : { rows: [] };
      }
      return { rows: [] };
    });
    const { validarEntidade } = await import('../server/routes/documentos');

    const refs = await validarEntidade('acompanhamento_bancario', '11111111-1111-4111-8111-111111111111', {});
    expect(refs).toEqual({ empresa_id: '33333333-3333-4333-8333-333333333333' });
  });

  it('rejeita quando o acompanhamento informado não existe', async () => {
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (String(text).includes('FROM information_schema.tables')) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    });
    const { validarEntidade } = await import('../server/routes/documentos');

    await expect(validarEntidade('acompanhamento_bancario', '22222222-2222-4222-8222-222222222222', {})).rejects.toThrow('Acompanhamento bancário não encontrado.');
  });

  it('rejeita quando o empresa_id enviado pelo cliente diverge do dono real do acompanhamento', async () => {
    mocks.poolQuery.mockImplementation(async (text: string, params?: any[]) => {
      if (String(text).includes('FROM information_schema.tables')) return { rows: [{ '?column?': 1 }] };
      if (String(text).includes('FROM public.acompanhamentos_bancarios')) {
        return params?.[0] === '11111111-1111-4111-8111-111111111111' ? { rows: [{ empresa_id: '33333333-3333-4333-8333-333333333333' }] } : { rows: [] };
      }
      return { rows: [] };
    });
    const { validarEntidade } = await import('../server/routes/documentos');

    await expect(validarEntidade('acompanhamento_bancario', '11111111-1111-4111-8111-111111111111', { empresa_id: '44444444-4444-4444-8444-444444444444' }))
      .rejects.toThrow('empresa_id não confere com o acompanhamento bancário informado.');
  });
});
