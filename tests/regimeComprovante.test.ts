import { detectarRegimeTributarioDeclarado, detectarTipoComprovanteRegime, parseComprovanteRegime } from '../server/services/extracaoDocumentalLocal';
import { gerarMapaDocumentalCredito } from '../server/services/mapaDocumentalCreditoService';

describe('comprovantes de regime tributário não optante', () => {
  it('identifica Lucro Presumido explicitamente em ECF', () => {
    expect(detectarRegimeTributarioDeclarado('ECF\nRegime tributário: Lucro Presumido\nAno-calendário 2025')).toEqual({
      regime: 'Lucro Presumido',
      ambiguo: false,
    });
  });

  it('identifica Lucro Real pelo código de receita do DARF', () => {
    expect(detectarRegimeTributarioDeclarado('DARF IRPJ\nCódigo de Receita 5993\nPeríodo de apuração 03/2026')).toEqual({
      regime: 'Lucro Real',
      ambiguo: false,
    });
  });

  // CORREÇÃO (2026-08-30, reversão de decisão anterior): o código de receita
  // 8998 NÃO está confirmado na tabela oficial de códigos de receita da RFB
  // para IRPJ. Uma rodada anterior desta mesma correção o manteve mapeado
  // para "Lucro Real" "por compatibilidade" -- a auditoria independente
  // pediu explicitamente a reversão: nunca inferir regime de um código não
  // confirmado, e sinalizar para revisão humana em vez disso.
  it('código de receita 8998 NÃO infere Lucro Real automaticamente -- fica sinalizado para revisão humana (reversão do bug P0)', () => {
    const resultado = detectarRegimeTributarioDeclarado('DARF IRPJ\nCódigo de Receita 8998\nPeríodo de apuração 03/2026');
    expect(resultado.regime).toBeNull();
    expect(resultado.ambiguo).toBe(false);
    expect(resultado.codigoReceitaNaoConfirmado).toBe('8998');
  });

  it('preserva o tipo do comprovante e só o considera compatível quando há marcador e regime lido', () => {
    const ecf = parseComprovanteRegime('ecf', 'ECF - Escrituração Contábil Fiscal\\nRegime tributário: Lucro Presumido');
    expect(ecf.dados).toMatchObject({ comprovante_regime: true, tipo_comprovante_regime: 'ecf', documento_compativel: true, regime_tributario: 'Lucro Presumido' });

    const livroCaixa = parseComprovanteRegime('livro_caixa', 'Livro Caixa\\nmovimentação mensal sem regime declarado');
    expect(livroCaixa.dados).toMatchObject({ comprovante_regime: true, tipo_comprovante_regime: 'livro_caixa', documento_compativel: false });
    expect(livroCaixa.dados.regime_confirmado).toBe(false);

    const outro = parseComprovanteRegime('ecf', 'Contrato social sem informação fiscal');
    expect(outro.dados.documento_compativel).toBe(false);
  });

  // CORREÇÃO (2026-08-30, bug P0): antes desta correção, um PGDAS-D (ou
  // qualquer documento que apenas confirme "Optante pelo Simples Nacional")
  // anexado no slot de ECF/DCTF/DARF/Livro Caixa era aceito como
  // `documento_compativel: true`, porque o código só checava se ALGUM regime
  // tinha sido confirmado no texto -- sem checar se era um dos regimes que
  // esse slot existe para comprovar. Isso violava a regra "o nome do slot
  // nunca pode ser usado como prova da identidade do documento": o sistema
  // aceitava o documento errado silenciosamente, sem revisão humana.
  it('PGDAS-D anexado no slot de ECF não é aceito como comprovante do regime (bug P0 corrigido)', () => {
    const textoPgdas = `
      PGDAS-D -- Programa Gerador do Documento de Arrecadação do Simples Nacional
      CNPJ: 12.345.678/0001-90
      Período de Apuração: 12/2025
      Situação no Simples Nacional: Optante
      Receita Bruta do Mês: 85.000,00
    `;
    const resultado = parseComprovanteRegime('ecf', textoPgdas);
    // O PGDAS confirma um regime (Simples Nacional) -- mas não é o regime que
    // o slot ECF existe para comprovar (Presumido/Real/Arbitrado), então o
    // documento tem que ser marcado como incompatível com o campo, nunca
    // aceito silenciosamente como se fosse a ECF pedida.
    expect(resultado.dados.documento_compativel).toBe(false);
    expect(resultado.dados.regime_tributario).toBe('Simples Nacional');
  });

  it('DARF com código de receita de Lucro Real/Presumido/Arbitrado continua sendo aceito nos slots de comprovação (sem regressão)', () => {
    expect(parseComprovanteRegime('darf', 'DARF -- Código de Receita: 5993').dados.documento_compativel).toBe(true);
    expect(parseComprovanteRegime('darf', 'DARF -- Código de Receita: 2089').dados.documento_compativel).toBe(true);
    expect(parseComprovanteRegime('darf', 'DARF -- Código de Receita: 5625').dados.documento_compativel).toBe(true);
  });

  it('não confirma quando o documento mistura regimes possíveis', () => {
    expect(detectarRegimeTributarioDeclarado('Regime: Lucro Real. Alternativamente, Lucro Presumido.')).toEqual({
      regime: null,
      ambiguo: true,
    });
  });

  // CORREÇÃO (2026-08-30, bug P0 residual apontado por auditoria independente):
  // a correção anterior (PGDAS no slot de ECF) só excluía regimes de FAMÍLIA
  // errada (Simples/MEI). Mas `documentoCompativel = marcadorDoTipo ||
  // regimeDetectado` ainda aceitava um documento de TIPO errado dentro da
  // MESMA família de regime válida -- por exemplo, uma DCTFWeb/MIT que
  // confirma "Lucro Presumido" satisfazendo o slot de ECF, porque bastava
  // "algum regime válido foi confirmado no texto", sem checar se o marcador
  // do tipo pedido (ECF) estava presente. A partir de agora, a identidade do
  // documento é decidida por um classificador independente do slot
  // (`detectarTipoComprovanteRegime`), e `documento_compativel` é
  // estritamente `tipo_detectado === tipo_esperado`. Um documento do tipo
  // errado que ainda comprove um regime válido fica `documento_compativel:
  // false` (não satisfaz o slot) mas `pode_evidenciar_regime: true` (pode
  // alimentar a linha do tempo do regime tributário como evidência).
  describe('matriz tipo-esperado × tipo-detectado (auditoria independente, seção 47)', () => {
    const textoEcf = 'ECF - Escrituração Contábil Fiscal\nAno-calendário 2025\nRegime tributário: Lucro Real';
    const textoDctfMit = 'DCTFWeb - Declaração de Débitos e Créditos Tributários Federais\nMódulo de Inclusão de Tributos (MIT)\nRegime tributário: Lucro Presumido';
    const textoDarf = 'DARF -- Documento de Arrecadação de Receitas Federais\nCódigo de Receita: 5993';
    const textoLivroCaixa = 'Livro Caixa\nRegime tributário: Lucro Arbitrado';

    it('classifica cada texto pelo tipo real, independente do slot em que foi anexado', () => {
      expect(detectarTipoComprovanteRegime(textoEcf)).toBe('ecf');
      expect(detectarTipoComprovanteRegime(textoDctfMit)).toBe('dctf_mit');
      expect(detectarTipoComprovanteRegime(textoDarf)).toBe('darf');
      expect(detectarTipoComprovanteRegime(textoLivroCaixa)).toBe('livro_caixa');
      expect(detectarTipoComprovanteRegime('Contrato social sem qualquer marcador fiscal')).toBeNull();
    });

    it('ECF esperado + DCTFWeb/MIT real → INCOMPATÍVEL como ECF, mas pode evidenciar regime', () => {
      const resultado = parseComprovanteRegime('ecf', textoDctfMit);
      expect(resultado.dados.tipo_detectado).toBe('dctf_mit');
      expect(resultado.dados.tipo_esperado).toBe('ecf');
      expect(resultado.dados.documento_compativel).toBe(false);
      expect(resultado.dados.pode_evidenciar_regime).toBe(true);
      expect(resultado.dados.regime_tributario).toBe('Lucro Presumido');
    });

    it('ECF esperado + DARF real → INCOMPATÍVEL como ECF, mas pode evidenciar regime', () => {
      const resultado = parseComprovanteRegime('ecf', textoDarf);
      expect(resultado.dados.tipo_detectado).toBe('darf');
      expect(resultado.dados.documento_compativel).toBe(false);
      expect(resultado.dados.pode_evidenciar_regime).toBe(true);
    });

    it('DARF esperado + DCTFWeb/MIT real → INCOMPATÍVEL como DARF, mas pode evidenciar regime', () => {
      const resultado = parseComprovanteRegime('darf', textoDctfMit);
      expect(resultado.dados.tipo_detectado).toBe('dctf_mit');
      expect(resultado.dados.documento_compativel).toBe(false);
      expect(resultado.dados.pode_evidenciar_regime).toBe(true);
    });

    it('DCTFWeb/MIT esperado + ECF real → INCOMPATÍVEL como DCTF/MIT, mas pode evidenciar regime', () => {
      const resultado = parseComprovanteRegime('dctf_mit', textoEcf);
      expect(resultado.dados.tipo_detectado).toBe('ecf');
      expect(resultado.dados.documento_compativel).toBe(false);
      expect(resultado.dados.pode_evidenciar_regime).toBe(true);
    });

    it('Livro Caixa esperado + ECF real → INCOMPATÍVEL como Livro Caixa, mas pode evidenciar regime', () => {
      const resultado = parseComprovanteRegime('livro_caixa', textoEcf);
      expect(resultado.dados.tipo_detectado).toBe('ecf');
      expect(resultado.dados.documento_compativel).toBe(false);
      expect(resultado.dados.pode_evidenciar_regime).toBe(true);
    });

    it('quando o tipo detectado bate com o tipo esperado, documento_compativel é true e tipo_detectado nunca é silenciosamente renomeado para o slot', () => {
      const resultado = parseComprovanteRegime('dctf_mit', textoDctfMit);
      expect(resultado.dados.tipo_detectado).toBe('dctf_mit');
      expect(resultado.dados.tipo_esperado).toBe('dctf_mit');
      expect(resultado.dados.documento_compativel).toBe(true);
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
