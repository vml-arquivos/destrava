import { describe, expect, it } from 'vitest';
import { normalizarDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';

// CORREÇÃO (09/09/2026, Rodada 09/09 parte 10 -- pedido explícito do usuário,
// depois de reportar que o v44 ainda pedia o CCMEI mesmo após o redeploy):
// os testes anteriores (`validacaoSocietariaCcmeiMei.test.ts`,
// `classificadorCcmeiComoContratoSocialMei.test.ts`) verificam cada peça do
// pipeline isoladamente, mas com formato de laudo MONTADO À MÃO -- ou seja,
// eles PRESUMEM a forma exata que `normalizarDocumentoCatalogado`
// (server/services/analiseDocumentalEspecializada.ts) realmente produz, sem
// nunca chamar essa função de verdade. Foi exatamente esse tipo de presunção
// que causou o bug da parte 9 (caminho de leitura errado) escapar
// despercebido por uma rodada inteira.
//
// Este teste fecha essa lacuna: chama `normalizarDocumentoCatalogado` de
// verdade, com o texto real extraído de um CCMEI (o mesmo padrão dos 3
// documentos reais anexados pelo usuário nas rodadas anteriores), no campo
// "contrato_social" -- exatamente o cenário relatado -- e comprova, sem
// nenhuma suposição, exatamente o formato do objeto `dados` que vira
// `dados_extraidos` no laudo persistido (`criarResultado`, mesmo arquivo:
// `dados_extraidos: dados` -- conferido por leitura direta do código).
describe('normalizarDocumentoCatalogado -- CCMEI anexado no campo Contrato Social (verificação real, não presumida)', () => {
  const TEXTO_CCMEI_REAL = `CERTIFICADO DA CONDIÇÃO DE MICROEMPREENDEDOR INDIVIDUAL - CCMEI
    Nos termos do Art. 4º da Resolução CGSIM nº 16, de 17 de dezembro de 2009,
    fica reconhecida a condição de Microempreendedor Individual de:
    NOME EMPRESARIAL: 55.497.701 NATALYA MARTINS LOBO
    CNPJ: 55.497.701/0001-70
    Data de Início das Atividades: 12/06/2024
    Ocupação: Cabeleireiro(a)`;

  it('reconhece o CCMEI (tipo_detectado=CCMEI, identidade_status=IDENTIFICADO) quando anexado no campo "contrato_social", e o resultado NÃO fica marcado como incompatível', () => {
    const resultado = normalizarDocumentoCatalogado(
      {
        __texto_local: TEXTO_CCMEI_REAL,
        documento_compativel: true,
        confianca: 0.95,
        cnpj: '55.497.701/0001-70',
        campos_extraidos: { cnpj: '55.497.701/0001-70' },
      },
      'contrato_social',
      { cnpj: '55497701000170', natureza_juridica: '213-5 - Empresário (Individual)' },
    );

    // Este é o dado que `criarResultado` grava como `dados_extraidos` no laudo
    // persistido (`resultado_validacao.analise_regra_documental.dados_extraidos`),
    // e é exatamente o que `montarValidacaoSocietaria` (server/routes/documentacao.ts)
    // lê para reconhecer o CCMEI anexado no campo Contrato Social.
    expect(resultado.dados.tipo_detectado).toBe('CCMEI');
    expect(resultado.dados.identidade_status).toBe('IDENTIFICADO');
    expect(resultado.dados.status_documental).not.toBe('DOCUMENTO_INCOMPATIVEL');
    expect(resultado.alertas.some((a) => a.codigo === 'documento_catalogado_tipo_incompativel')).toBe(false);

    // Ponte com a Etapa 2: reproduz exatamente como o laudo fica gravado no
    // banco (agendarAnaliseRegraDocumental, server/routes/documentos.ts:
    // `resultado_validacao = {analise_regra_documental: resultado}`, onde
    // `resultado.dados_extraidos = normalizado.dados` -- ver criarResultado)
    // e confirma que o caminho lido por `montarValidacaoSocietaria`
    // (`ccmeiViaContratoSocial`, corrigido na parte 9) bate com este dado real.
    const laudoPersistidoSimulado = { dados_extraidos: resultado.dados };
    const tipoDetectadoLidoPelaEtapa2 = laudoPersistidoSimulado?.dados_extraidos?.tipo_detectado
      || (laudoPersistidoSimulado as any)?.classificacao?.tipo_detectado
      || (laudoPersistidoSimulado as any)?.tipo_detectado;
    expect(tipoDetectadoLidoPelaEtapa2).toBe('CCMEI');
  });

  it('um Contrato Social real de LTDA continua sendo identificado normalmente -- zero regressão', () => {
    const resultado = normalizarDocumentoCatalogado(
      {
        __texto_local: 'CONTRATO SOCIAL — SOCIEDADE EMPRESÁRIA LIMITADA — PALUMA BURGER LTDA — CNPJ 52.008.360/0001-33',
        documento_compativel: true,
        confianca: 0.95,
        cnpj: '52.008.360/0001-33',
      },
      'contrato_social',
      { cnpj: '52008360000133', natureza_juridica: 'Sociedade Empresária Limitada' },
    );

    expect(resultado.dados.tipo_detectado).toBe('CONTRATO_SOCIAL');
    expect(resultado.dados.identidade_status).toBe('IDENTIFICADO');
    expect(resultado.dados.status_documental).not.toBe('DOCUMENTO_INCOMPATIVEL');
  });

  it('um CCMEI anexado no campo "atos_junta_comercial" continua incompatível -- MEI não tem Atos da Junta, o CCMEI não os substitui', () => {
    const resultado = normalizarDocumentoCatalogado(
      { __texto_local: TEXTO_CCMEI_REAL, documento_compativel: true, confianca: 0.95, cnpj: '55.497.701/0001-70' },
      'atos_junta_comercial',
      { cnpj: '55497701000170', natureza_juridica: '213-5 - Empresário (Individual)' },
    );

    expect(resultado.dados.tipo_detectado).toBe('CCMEI');
    expect(resultado.dados.identidade_status).toBe('INCOMPATIVEL');
    expect(resultado.dados.status_documental).toBe('DOCUMENTO_INCOMPATIVEL');
  });
});
