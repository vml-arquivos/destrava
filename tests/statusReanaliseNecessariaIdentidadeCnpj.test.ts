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

// CORREÇÃO (2026-09-05, Rodada 32 -- print real da tela em produção, empresa
// MEI "VILSON MARCIO DE LIMA 70010668187", pedido explícito do usuário depois
// de já ter recebido a Rodada 31: "subi a atualização... mas continua com a
// mesma mensagem no QSA... que não existia antes, que já identificava
// corretamente quando é MEI"): a Rodada 31 corrigiu o selo do Acervo
// Documental (`estadoVisualDocumento`, shared/documentalPresentation.ts) para
// um laudo desatualizado pelo versionamento, mas o card equivalente da seção
// "Identidade do CNPJ" (QSA/Enquadramento Tributário, no topo da tela) usa um
// caminho de dados TOTALMENTE separado (`statusDocumento`, dentro de
// `avaliarProntidaoIdentidadeCnpj`, server/routes/documentacao.ts) que aquela
// correção não tocava -- e que jogava fora o sinal `status_leitura:
// 'reanalise_necessaria'` já calculado corretamente por
// `montarQsaDocumentalDados`/`montarEnquadramentoDados`, mostrando o selo
// genérico "Aguardando análise" em vez de "Reanálise necessária" ao lado do
// texto certo explicando o motivo. Este teste prova que o status exposto ao
// frontend (`documentos_iniciais.qsa.status`/`.enquadramento_tributario.status`)
// agora distingue os dois casos -- para QUALQUER empresa/regime, sem exceção,
// já que os dois passam pela mesma função `statusDocumento`.
describe('avaliarProntidaoIdentidadeCnpj -- laudo de QSA/Enquadramento marcado desatualizado pelo versionamento não é confundido com "nunca lido"', () => {
  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); mocks.buscarUltimaAnaliseCnpjEmpresa.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it('QSA com status_leitura "reanalise_necessaria" expõe documentos_iniciais.qsa.status = "reanalise_necessaria" (não "aguardando_analise")', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const diagnosticoStale = 'O motor de leitura do QSA foi atualizado desde a última análise. Uma nova leitura é necessária para confirmar o resultado -- clique em "Forçar nova leitura" no Acervo Documental.';
    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-vilson',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [],
      enquadramentoPendencias: [],
      qsaDados: { anexado: true, analisado: false, tentativa_realizada: true, status_leitura: 'reanalise_necessaria', diagnostico: diagnosticoStale },
      enquadramentoDados: { anexado: true, analisado: true, situacao_simples: 'MEI', opcao_mei: true },
    });

    const qsa = resultado.documentos_iniciais.qsa;
    expect(qsa.status).toBe('reanalise_necessaria');
    expect(qsa.status).not.toBe('aguardando_analise');
    expect(qsa.diagnostico).toBe(diagnosticoStale);
  });

  it('Enquadramento Tributário com status_leitura "reanalise_necessaria" expõe o mesmo status distinto (regra geral, não é caso especial do QSA)', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const diagnosticoStale = 'O motor de leitura do Enquadramento Tributário foi atualizado desde a última análise. Uma nova leitura é necessária para confirmar o resultado -- clique em "Forçar nova leitura" no Acervo Documental.';
    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-vilson',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [],
      enquadramentoPendencias: [],
      qsaDados: { anexado: true, analisado: true, cnpj: '29.705.345/0001-22', socios: [{ nome: 'Vilson Marcio de Lima', administrador: true }] },
      enquadramentoDados: { anexado: true, analisado: false, tentativa_realizada: true, status_leitura: 'reanalise_necessaria', diagnostico: diagnosticoStale, opcao_mei: true, situacao_simples: 'MEI' },
    });

    const enquadramento = resultado.documentos_iniciais.enquadramento_tributario;
    expect(enquadramento.status).toBe('reanalise_necessaria');
    expect(enquadramento.status).not.toBe('aguardando_analise');
  });

  it('sem regressão: QSA genuinamente nunca lido (sem status_leitura nenhum) continua "aguardando_analise"', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-nova',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [],
      enquadramentoPendencias: [],
      qsaDados: { anexado: true, analisado: false },
      enquadramentoDados: { anexado: true, analisado: false },
    });

    expect(resultado.documentos_iniciais.qsa.status).toBe('aguardando_analise');
    expect(resultado.documentos_iniciais.enquadramento_tributario.status).toBe('aguardando_analise');
  });

  it('sem regressão: falha real de leitura continua "falha_leitura", mesmo depois desta correção', async () => {
    const { avaliarProntidaoIdentidadeCnpj } = await import('../server/routes/documentacao');
    mocks.buscarUltimaAnaliseCnpjEmpresa.mockResolvedValue(null);

    const resultado = await avaliarProntidaoIdentidadeCnpj({
      empresaId: 'empresa-falha',
      empresa: { situacao_cadastral: 'ATIVA' },
      docsCartao: [{ id: 'cartao-1' }],
      erroProcessamentoCartao: null,
      cnpjPendencias: [],
      qsaPendencias: [],
      enquadramentoPendencias: [],
      qsaDados: { anexado: true, analisado: false, status_leitura: 'falha_leitura', diagnostico: 'QSA: a leitura automática não pôde ser concluída.' },
      enquadramentoDados: { anexado: true, analisado: false },
    });

    expect(resultado.documentos_iniciais.qsa.status).toBe('falha_leitura');
  });
});
