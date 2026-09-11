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

// CORREÇÃO (2026-08-31, pedido explícito do usuário -- print real da empresa
// "B1 SAUDE E ESTETICA LTDA" (Simples Nacional) mostrando "Etapa 1
// validada... 4 avisos", quase todos sobre o mesmo Enquadramento Tributário,
// "tire esse monte de texto e informação desnecessária"): antes desta
// correção, toda vez que havia UMA pendência grave no Enquadramento
// Tributário, DOIS avisos apareciam sobre ela -- um genérico ("precisa de
// revisão humana", sem dizer o motivo) e um específico (a mensagem real da
// pendência, com o motivo exato). O aviso genérico nunca acrescentava
// informação nova.
describe('avaliarProntidaoIdentidadeCnpj -- avisos do Enquadramento Tributário não duplicam a mesma pendência', () => {
  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); mocks.buscarUltimaAnaliseCnpjEmpresa.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it('quando há uma pendência grave de enquadramento com mensagem própria, mostra só essa mensagem -- não também o resumo genérico', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const mensagemEspecifica = 'A leitura do comprovante de enquadramento teve confiança baixa (42%) e não pôde confirmar o CNPJ do documento.';
    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-1',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [],
      enquadramentoPendencias: [{ codigo: 'enquadramento_confianca_baixa', mensagem: mensagemEspecifica, severidade: 'alta' }],
      qsaDados: { anexado: true, analisado: true, cnpj: '64.753.665/0001-59', razao_social: 'B1 Saude e Estetica Ltda', capital_social: 10000, socios: [{ nome: 'Fulana de Tal', administrador: true }] },
      enquadramentoDados: { anexado: true, analisado: true, situacao_simples: 'Optante do Simples Nacional' },
    });

    const avisos: string[] = resultado.avisos_estrategicos || [];
    const mencoesEnquadramento = avisos.filter((mensagem) => /enquadramento/i.test(mensagem));
    expect(mencoesEnquadramento).toHaveLength(1);
    expect(mencoesEnquadramento[0]).toBe(mensagemEspecifica);
    expect(avisos).not.toEqual(expect.arrayContaining([expect.stringMatching(/precisa de revisão humana \(divergência ou baixa confiança/)]));
  });
});
