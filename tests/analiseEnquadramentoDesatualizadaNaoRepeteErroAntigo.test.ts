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

// CORREÇÃO (2026-08-31, Rodada 15): a mesma checagem de obsolescência
// (`analiseDesatualizada`) adicionada em `montarQsaDocumentalDados` foi
// espelhada em `montarEnquadramentoDados` -- mas, sem um teste dedicado,
// nada detectava se essa segunda cópia da checagem fosse removida ou
// quebrada (o teste do QSA só exercita `montarQsaDocumentalDados`). Este
// teste prova a mesma garantia para o Enquadramento Tributário: comprovado
// via reversão -- ao comentar temporariamente a checagem em
// `montarEnquadramentoDados` durante o desenvolvimento desta correção, este
// teste falhou exatamente como esperado, confirmando que ele cobre a
// checagem de verdade.
describe('montarEnquadramentoDados -- laudo de Enquadramento Tributário desatualizado não repete a pendência calculada pela regra antiga', () => {
  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it('quando o laudo persistido tem rule_version diferente da atual, para de repassar o alerta antigo e passa a pedir reanálise', async () => {
    const { montarEnquadramentoDados } = await import('../server/routes/documentacao');
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM information_schema.columns')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM public.documentos_arquivos') && sql.includes('tipo_documento = ANY')) {
        return { rows: [{ id: 'enq-doc-1', tipo_documento: 'simples_nacional', nome_original: 'simples.pdf', criado_em: new Date().toISOString() }] };
      }
      if (sql.includes('FROM public.documentos_extracoes_ia e')) {
        return {
          rows: [{
            resultado: {
              tipo_analise: 'simples_nacional',
              status: 'revisao_humana',
              alertas: [{ codigo: 'enquadramento_confianca_baixa', mensagem: 'A leitura do comprovante de enquadramento teve confiança baixa e não pôde confirmar o CNPJ do documento.', severidade: 'alta' }],
              dados_extraidos: { situacao_simples: null },
            },
            status: 'revisao_humana',
            prompt_versao: '1.0.0',
            id: 'laudo-enq-1',
            analysis_signature: 'assinatura-calculada-pela-regra-antiga',
            classifier_version: 'classifier-antigo',
            extractor_version: 'extractor-antigo',
            rule_version: 'rules-antigo-pre-rodada-13',
            schema_version: 'schema-antigo',
            analysis_status: 'STALE',
            stale_at: new Date().toISOString(),
            satisfaz_requisito: false,
            hash_arquivo: 'hash-enq-1',
          }],
        };
      }
      return { rows: [] };
    });

    const resultado = await montarEnquadramentoDados('empresa-3', false, { regime_tributario: 'Simples Nacional', opcao_simples: true, opcao_mei: false });

    expect(resultado.pendencias.some((p) => /confiança baixa/i.test(p.mensagem))).toBe(false);
    expect(resultado.dados.analisado).toBe(false);
    expect(resultado.dados.diagnostico).toMatch(/atualizado desde a última análise/i);
  });

  it('quando o laudo persistido já está na versão atual, continua repassando os alertas normalmente (sem regressão)', async () => {
    const { montarEnquadramentoDados } = await import('../server/routes/documentacao');
    const { RULE_VERSION, CLASSIFIER_VERSION, EXTRACTOR_VERSION, SCHEMA_VERSION, calcularAssinaturaAnalise } = await import('../server/services/documentalLaudoVersioning');
    const promptVersaoSimples = '1.0.0';
    const assinatura = calcularAssinaturaAnalise({
      arquivoId: 'enq-doc-2',
      arquivoHash: 'hash-enq-2',
      promptCodigo: 'simples_extract',
      promptVersao: promptVersaoSimples,
      classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      ruleVersion: RULE_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM information_schema.columns')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM public.documentos_arquivos') && sql.includes('tipo_documento = ANY')) {
        return { rows: [{ id: 'enq-doc-2', tipo_documento: 'simples_nacional', nome_original: 'simples.pdf', criado_em: new Date().toISOString() }] };
      }
      if (sql.includes('FROM public.documentos_extracoes_ia e')) {
        return {
          rows: [{
            resultado: { tipo_analise: 'simples_nacional', status: 'concluido', alertas: [], dados_extraidos: { situacao_simples: 'Optante do Simples Nacional' } },
            status: 'concluido',
            prompt_versao: promptVersaoSimples,
            id: 'laudo-enq-2',
            analysis_signature: assinatura,
            classifier_version: CLASSIFIER_VERSION,
            extractor_version: EXTRACTOR_VERSION,
            rule_version: RULE_VERSION,
            schema_version: SCHEMA_VERSION,
            analysis_status: 'ATIVO',
            stale_at: null,
            satisfaz_requisito: true,
            hash_arquivo: 'hash-enq-2',
          }],
        };
      }
      return { rows: [] };
    });

    const resultado = await montarEnquadramentoDados('empresa-4', false, { regime_tributario: 'Simples Nacional', opcao_simples: true, opcao_mei: false });

    expect(resultado.dados.diagnostico).not.toMatch(/atualizado desde a última análise/i);
    expect(resultado.pendencias).toEqual([]);
  });
});
