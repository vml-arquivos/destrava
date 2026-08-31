import { describe, expect, it } from 'vitest';
import { montarResultadoDetalhadoRelatorio } from '../server/routes/documentacao';

// CORREÇÃO (2026-08-31, print real da empresa "B1 SAUDE E ESTETICA LTDA"
// mostrando "Fonte da leitura: local:tesseract-v1-parcial" na tela): esse
// valor é um código interno do motor de extração (ver `ultimoModeloUsado` em
// analiseDocumentalEspecializada.ts), nunca pensado para chegar ao usuário
// final. O campo "Fonte da leitura" agora traduz os códigos conhecidos para
// uma frase curta em português, mantendo o padrão do resto da tela.
describe('montarResultadoDetalhadoRelatorio -- "Fonte da leitura" não expõe códigos internos do motor de extração', () => {
  function buscarCampo(resultado: ReturnType<typeof montarResultadoDetalhadoRelatorio>, label: string) {
    return (resultado.campos as Array<{ label: string; valor: string }>).find((campo) => campo.label === label);
  }

  it('traduz "local:tesseract-v1-parcial" (leitura local parcial) para uma frase amigável', () => {
    const documento = { id: 'enq-1', tipo_documento: 'enquadramento_tributario_cnpj', nome: 'ENQ.pdf', criado_em: new Date().toISOString() };
    const analiseEspecializada = {
      tipo_analise: 'simples_nacional',
      status: 'revisao_humana',
      modelo_ia: 'local:tesseract-v1-parcial',
      dados_extraidos: { situacao_simples: 'Optante' },
      alertas: [],
      revisao_humana_necessaria: true,
    };
    const resultado = montarResultadoDetalhadoRelatorio(documento, analiseEspecializada);
    expect(buscarCampo(resultado, 'Fonte da leitura')?.valor).toBe('Leitura automática local (parcial) — recomenda-se revisão');
    expect(JSON.stringify(resultado)).not.toContain('tesseract');
  });

  it('traduz "local:regex-v1" (leitura local bem-sucedida) para "Leitura automática local (OCR)"', () => {
    const documento = { id: 'qsa-1', tipo_documento: 'qsa', nome: 'QSA.pdf', criado_em: new Date().toISOString() };
    const analiseEspecializada = {
      tipo_analise: 'qsa', status: 'concluido', modelo_ia: 'local:regex-v1',
      dados_extraidos: { cnpj: '11.111.111/0001-11' }, alertas: [], revisao_humana_necessaria: false,
    };
    const resultado = montarResultadoDetalhadoRelatorio(documento, analiseEspecializada);
    expect(buscarCampo(resultado, 'Fonte da leitura')?.valor).toBe('Leitura automática local (OCR)');
  });

  it('traduz um modelo Gemini para "Leitura automática por IA" (sem regressão para leituras por IA)', () => {
    const documento = { id: 'cartao-1', tipo_documento: 'cartao_cnpj', nome: 'CNPJ.pdf', criado_em: new Date().toISOString() };
    const analiseEspecializada = {
      tipo_analise: 'documento_generico', status: 'concluido', modelo_ia: 'gemini-2.5-flash',
      dados_extraidos: {}, alertas: [], revisao_humana_necessaria: false,
    };
    const resultado = montarResultadoDetalhadoRelatorio(documento, analiseEspecializada);
    expect(buscarCampo(resultado, 'Fonte da leitura')?.valor).toBe('Leitura automática por IA');
  });
});
