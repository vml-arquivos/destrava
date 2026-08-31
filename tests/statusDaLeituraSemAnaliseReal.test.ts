import { describe, expect, it } from 'vitest';
import { montarResultadoDetalhadoRelatorio } from '../server/routes/documentacao';

// CORREÇÃO (31/08/2026, pedido explícito do usuário -- capturas de tela do
// Acervo Documental mostrando, ao mesmo tempo, "Resultado da análise:
// Aguardando análise" / "O arquivo foi anexado, mas ainda não existe laudo
// concluído para este documento" E, logo abaixo, "Amostra objetiva dos dados
// lidos > Status da leitura: validado" -- uma contradição: "por que que está
// dando validado um documento vazio [sem laudo]?"):
//
// Causa raiz: `montarResultadoDetalhadoRelatorio` (server/routes/documentacao.ts)
// montava o campo "Status da leitura" a partir de
// `documento?.status_leitura || documento?.status || analise?.status`.
// `documento?.status` é um campo administrativo genérico da linha do arquivo
// -- inclui o resultado do botão manual "✓ Validar" do Acervo Documental (um
// analista humano marcando o arquivo, sem relação com a leitura automática
// ter rodado ou não). Quando nenhum laudo real existia (nem `laudo` nem
// `analiseEspecializada`), esse campo administrativo aparecia sob o rótulo
// "Status da leitura" como se a IA tivesse lido e confirmado "validado".
//
// Este teste prova que, sem nenhuma evidência de leitura automática, o campo
// "Status da leitura" não aparece mais vindo do status administrativo -- e
// que, quando existe uma análise especializada real, o campo continua
// aparecendo normalmente (sem regressão).
describe('montarResultadoDetalhadoRelatorio -- "Status da leitura" não pode vir de um flag manual sem leitura automática real', () => {
  function buscarCampo(resultado: ReturnType<typeof montarResultadoDetalhadoRelatorio>, label: string) {
    return (resultado.campos as Array<{ label: string; valor: string }>).find((campo) => campo.label === label);
  }

  it('documento marcado manualmente como "validado" (✓), mas sem nenhum laudo automático, não mostra "Status da leitura: validado"', () => {
    const documento = {
      id: 'atos-1',
      tipo_documento: 'atos_junta_comercial',
      nome: 'ATOS DA JUNTA COMERCIAL.pdf',
      // Flag administrativo manual (botão "✓ Validar" do Acervo Documental) --
      // não é evidência de que a IA leu o documento.
      status: 'validado',
      validado: true,
      analisado: false,
      consistente: false,
      criado_em: new Date().toISOString(),
    };

    const resultado = montarResultadoDetalhadoRelatorio(documento, null);

    expect(buscarCampo(resultado, 'Status da leitura')).toBeUndefined();
  });

  it('com uma análise especializada real (laudo concluído), o "Status da leitura" continua aparecendo normalmente (sem regressão)', () => {
    const documento = {
      id: 'enq-1',
      tipo_documento: 'enquadramento_tributario_cnpj',
      nome: 'ENQ. TRIB.pdf',
      status: 'ativo',
      analisado: true,
      consistente: true,
      criado_em: new Date().toISOString(),
    };
    const analiseEspecializada = {
      tipo_analise: 'documento_generico',
      status: 'concluido',
      dados_extraidos: { regime_tributario: 'Simples Nacional', situacao_simples: 'Optante' },
      alertas: [],
      revisao_humana_necessaria: false,
    };

    const resultado = montarResultadoDetalhadoRelatorio(documento, analiseEspecializada);

    expect(buscarCampo(resultado, 'Status da leitura')?.valor).toBe('concluido');
  });

  it('documento com laudo legado em resultado_validacao (sem analiseEspecializada) também continua mostrando o status real (sem regressão)', () => {
    const documento = {
      id: 'legado-1',
      tipo_documento: 'comprovante_residencia',
      nome: 'comprovante.pdf',
      status: 'ativo',
      analisado: true,
      consistente: true,
      criado_em: new Date().toISOString(),
      resultado_validacao: {
        analise_regra_documental: { status: 'concluido', dados_extraidos: {} },
      },
    };

    const resultado = montarResultadoDetalhadoRelatorio(documento, null);

    expect(buscarCampo(resultado, 'Status da leitura')?.valor).toBe('concluido');
  });
});
