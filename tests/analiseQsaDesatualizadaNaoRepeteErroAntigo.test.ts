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

// CORREÇÃO (2026-08-31, Rodada 15 -- caso real "44.598.036 PAULO BOLSONI
// BALDI": o usuário reportou "continua com erro" no QSA de uma empresa
// Empresário Individual, mesmo depois da correção de regra da Rodada 13 (o
// alerta "Não foi possível identificar os nomes dos sócios no QSA" deveria
// ter deixado de aparecer para esse caso). Causa raiz: o laudo já estava
// PERSISTIDO no banco, calculado pela regra ANTIGA, antes da correção
// existir -- e nenhum código, sozinho, muda um registro já gravado. A
// Rodada 15 bumpa `RULE_VERSION` (server/services/documentalLaudoVersioning.ts)
// para marcar esse laudo como desatualizado, e este teste prova que
// `montarQsaDocumentalDados` (o agregador que alimenta o banner "Ação
// necessária" da Etapa 1) para de repassar a pendência antiga assim que o
// laudo é marcado como desatualizado -- em vez de mostrar a mesma pendência
// calculada pela regra que já foi corrigida.
describe('montarQsaDocumentalDados -- laudo de QSA desatualizado não repete a pendência calculada pela regra antiga', () => {
  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it('quando o laudo persistido tem rule_version diferente da atual, para de mostrar "Não foi possível identificar os nomes dos sócios no QSA" e passa a pedir reanálise', async () => {
    const { montarQsaDocumentalDados } = await import('../server/routes/documentacao');
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM information_schema.columns')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM public.documentos_arquivos') && sql.includes('tipo_documento = ANY')) {
        return { rows: [{ id: 'qsa-doc-1', tipo_documento: 'qsa', nome_original: 'qsa_rezerva.pdf', criado_em: new Date().toISOString() }] };
      }
      if (sql.includes('FROM public.documentos_extracoes_ia e')) {
        return {
          rows: [{
            resultado: {
              tipo_analise: 'qsa',
              status: 'revisao_humana',
              alertas: [{ codigo: 'qsa_socios_nao_extraidos', mensagem: 'Não foi possível identificar os nomes dos sócios no QSA.', severidade: 'alta' }],
              dados_extraidos: { socios: [], qsa_nao_aplicavel: false },
            },
            status: 'revisao_humana',
            prompt_versao: '1.0.0',
            id: 'laudo-1',
            analysis_signature: 'assinatura-calculada-pela-regra-antiga',
            classifier_version: 'classifier-antigo',
            extractor_version: 'extractor-antigo',
            rule_version: 'rules-antigo-pre-rodada-13',
            schema_version: 'schema-antigo',
            analysis_status: 'ATIVO',
            stale_at: null,
            satisfaz_requisito: false,
            hash_arquivo: 'hash-1',
          }],
        };
      }
      return { rows: [] };
    });

    const resultado = await montarQsaDocumentalDados('empresa-1', false);

    expect(resultado.pendencias.some((p) => /Não foi possível identificar os nomes dos sócios/i.test(p.mensagem))).toBe(false);
    expect(resultado.dados.analisado).toBe(false);
    expect(resultado.dados.diagnostico).toMatch(/atualizado desde a última análise/i);
  });

  it('quando o laudo persistido já está na versão atual, continua repassando os alertas normalmente (sem regressão)', async () => {
    const { montarQsaDocumentalDados } = await import('../server/routes/documentacao');
    const { RULE_VERSION, CLASSIFIER_VERSION, EXTRACTOR_VERSION, SCHEMA_VERSION, calcularAssinaturaAnalise } = await import('../server/services/documentalLaudoVersioning');
    // `qsa_extract` tem versão própria (VERSAO_ANALISE_DOCUMENTAL em
    // documentacao.ts, hoje '5.1.0') diferente do PROMPT_VERSION genérico --
    // a assinatura e o `prompt_versao` persistido precisam usar exatamente o
    // mesmo valor que `buscarAnaliseEspecializadaPersistida` usa
    // (`versaoPromptDocumental('qsa_extract')`), senão o teste cai no mesmo
    // ramo de "desatualizado" por engano (prompt_versao divergente).
    const promptVersaoQsa = '5.1.0';
    const assinatura = calcularAssinaturaAnalise({
      arquivoId: 'qsa-doc-2',
      arquivoHash: 'hash-2',
      promptCodigo: 'qsa_extract',
      promptVersao: promptVersaoQsa,
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
        return { rows: [{ id: 'qsa-doc-2', tipo_documento: 'qsa', nome_original: 'qsa.pdf', criado_em: new Date().toISOString() }] };
      }
      if (sql.includes('FROM public.documentos_extracoes_ia e')) {
        return {
          rows: [{
            resultado: { tipo_analise: 'qsa', status: 'concluido', alertas: [], dados_extraidos: { cnpj: '11.111.111/0001-11', socios: [{ nome: 'Fulana', administrador: true }] } },
            status: 'concluido',
            prompt_versao: promptVersaoQsa,
            id: 'laudo-2',
            analysis_signature: assinatura,
            classifier_version: CLASSIFIER_VERSION,
            extractor_version: EXTRACTOR_VERSION,
            rule_version: RULE_VERSION,
            schema_version: SCHEMA_VERSION,
            analysis_status: 'ATIVO',
            stale_at: null,
            satisfaz_requisito: true,
            hash_arquivo: 'hash-2',
          }],
        };
      }
      return { rows: [] };
    });

    const resultado = await montarQsaDocumentalDados('empresa-2', false);

    expect(resultado.dados.diagnostico).not.toMatch(/atualizado desde a última análise/i);
    expect(resultado.pendencias).toEqual([]);
  });
});
