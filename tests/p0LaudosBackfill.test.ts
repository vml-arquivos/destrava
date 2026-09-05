import { describe, expect, it } from 'vitest';
import {
  CLASSIFIER_VERSION,
  EXTRACTOR_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  calcularAssinaturaAnalise,
  decidirVersaoLaudo,
  statusLaudoPodeSatisfazer,
  versaoPromptDocumental,
} from '../server/services/documentalLaudoVersioning';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';
import { janela12Meses, obterFaturamentoRolling12Meses } from '../server/services/faturamentoRolling12MesesService';
import { calcularExigibilidadeEcf, registrarPeriodoRegime, regraTemporalDctf } from '../server/services/regimeTributarioTemporalService';
import { detectarRequisitosCobertosPeloTexto, detectarStatusCertidaoDebitos, statusResolveRequisito } from '../server/services/coberturaEvidenciaBureauService';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';

describe('P0 — laudos, classificação e evidência temporal', () => {
  it('mantém a mesma versão de prompt no upload, no leitor e no backfill', () => {
    expect(versaoPromptDocumental('qsa_extract')).toBe('5.1.0');
    expect(versaoPromptDocumental('simples_extract')).toBe('1.0.0');
    expect(versaoPromptDocumental('catalogo_foto_fachada_extract')).toBe('2.0.0');
  });

  it('inclui todas as versões na assinatura e invalida laudo antigo', () => {
    const base = calcularAssinaturaAnalise({
      arquivoId: 'arquivo-1',
      arquivoHash: 'hash-1',
      promptCodigo: 'ecf_extract',
      promptVersao: '1.0.0',
      classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      ruleVersion: RULE_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
    const mudou = calcularAssinaturaAnalise({
      arquivoId: 'arquivo-1',
      arquivoHash: 'hash-1',
      promptCodigo: 'ecf_extract',
      promptVersao: '1.0.0',
      classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      ruleVersion: 'rules-next',
      schemaVersion: SCHEMA_VERSION,
    });
    expect(mudou).not.toBe(base);
    const decision = decidirVersaoLaudo({
      analysis_signature: base,
      classifier_version: CLASSIFIER_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      rule_version: RULE_VERSION,
      schema_version: SCHEMA_VERSION,
      prompt_versao: '1.0.0',
      analysis_status: 'ATIVO',
      status: 'concluido',
    }, {
      arquivoId: 'arquivo-1',
      arquivoHash: 'hash-1',
      promptCodigo: 'ecf_extract',
      promptVersao: '1.0.0',
      classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      ruleVersion: 'rules-next',
      schemaVersion: SCHEMA_VERSION,
    });
    expect(decision.shouldReprocess).toBe(true);
    expect(statusLaudoPodeSatisfazer({ analysis_status: 'STALE', status: 'concluido' })).toBe(false);
  });

  it('reproduz o caso ZR: PGDAS e recibo PGDAS não satisfazem ECF', () => {
    const pgdasNoEcf = classificarDocumentoDeterministico({
      tipoEsperado: 'ecf',
      texto: 'PGDAS-D — competência 12/2025 — Simples Nacional',
      competenciaInicio: '2025-12-01',
      competenciaFim: '2025-12-31',
      hoje: new Date('2026-08-31T00:00:00Z'),
    });
    expect(pgdasNoEcf.tipo_esperado).toBe('ECF');
    expect(pgdasNoEcf.tipo_detectado).toBe('PGDAS_D');
    expect(pgdasNoEcf.satisfaz_requisito).toBe(false);
    expect(pgdasNoEcf.identidade_status).toBe('INCOMPATIVEL');
    expect(pgdasNoEcf.temporalidade_status).toBe('HISTORICO');

    const reciboNoReciboEcf = classificarDocumentoDeterministico({
      tipoEsperado: 'recibo_ecf',
      texto: 'Recibo PGDAS-D — competência 12/2025 — Simples Nacional',
      competenciaInicio: '2025-12-01',
      competenciaFim: '2025-12-31',
      hoje: new Date('2026-08-31T00:00:00Z'),
    });
    expect(reciboNoReciboEcf.tipo_esperado).toBe('RECIBO_ECF');
    expect(reciboNoReciboEcf.tipo_detectado).toBe('RECIBO_PGDAS');
    expect(reciboNoReciboEcf.satisfaz_requisito).toBe(false);
    expect(reciboNoReciboEcf.identidade_status).toBe('INCOMPATIVEL');
    expect(reciboNoReciboEcf.temporalidade_status).toBe('HISTORICO');
  });

  it('classifica documento fiscal errado como incompatível e texto ausente como fail-closed', () => {
    const errado = classificarDocumentoDeterministico({ tipoEsperado: 'ecf', texto: 'RECIBO PGDAS-D do Simples Nacional' });
    expect(errado.identidade_status).toBe('INCOMPATIVEL');
    expect(errado.satisfaz_requisito).toBe(false);
    const ausente = classificarDocumentoDeterministico({ tipoEsperado: 'darf', texto: '' });
    expect(ausente.identidade_status).toBe('NAO_IDENTIFICADO');
    expect(ausente.satisfaz_requisito).toBe(false);
  });

  it('exige regime explícito em comprovantes fiscais e preserva o tipo local', () => {
    const semRegime = analisarTextoDocumentoLocal('ecf', 'Escrituração Contábil Fiscal — ano-calendário 2024');
    expect(semRegime.dados.tipo_comprovante_regime).toBe('ecf');
    expect(semRegime.dados.regime_confirmado).not.toBe(true);
    expect(semRegime.dados.documento_compativel).toBe(false);
    const comRegime = analisarTextoDocumentoLocal('darf', 'DARF código 2089 — Lucro Presumido — CNPJ 00.000.000/0001-00');
    expect(comRegime.dados.tipo_comprovante_regime).toBe('darf');
    expect(comRegime.dados.regime_confirmado).toBe(true);
    expect(comRegime.dados.documento_compativel).toBe(true);
  });

  it('não deixa evidência histórica sobrescrever o regime vigente', async () => {
    const queries: string[] = [];
    const resultado = await registrarPeriodoRegime({
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes('SELECT id, empresa_id, regime')) {
          return { rows: [{ id: 'vigente', empresa_id: 'empresa-1', regime: 'Não optante — regime a confirmar', data_inicio: '2026-01-01', data_fim: null, fonte: 'cadastro', confianca: 0.8, documento_evidencia_id: null, observacao: null }] };
        }
        return { rows: [{ id: 'historico', empresa_id: 'empresa-1', regime: 'Simples Nacional', data_inicio: '2025-12-01', data_fim: '2025-12-31', fonte: 'pgdas', confianca: 0.95, documento_evidencia_id: 'doc-1', observacao: null }] };
      },
    }, {
      empresaId: 'empresa-1',
      regime: 'Simples Nacional',
      dataEvidenciaInicio: '2025-12-01',
      dataEvidenciaFim: '2025-12-31',
      fonte: 'pgdas',
      confianca: 0.95,
      documentoEvidenciaId: 'doc-1',
    });
    expect(resultado.acao).toBe('inserido_historico');
    expect(queries.some((sql) => sql.includes('SET data_fim'))).toBe(false);
    expect(queries.some((sql) => sql.includes('INSERT INTO public.empresas_regime_tributario_historico'))).toBe(true);
  });

  it('calcula janela rolling 12 e exigibilidade ECF com datas determinísticas', () => {
    const janela = janela12Meses({ ano: 2026, mes: 8 });
    expect(janela).toHaveLength(12);
    expect(janela[0]).toEqual({ ano: 2025, mes: 9 });
    expect(janela[11]).toEqual({ ano: 2026, mes: 8 });
    expect(calcularExigibilidadeEcf(2025, new Date('2026-07-31T00:00:00Z'))).toBe('AINDA_NAO_EXIGIVEL');
    expect(calcularExigibilidadeEcf(2024, new Date('2026-08-01T00:00:00Z'))).toBe('EXIGIVEL');
    expect(regraTemporalDctf({ ano: 2024, mes: 12 })).toEqual({ tipo_documento: 'dctf', vigencia_inicio: null, vigencia_fim: '2024-12-31' });
    expect(regraTemporalDctf({ ano: 2025, mes: 1 })).toEqual({ tipo_documento: 'dctfweb_mit', vigencia_inicio: '2025-01-01', vigencia_fim: null });
  });

  it('não infla rolling 12 quando há meses faltantes', async () => {
    const resultado = await obterFaturamentoRolling12Meses({
      query: async () => ({ rows: [
        { id: 'f1', empresa_id: 'empresa-1', ano: 2026, mes: 8, valor: 1000, fonte: 'documento', documento_id: null, regime_no_periodo: 'Lucro Real', confianca: 0.9, observacao: null },
        { id: 'f2', empresa_id: 'empresa-1', ano: 2026, mes: 7, valor: 900, fonte: 'documento', documento_id: null, regime_no_periodo: 'Lucro Real', confianca: 0.9, observacao: null },
      ] }),
    }, 'empresa-1', { ano: 2026, mes: 8 });
    expect(resultado.meses_com_dado).toBe(2);
    expect(resultado.meses_faltantes.length).toBe(10);
    expect(resultado.total).toBe(1900);
    expect(resultado.completo).toBe(false);
  });

  it('mantém cobertura bureau distinta de presença de evidência', () => {
    const requisitos = detectarRequisitosCobertosPeloTexto('Relatório Serasa com consulta CADIN, CCF e SCR');
    expect(requisitos).toEqual(expect.arrayContaining(['SERASA', 'CADIN', 'CCF', 'SCR']));
    expect(detectarStatusCertidaoDebitos('Certidão Positiva com Efeito de Negativa')).toBe('CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO');
    expect(detectarStatusCertidaoDebitos('Certidão Positiva sem efeito de negativa')).toBe('CERTIDAO_POSITIVA');
    expect(statusResolveRequisito('CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO')).toBe(true);
    expect(statusResolveRequisito('CERTIDAO_POSITIVA')).toBe(false);
  });
});
