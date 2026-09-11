import { describe, expect, it } from 'vitest';
import { gerarMapaDocumentalCredito, identificarRegimeCredito } from '../server/services/mapaDocumentalCreditoService';

// CORREÇÃO (11/09/2026, pedido explícito do usuário: "garanta que quando
// identificar o tipo de empresa, o regime, o enquadramento tributário,
// garanta que a documentação seja exatamente o que é pra ser" -- caso real
// em que o banner da tela mostrava "regime Simples Nacional — optante" para
// uma empresa MEI real, mesmo já com um CCMEI anexado, porque nem
// `opcao_mei` nem o texto do enquadramento sincronizado da Receita
// mencionavam literalmente "MEI"/"SIMEI"): `identificarRegimeCredito` agora
// aceita um terceiro parâmetro opcional, `evidenciaCcmeiAnexado` -- quando
// `true`, um CCMEI de fato anexado (mesmo sinal que `montarValidacaoSocietaria`
// já usa para dispensar Atos da Junta/Contrato Social) é tratado como prova
// documental direta da condição de MEI, retornando `'mei'` mesmo quando o
// texto do enquadramento não menciona literalmente "MEI"/"SIMEI".
//
// Isto é diferente de inferir por natureza jurídica "Empresário Individual"
// (removido de propósito da Rodada 29, 02/09/2026 -- nem todo Empresário
// Individual é MEI): o CCMEI, ao contrário da natureza jurídica, É o próprio
// documento que comprova o enquadramento MEI.
describe('identificarRegimeCredito -- um CCMEI de fato anexado é evidência direta de MEI, mesmo sem o texto do enquadramento mencionar "MEI"', () => {
  it('sem o parâmetro (comportamento anterior, zero regressão): texto ambíguo sem "MEI"/"SIMEI" continua caindo em Simples Nacional genérico', () => {
    const regime = identificarRegimeCredito({ regime_tributario: 'Simples Nacional', natureza_juridica: '213-5 - Empresário Individual' });
    expect(regime).toBe('simples_nacional');
  });

  it('com evidenciaCcmeiAnexado=true, o mesmo caso ambíguo passa a ser identificado como MEI', () => {
    const regime = identificarRegimeCredito(
      { regime_tributario: 'Simples Nacional', natureza_juridica: '213-5 - Empresário Individual' },
      undefined,
      true,
    );
    expect(regime).toBe('mei');
  });

  it('evidenciaCcmeiAnexado=false (ou omitido) não muda nada -- só `true` tem efeito', () => {
    const regime = identificarRegimeCredito({ regime_tributario: 'Simples Nacional' }, undefined, false);
    expect(regime).toBe('simples_nacional');
  });

  it('um `opcao_mei: false` explícito da Receita nunca é sobrescrito só pela presença do arquivo (dado oficial sempre vence)', () => {
    const regime = identificarRegimeCredito({ regime_tributario: 'Simples Nacional', opcao_mei: false }, undefined, true);
    expect(regime).toBe('simples_nacional');
  });

  it('zero regressão: texto que já dizia "MEI" continua identificado como MEI, com ou sem o novo parâmetro', () => {
    const semParametro = identificarRegimeCredito({ regime_tributario: 'MEI', opcao_mei: true });
    const comParametroFalse = identificarRegimeCredito({ regime_tributario: 'MEI', opcao_mei: true }, undefined, false);
    expect(semParametro).toBe('mei');
    expect(comParametroFalse).toBe('mei');
  });

  it('gerarMapaDocumentalCredito: quando "ccmei" está em tiposAnexados, o mapa completo passa a usar o checklist do MEI (DASN-SIMEI), não o do Simples Nacional genérico (PGDAS-D/DEFIS)', () => {
    const empresaAmbigua = { regime_tributario: 'Simples Nacional', natureza_juridica: '213-5 - Empresário Individual' };

    const semCcmei = gerarMapaDocumentalCredito({
      empresa: empresaAmbigua,
      etapa1Aprovada: true,
      etapa2Aprovada: false,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    expect(semCcmei.regime_identificado).toBe('simples_nacional');

    const comCcmei = gerarMapaDocumentalCredito({
      empresa: empresaAmbigua,
      etapa1Aprovada: true,
      etapa2Aprovada: false,
      tiposAnexados: ['cartao_cnpj', 'qsa', 'ccmei'],
    });
    expect(comCcmei.regime_identificado).toBe('mei');
    const documentosFiscais = comCcmei.etapas.find((e) => e.numero === 4)?.documentos || [];
    expect(documentosFiscais.some((d) => d.codigo === 'dasn_simei')).toBe(true);
    expect(documentosFiscais.some((d) => d.codigo === 'pgdas_12m')).toBe(false);
  });
});
