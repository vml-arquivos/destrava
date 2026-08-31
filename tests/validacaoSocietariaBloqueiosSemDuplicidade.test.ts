import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('pg', () => {
  class PoolMock { query = mocks.poolQuery; }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});
vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({ analisarCnpjReceitaCartaoEmpresa: vi.fn(), buscarUltimaAnaliseCnpjEmpresa: vi.fn(), limparAnalisesCnpjEmpresa: vi.fn() }));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({ analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn() } }));

// CORREÇÃO (2026-08-31, pedido explícito do usuário -- print real mostrando
// dois avisos quase idênticos sobre Atos da Junta ao mesmo tempo, "tire esse
// monte de texto e informação desnecessária"): antes desta correção, sempre
// que uma empresa não-MEI ainda não tinha anexado nenhum Ato da Junta, DOIS
// bloqueios com a mesma ideia apareciam juntos -- "Nenhum Ato da Junta foi
// localizado..." e "Nenhum ato registrado foi identificado...", o segundo
// vindo de `cadeia.possivel_registro_em_outro_orgao`, que é `true` sempre que
// o histórico está vazio (inclusive quando isso só significa "nada foi
// anexado ainda"). O segundo bloqueio agora só aparece quando algo FOI
// anexado e mesmo assim nenhum registro histórico foi identificado -- um
// sinal genuinamente diferente do primeiro.
describe('montarValidacaoSocietaria -- bloqueios do Atos da Junta não duplicam a mesma informação', () => {
  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it('quando nenhum Ato da Junta foi anexado, mostra só UM bloqueio sobre isso -- não dois', async () => {
    const { montarValidacaoSocietaria } = await import('../server/routes/documentacao');
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM public.documentos_arquivos')) return { rows: [] };
      return { rows: [] };
    });

    const resultado = await montarValidacaoSocietaria('empresa-1', false, { empresa: {}, enquadramentoDados: {} });

    const mencoesAtosDaJunta = (resultado.bloqueios || []).filter((mensagem: string) => /ato da junta|ato registrado/i.test(mensagem));
    expect(mencoesAtosDaJunta).toHaveLength(1);
    expect(mencoesAtosDaJunta[0]).toMatch(/Nenhum Ato da Junta foi localizado/);
    expect(resultado.bloqueios).not.toEqual(expect.arrayContaining([expect.stringMatching(/Nenhum ato registrado foi identificado/)]));
  });
});
