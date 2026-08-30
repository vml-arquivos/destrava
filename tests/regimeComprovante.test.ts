import { detectarRegimeTributarioDeclarado, parseComprovanteRegime } from '../server/services/extracaoDocumentalLocal';
import { gerarMapaDocumentalCredito } from '../server/services/mapaDocumentalCreditoService';

describe('comprovantes de regime tributário não optante', () => {
  it('identifica Lucro Presumido explicitamente em ECF', () => {
    expect(detectarRegimeTributarioDeclarado('ECF\nRegime tributário: Lucro Presumido\nAno-calendário 2025')).toEqual({
      regime: 'Lucro Presumido',
      ambiguo: false,
    });
  });

  it('identifica Lucro Real pelo código de receita do DARF', () => {
    expect(detectarRegimeTributarioDeclarado('DARF IRPJ\nCódigo de Receita 8998\nPeríodo de apuração 03/2026')).toEqual({
      regime: 'Lucro Real',
      ambiguo: false,
    });
  });

  it('preserva o tipo do comprovante e só o considera compatível quando há marcador ou regime lido', () => {
    const ecf = parseComprovanteRegime('ecf', 'ECF - Escrituração Contábil Fiscal\\nRegime tributário: Lucro Presumido');
    expect(ecf.dados).toMatchObject({ comprovante_regime: true, tipo_comprovante_regime: 'ecf', documento_compativel: true, regime_tributario: 'Lucro Presumido' });

    const livroCaixa = parseComprovanteRegime('livro_caixa', 'Livro Caixa\\nmovimentação mensal sem regime declarado');
    expect(livroCaixa.dados).toMatchObject({ comprovante_regime: true, tipo_comprovante_regime: 'livro_caixa', documento_compativel: true });
    expect(livroCaixa.dados.regime_confirmado).toBe(false);

    const outro = parseComprovanteRegime('ecf', 'Contrato social sem informação fiscal');
    expect(outro.dados.documento_compativel).toBe(false);
  });

  it('não confirma quando o documento mistura regimes possíveis', () => {
    expect(detectarRegimeTributarioDeclarado('Regime: Lucro Real. Alternativamente, Lucro Presumido.')).toEqual({
      regime: null,
      ambiguo: true,
    });
  });

  it('mantém a confirmação do regime como pendência de alta prioridade no mapa', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'Não optante pelo Simples Nacional', opcao_simples: false },
      etapa1Aprovada: false,
      etapa2Aprovada: false,
      tiposAnexados: [],
    });
    expect(mapa.regime_a_confirmar).toBe(true);
    expect(mapa.pendencias[0]).toMatchObject({
      codigo: 'nao_optante_regime_a_confirmar',
      prioridade: 'alta',
      nao_bloqueia_etapa_1: false,
    });
    expect(mapa.pendencias[0].tipos_documento_aceitos).toEqual(expect.arrayContaining(['ecf', 'dctf', 'dctfweb', 'darf', 'livro_caixa']));
  });
});
