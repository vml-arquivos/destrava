import { describe, expect, it } from 'vitest';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';

// CORREÇÃO (09/09/2026, Rodada 09/09 parte 8 -- pedido explícito do usuário,
// com print real): "quando a empresa e mei não tem atos da junta, e o
// contrato social e o ccmei, atos da junta e para as outras empresas".
//
// O usuário anexou o CCMEI real da empresa diretamente no campo "Contrato
// social e alterações contratuais" (em vez do campo dedicado de CCMEI em
// Fiscal/Tributário) -- e o print mostrou o card marcando o arquivo como
// "Documento incompatível", porque `autorizado('CONTRATO_SOCIAL', tipo)` só
// aceitava CONTRATO_SOCIAL/ALTERACAO_CONTRATUAL como tipo detectado. Um CCMEI
// é emitido EXCLUSIVAMENTE para Microempreendedor Individual -- nunca existe
// para LTDA/SLU/SA/Cooperativa/Associação -- então aceitá-lo como evidência
// de Contrato Social não abre nenhuma brecha para os outros tipos de empresa.
describe('classificarDocumentoDeterministico -- CCMEI é aceito como evidência do campo Contrato Social (exclusivo do MEI)', () => {
  const TEXTO_CCMEI = `CERTIFICADO DA CONDIÇÃO DE MICROEMPREENDEDOR INDIVIDUAL - CCMEI
    NOME EMPRESARIAL: 55.497.701 NATALYA MARTINS LOBO
    CNPJ: 55.497.701/0001-70
    Data de Início das Atividades: 12/06/2024`;

  it('um CCMEI anexado no campo "Contrato social" é reconhecido como identificado e satisfaz o requisito', () => {
    const resultado = classificarDocumentoDeterministico({
      tipoEsperado: 'contrato_social',
      texto: TEXTO_CCMEI,
      hoje: new Date('2026-09-09T12:00:00.000Z'),
    });

    expect(resultado.tipo_detectado).toBe('CCMEI');
    expect(resultado.identidade_status).toBe('IDENTIFICADO');
    expect(resultado.satisfaz_requisito).toBe(true);
  });

  it('o mesmo CCMEI continua satisfazendo o campo dedicado "CCMEI" -- comportamento anterior preservado', () => {
    const resultado = classificarDocumentoDeterministico({
      tipoEsperado: 'ccmei',
      texto: TEXTO_CCMEI,
      hoje: new Date('2026-09-09T12:00:00.000Z'),
    });

    expect(resultado.tipo_detectado).toBe('CCMEI');
    expect(resultado.identidade_status).toBe('IDENTIFICADO');
    expect(resultado.satisfaz_requisito).toBe(true);
  });

  it('um Contrato Social/Alteração Contratual de LTDA continua sendo aceito normalmente -- zero regressão', () => {
    const resultado = classificarDocumentoDeterministico({
      tipoEsperado: 'contrato_social',
      texto: 'CONTRATO SOCIAL — SOCIEDADE EMPRESÁRIA LIMITADA — PALUMA BURGER LTDA — CNPJ 52.008.360/0001-33',
      hoje: new Date('2026-09-09T12:00:00.000Z'),
    });

    expect(resultado.tipo_detectado).toBe('CONTRATO_SOCIAL');
    expect(resultado.identidade_status).toBe('IDENTIFICADO');
    expect(resultado.satisfaz_requisito).toBe(true);
  });

  it('um CCMEI NÃO é aceito como evidência de Atos da Junta -- MEI simplesmente não tem Atos da Junta, o CCMEI não os substitui', () => {
    const resultado = classificarDocumentoDeterministico({
      tipoEsperado: 'atos_junta_comercial',
      texto: TEXTO_CCMEI,
      hoje: new Date('2026-09-09T12:00:00.000Z'),
    });

    expect(resultado.tipo_detectado).toBe('CCMEI');
    expect(resultado.identidade_status).toBe('INCOMPATIVEL');
    expect(resultado.satisfaz_requisito).toBe(false);
  });
});
