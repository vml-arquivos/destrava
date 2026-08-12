import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regra de negócio: "O Enquadramento Tributário NÃO EXISTE como documento físico a
// ser anexado. Essa informação vem estritamente da consulta do CNPJ." Antes desta
// correção, `montarEnquadramentoDados` sempre exigia um arquivo anexado
// (`enquadramento_tributario_cnpj`/`simples_nacional`) para considerar a Fase 1
// completa -- mesmo que o regime tributário já estivesse identificado pela
// sincronização de CNPJ/Receita (`empresas.regime_tributario`/`opcao_simples`/
// `opcao_mei`). Este teste garante que, quando a Receita já identificou o regime,
// a Fase 1 não fica mais bloqueada esperando um upload -- e que, quando a Receita
// NUNCA identificou nada e não há upload, o bloqueio continua existindo (não é uma
// remoção cega da validação, só da exigência de anexo físico).

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn().mockResolvedValue({ rows: [] }) }));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({
  analisarCnpjReceitaCartaoEmpresa: vi.fn(),
  buscarUltimaAnaliseCnpjEmpresa: vi.fn(),
  limparAnalisesCnpjEmpresa: vi.fn(),
}));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({
  analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn() },
}));

const EMPRESA_ID = '74ab11d8-f53f-46b0-b4d7-48abef7c7ff6';

describe('montarEnquadramentoDados -- Enquadramento Tributário sem exigir anexo físico', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockClear();
    mocks.poolQuery.mockResolvedValue({ rows: [] }); // tableExists('documentos_arquivos') -> false -> sem documentos anexados
  });
  afterEach(() => vi.clearAllMocks());

  it('não bloqueia quando o regime tributário já foi identificado pela consulta de CNPJ (regime_tributario), mesmo sem nenhum upload', async () => {
    const { montarEnquadramentoDados } = await import('../server/routes/documentacao');
    const resultado = await montarEnquadramentoDados(EMPRESA_ID, false, { regime_tributario: 'Simples Nacional', opcao_simples: true, opcao_mei: false });
    expect(resultado.dados.anexado).toBe(false);
    expect(resultado.dados.analisado).toBe(true);
    expect(resultado.dados.regime_tributario).toBe('Simples Nacional');
    expect(resultado.pendencias).toEqual([]);
  });

  it('não bloqueia quando só opcao_mei está sincronizada (sem regime_tributario textual)', async () => {
    const { montarEnquadramentoDados } = await import('../server/routes/documentacao');
    const resultado = await montarEnquadramentoDados(EMPRESA_ID, false, { regime_tributario: null, opcao_simples: false, opcao_mei: true });
    expect(resultado.dados.analisado).toBe(true);
    expect(resultado.pendencias).toEqual([]);
  });

  it('continua bloqueando (pendência severidade alta) quando a Receita nunca sincronizou nada e não há upload', async () => {
    const { montarEnquadramentoDados } = await import('../server/routes/documentacao');
    const resultado = await montarEnquadramentoDados(EMPRESA_ID, false, { regime_tributario: null, opcao_simples: null, opcao_mei: null });
    expect(resultado.dados.anexado).toBe(false);
    expect(resultado.dados.analisado).toBe(false);
    expect(resultado.pendencias).toHaveLength(1);
    expect(resultado.pendencias[0].severidade).toBe('alta');
  });

  it('trata empresa ausente/undefined sem lançar exceção (mesmo comportamento do bloqueio acima)', async () => {
    const { montarEnquadramentoDados } = await import('../server/routes/documentacao');
    const resultado = await montarEnquadramentoDados(EMPRESA_ID, false, null);
    expect(resultado.dados.analisado).toBe(false);
    expect(resultado.pendencias).toHaveLength(1);
  });
});
