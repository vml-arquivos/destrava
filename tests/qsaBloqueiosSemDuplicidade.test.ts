import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  buscarUltimaAnaliseCnpjEmpresa: vi.fn(),
}));
vi.mock('pg', () => {
  class PoolMock { query = mocks.poolQuery; }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});
vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({
  analisarCnpjReceitaCartaoEmpresa: vi.fn(),
  buscarUltimaAnaliseCnpjEmpresa: mocks.buscarUltimaAnaliseCnpjEmpresa,
  limparAnalisesCnpjEmpresa: vi.fn(),
}));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({ analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn() } }));

// CORREÇÃO (2026-08-31, Rodada 15 -- print real da empresa "44.598.036 PAULO
// BOLSONI BALDI", pedido explícito do usuário: "tire esse monte de poluição
// visual e diagnosticos errados"): mesmo problema estrutural já corrigido
// para o Enquadramento Tributário (ver tests/avisosEnquadramentoTributarioSemDuplicidade.test.ts),
// agora no QSA -- antes desta correção, toda vez que havia UMA pendência
// grave no QSA (`qsaTemGrave`), DOIS bloqueios apareciam em "Ação
// necessária" sobre ela: um genérico ("QSA tem divergências societárias
// relevantes.") e um específico (a mensagem real da pendência, ex. "Não foi
// possível identificar os nomes dos sócios no QSA."). O bloqueio genérico
// nunca acrescentava informação nova -- as duas mensagens sempre coexistiam
// porque vinham da MESMA pendência (`params.qsaPendencias`, consumida tanto
// por `qsaTemGrave` quanto pelo loop de `todasPendencias`).
describe('avaliarProntidaoIdentidadeCnpj -- bloqueios do QSA não duplicam a mesma pendência', () => {
  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); mocks.buscarUltimaAnaliseCnpjEmpresa.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it('quando há uma pendência grave de QSA com mensagem própria, mostra só essa mensagem -- não também o resumo genérico', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const mensagemEspecifica = 'Não foi possível identificar os nomes dos sócios no QSA.';
    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-1',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [{ codigo: 'qsa_socios_nao_extraidos', mensagem: mensagemEspecifica, severidade: 'alta' }],
      enquadramentoPendencias: [],
      qsaDados: { anexado: true, analisado: true, cnpj: '44.598.036/0001-94', razao_social: '44.598.036 PAULO BOLSONI BALDI', socios: [] },
      enquadramentoDados: { anexado: true, analisado: true, situacao_simples: 'MEI' },
    });

    const bloqueios: string[] = resultado.motivos_pendentes || [];
    const mencoesQsa = bloqueios.filter((mensagem) => /QSA|sócios/i.test(mensagem));
    expect(mencoesQsa).toHaveLength(1);
    expect(mencoesQsa[0]).toBe(mensagemEspecifica);
    expect(bloqueios).not.toEqual(expect.arrayContaining([expect.stringMatching(/QSA tem divergências societárias relevantes\./)]));
  });

  it('quando há uma pendência grave de QSA SEM mensagem própria, ainda mostra o resumo genérico (sem regressão)', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-2',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [{ codigo: 'qsa_divergencia_grave', mensagem: '', severidade: 'alta' }],
      enquadramentoPendencias: [],
      qsaDados: { anexado: true, analisado: true, cnpj: '44.598.036/0001-94', razao_social: '44.598.036 PAULO BOLSONI BALDI', socios: [] },
      enquadramentoDados: { anexado: true, analisado: true, situacao_simples: 'MEI' },
    });

    const bloqueios: string[] = resultado.motivos_pendentes || [];
    expect(bloqueios).toEqual(expect.arrayContaining(['QSA tem divergências societárias relevantes.']));
  });
});
