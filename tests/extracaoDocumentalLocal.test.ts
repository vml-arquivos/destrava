import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal, detectarRegimeTributarioDeclarado } from '../server/services/extracaoDocumentalLocal';
import { compararEndereco } from '../server/utils/helpers';

describe('extração documental local determinística', () => {
  it('extrai os campos essenciais do Cartão CNPJ sem IA externa', () => {
    const texto = `
      REPÚBLICA FEDERATIVA DO BRASIL
      CADASTRO NACIONAL DA PESSOA JURÍDICA
      COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL
      NÚMERO DE INSCRIÇÃO
      52.008.360/0001-33 MATRIZ
      DATA DE ABERTURA
      18/09/2023
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
      56.11-2-03 - Lanchonetes, casas de chá, de sucos e similares
      CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
      206-2 - Sociedade Empresária Limitada
      PORTE
      ME
      SITUAÇÃO CADASTRAL
      ATIVA
      DATA DA SITUAÇÃO CADASTRAL
      18/09/2023
      Emitido no dia 05/08/2026 às 19:30:00
    `;

    const resultado = analisarTextoDocumentoLocal('cartao_cnpj', texto);

    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.dados.data_abertura).toBe('2023-09-18');
    expect(resultado.dados.nome_empresarial).toContain('PALUMA BURGER');
    expect(resultado.dados.situacao_cadastral).toBe('ATIVA');
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.8);
  });

  it('extrai QSA, capital social e sócio administrador', () => {
    const texto = `
      QUADRO DE SÓCIOS E ADMINISTRADORES - QSA
      CNPJ
      52.008.360/0001-33
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CAPITAL SOCIAL
      R$ 50.000,00
      NOME/NOME EMPRESARIAL
      JONNATHAS RODRIGUES PIRES
      QUALIFICAÇÃO DO SÓCIO
      Sócio-Administrador
      CPF
      123.456.789-00
    `;

    const resultado = analisarTextoDocumentoLocal('qsa', texto);

    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.dados.capital_social).toBe(50000);
    expect(resultado.dados.socios).toHaveLength(1);
    expect(resultado.dados.socios[0].nome).toContain('JONNATHAS');
    expect(resultado.dados.socios[0].qualificacao).toContain('Administrador');
    expect(resultado.dados.socios[0].administrador).toBe(true);
    expect(resultado.dados.socios[0]).not.toHaveProperty('cpf_cnpj');
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.8);
  });

  it('reconhece "a natureza jurídica não permite o preenchimento do QSA" como resposta oficial completa (Empresário Individual), não como falha de leitura', () => {
    // Texto real da consulta QSA da Receita Federal para uma empresa
    // Empresário (Individual) -- reproduzido conforme relatado pelo usuário
    // (31/08/2026): o QSA estava marcado "Revisão necessária: Não foi
    // possível identificar os nomes dos sócios", mas o próprio documento
    // já responde, de forma completa e oficial, que esta natureza jurídica
    // não tem sócios no sentido societário (o titular é o próprio CNPJ).
    const texto = `
      Consulta Quadro de Sócios e Administradores - QSA
      CNPJ:
      44.598.036/0001-94
      NOME EMPRESARIAL:
      44.598.036 PAULO BOLSONI BALDI
      CAPITAL SOCIAL:
      R$ 200.000,00 (Duzentos mil reais)
      A NATUREZA JURÍDICA NÃO PERMITE O PREENCHIMENTO DO QSA
    `;

    const resultado = analisarTextoDocumentoLocal('qsa', texto);

    expect(resultado.dados.documento_compativel).not.toBe(false);
    expect(resultado.dados.cnpj).toBe('44.598.036/0001-94');
    expect(resultado.dados.capital_social).toBe(200000);
    expect(resultado.dados.socios).toHaveLength(0);
    expect(resultado.dados.qsa_nao_aplicavel).toBe(true);
    // Zero sócios aqui é a resposta completa e correta -- não é extração
    // parcial nem falha, e a confiança não deve ser penalizada por isso.
    expect(resultado.dados.extracao_parcial).toBe(false);
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.6);
  });

  it('extrai o sócio do layout horizontal oficial do QSA sem exigir CPF ou documentos pessoais', () => {
    const texto = `
      QUADRO DE SÓCIOS E ADMINISTRADORES - QSA
      CNPJ
      52.008.360/0001-33
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CAPITAL SOCIAL
      R$ 65.000,00
      NOME/NOME EMPRESARIAL                         QUALIFICAÇÃO
      JONNATHAS RODRIGUES PIRES                     49-Sócio-Administrador
    `;

    const resultado = analisarTextoDocumentoLocal('qsa', texto);

    expect(resultado.dados.socios).toHaveLength(1);
    expect(resultado.dados.socios[0].nome).toBe('JONNATHAS RODRIGUES PIRES');
    expect(resultado.dados.socios[0].qualificacao).toContain('Sócio-Administrador');
    expect(resultado.dados.socios[0].administrador).toBe(true);
    expect(resultado.dados.socios[0]).not.toHaveProperty('cpf_cnpj');
    expect(resultado.dados.extracao_parcial).toBe(false);
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.8);
  });

  it('extrai o QSA quando o nome e a qualificação chegam em linhas separadas após o cabeçalho horizontal', () => {
    const texto = `
      QUADRO DE SÓCIOS E ADMINISTRADORES - QSA
      CNPJ
      52.008.360/0001-33
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CAPITAL SOCIAL
      R$ 65.000,00
      NOME/NOME EMPRESARIAL                         QUALIFICAÇÃO
      JONNATHAS RODRIGUES PIRES
      49-Sócio-Administrador
    `;

    const resultado = analisarTextoDocumentoLocal('qsa', texto);

    expect(resultado.dados.socios).toHaveLength(1);
    expect(resultado.dados.socios[0].nome).toBe('JONNATHAS RODRIGUES PIRES');
    expect(resultado.dados.socios[0].administrador).toBe(true);
    expect(resultado.dados.extracao_parcial).toBe(false);
  });

  it('não transforma cabeçalhos embaralhados pelo OCR em divergência falsa de endereço do Cartão CNPJ', () => {
    const comparacao = compararEndereco(
      'Rua Lattes 349, Quadra 10 Lote 11 Sala 01, Jardim Planalto, Goiânia, GO, 74333-060',
      'NÚMERO COMPLEMENTO, 52.008.360/0001-33 COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL, BAIRRO/DISTRITO MUNICÍPIO UF',
    );

    expect(comparacao.divergente).toBe(false);
    expect(comparacao.status).toBe('nao_extraido');
  });

  it('identifica Simples Nacional, SIMEI e agendamento de exclusão', () => {
    const texto = `
      CONSULTA OPTANTES
      CNPJ: 52.008.360/0001-33
      Situação no Simples Nacional: Optante pelo Simples Nacional desde 18/09/2023
      Situação no SIMEI: Optante pelo SIMEI
      Existe agendamento de exclusão do Simples Nacional.
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.situacao_simples).toBe('Optante');
    expect(resultado.dados.opcao_mei).toBe(true);
    expect(resultado.dados.agendamento_exclusao).toBe(true);
    expect(resultado.dados.data_opcao_simples).toBe('2023-09-18');
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.8);
  });

  // O enquadramento existe para dizer QUAL regime a empresa usa -- é o regime
  // que define a documentação fiscal exigida depois. "Não Optante" responde
  // apenas se a empresa está no Simples; Lucro Presumido, Real e Arbitrado são
  // todos não optantes e pedem documentos diferentes entre si.
  it('não trata "Não Optante" como se fosse um regime tributário', () => {
    const texto = `
      CONSULTA OPTANTES
      CNPJ: 50.509.651/0001-80
      Situação no Simples Nacional: Não optante pelo Simples Nacional
      Situação no SIMEI: NÃO enquadrado no SIMEI
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.situacao_simples).toBe('Não Optante');
    expect(resultado.dados.regime_tributario).toBeNull();
    expect(resultado.dados.regime_confirmado).toBe(false);
    expect(resultado.dados.regime_a_confirmar).toBe(true);
  });

  it('lê o regime declarado no documento quando a empresa não é optante do Simples', () => {
    const texto = `
      COMPROVANTE DE ENQUADRAMENTO TRIBUTÁRIO
      CNPJ: 50.509.651/0001-80
      Situação no Simples Nacional: Não optante pelo Simples Nacional
      Regime de apuração: LUCRO PRESUMIDO
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.situacao_simples).toBe('Não Optante');
    expect(resultado.dados.regime_tributario).toBe('Lucro Presumido');
    expect(resultado.dados.regime_confirmado).toBe(true);
    expect(resultado.dados.regime_a_confirmar).toBe(false);
  });

  it('lê Lucro Real declarado no documento', () => {
    const texto = `
      RELATÓRIO DE SITUAÇÃO FISCAL
      CNPJ: 50.509.651/0001-80
      Regime tributário: LUCRO REAL
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.regime_tributario).toBe('Lucro Real');
    expect(resultado.dados.regime_confirmado).toBe(true);
  });

  it('mantém o regime pendente quando o documento apenas nega um regime', () => {
    const texto = `
      CONSULTA DE REGIME
      CNPJ: 50.509.651/0001-80
      Situação no Simples Nacional: Não optante pelo Simples Nacional
      A empresa não optou pelo lucro presumido neste exercício.
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.regime_tributario).toBeNull();
    expect(resultado.dados.regime_a_confirmar).toBe(true);
  });

  it('não escolhe regime quando o documento cita mais de um', () => {
    const texto = `
      TABELA DE REGIMES
      CNPJ: 50.509.651/0001-80
      Situação no Simples Nacional: Não optante pelo Simples Nacional
      Regimes possíveis: LUCRO PRESUMIDO ou LUCRO REAL, conforme apuração.
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.regime_tributario).toBeNull();
    expect(resultado.dados.regime_a_confirmar).toBe(true);
  });

  it('mantém Simples Nacional e MEI como regimes lidos do próprio documento', () => {
    const simples = analisarTextoDocumentoLocal('simples_nacional', `
      CONSULTA OPTANTES
      CNPJ: 52.008.360/0001-33
      Situação no Simples Nacional: Optante pelo Simples Nacional desde 18/09/2023
    `);
    expect(simples.dados.regime_tributario).toBe('Simples Nacional');
    expect(simples.dados.regime_confirmado).toBe(true);

    const mei = analisarTextoDocumentoLocal('simples_nacional', `
      CONSULTA OPTANTES
      CNPJ: 52.008.360/0001-33
      Situação no Simples Nacional: Optante pelo Simples Nacional desde 18/09/2023
      Situação no SIMEI: Optante pelo SIMEI
    `);
    expect(mei.dados.regime_tributario).toBe('MEI / SIMEI');
    expect(mei.dados.regime_confirmado).toBe(true);
  });

  // O regime aparece declarado em vários documentos fiscais, não só na Consulta
  // de Optantes -- ECF, DCTF e Relatório de Situação Fiscal também o informam.
  // A mesma regra (e as mesmas proteções) precisa valer para todos eles.
  describe('leitura do regime tributário em qualquer documento fiscal', () => {
    it('lê o regime declarado em texto de ECF', () => {
      const r = detectarRegimeTributarioDeclarado('ESCRITURAÇÃO CONTÁBIL FISCAL — FORMA DE TRIBUTAÇÃO: LUCRO REAL');
      expect(r.regime).toBe('Lucro Real');
      expect(r.ambiguo).toBe(false);
    });

    it('lê o regime declarado em Relatório de Situação Fiscal', () => {
      const r = detectarRegimeTributarioDeclarado('RELATÓRIO DE SITUAÇÃO FISCAL\nRegime de apuração: Lucro Presumido');
      expect(r.regime).toBe('Lucro Presumido');
    });

    it('não aceita regime negado', () => {
      expect(detectarRegimeTributarioDeclarado('A empresa não é optante do lucro presumido.').regime).toBeNull();
      expect(detectarRegimeTributarioDeclarado('Nao apurou lucro real no periodo.').regime).toBeNull();
    });

    it('marca como ambíguo quando cita mais de um regime', () => {
      const r = detectarRegimeTributarioDeclarado('Assinale: ( ) LUCRO PRESUMIDO ( ) LUCRO REAL');
      expect(r.regime).toBeNull();
      expect(r.ambiguo).toBe(true);
    });

    it('não confunde "isenta de multa" com regime de isenção', () => {
      expect(detectarRegimeTributarioDeclarado('Empresa isenta de multa por atraso.').regime).toBeNull();
    });

    it('devolve nulo quando o documento não fala de regime', () => {
      expect(detectarRegimeTributarioDeclarado('CERTIDÃO NEGATIVA DE DÉBITOS').regime).toBeNull();
    });
  });

  it('extrai histórico e último ato da Junta Comercial', () => {
    const texto = `
      JUNTA COMERCIAL DO ESTADO DE GOIÁS
      CERTIDÃO SIMPLIFICADA
      CNPJ
      52.008.360/0001-33
      NIRE
      52206123456
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CAPITAL SOCIAL ATUAL
      R$ 50.000,00
      LISTA DE ARQUIVAMENTOS
      20231234567 18/09/2023 CONTRATO / CONSTITUIÇÃO
      20261234567 20/07/2026 ALTERAÇÃO CONTRATUAL / CONSOLIDAÇÃO
    `;

    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', texto);

    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.dados.nire).toBe('52206123456');
    expect(resultado.dados.capital_social_atual).toBe(50000);
    expect(resultado.dados.historico_arquivamentos).toHaveLength(2);
    expect(resultado.dados.data_registro).toBe('2026-07-20');
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.8);
  });

  it('extrai NIRE e data de registro do contrato/alteração social', () => {
    const texto = `
      ALTERAÇÃO CONTRATUAL SOCIEDADE EMPRESÁRIA LIMITADA
      PALUMA BURGER LTDA
      52.008.360/0001-33
      devidamente registrada na Junta Comercial sob o nº 52206183723
      CERTIFICO O REGISTRO EM 06/06/2025 SOB Nº 20251505987
      NIRE: 52206183723. COM EFEITOS DO REGISTRO EM: 02/06/2025
    `;
    const resultado = analisarTextoDocumentoLocal('contrato_social_alteracao', texto);
    expect(resultado.dados.nire).toBe('52206183723');
    expect(resultado.dados.data_registro).toBe('2025-06-06');
    expect(resultado.dados.numero_arquivamento).toBe('20251505987');
  });

  it('extrai retirada, transferência de quotas, quadro final e evidência do contrato', () => {
    const texto = `
      ALTERAÇÃO CONTRATUAL CONSOLIDADA
      PALUMA BURGER LTDA
      CNPJ 52.008.360/0001-33
      O capital social, que é de R$ 65.000,00, passa a ser assim distribuído.
      A sócia MARCOS ANTONIO DA SILVA, brasileiro, possuidor de 65.000 quotas,
      retira-se da sociedade, cedendo e transferindo suas quotas para o sócio
      JONNATHAS RODRIGUES PIRES, brasileiro, que passa a integrar o quadro social.
      PASSA A SER ASSIM DISTRIBUÍDO
      JONNATHAS RODRIGUES PIRES 65.000 100%
      NIRE: 52206183723
      CERTIFICO O REGISTRO EM 06/06/2025 SOB Nº 20251505987
    `;
    const resultado = analisarTextoDocumentoLocal('contrato_social_alteracao', texto);
    const alteracao = resultado.dados.alteracoes_societarias[0];

    expect(alteracao.cedente.nome).toContain('MARCOS ANTONIO DA SILVA');
    expect(alteracao.cessionario.nome).toContain('JONNATHAS RODRIGUES PIRES');
    expect(alteracao.quotas_transferidas).toBe(65000);
    expect(resultado.dados.quadro_societario_final).toEqual(expect.arrayContaining([
      expect.objectContaining({ nome: 'JONNATHAS RODRIGUES PIRES', quotas: 65000, percentual: 100 }),
    ]));
    expect(resultado.dados.capital_social_anterior).toBe(65000);
    expect(alteracao.evidencia).toContain('cedendo e transferindo');
  });

  it('aceita lista de atos da Junta do DF sem CNPJ e infere o NIRE pela constituição', () => {
    const texto = `
      REDE SIM DF - Serviços Web
      REGISTRO OU CONSTITUIÇÃO
      Data de Aprovação:22/04/1998 - Número:53200913101
      Evento(s): REGISTRO/CONSTITUIÇÃO
      ALTERAÇÃO
      Data de Aprovação:22/03/2024 - Número:2519165
      Evento(s): ALTERAÇÃO DE SÓCIO/TITULAR / ADMINISTRADOR
      CONSOLIDAÇÃO DE CONTRATO/ESTATUTO
    `;
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', texto);
    expect(resultado.dados.cnpj).toBeNull();
    expect(resultado.dados.nire).toBe('53200913101');
    expect(resultado.dados.data_registro).toBe('2024-03-22');
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.8);
  });

  it('extrai competências e assinaturas de uma relação de faturamento', () => {
    const texto = `
      RELAÇÃO DE FATURAMENTO BRUTO
      CNPJ 52.008.360/0001-33
      06/2026 R$ 10.000,00
      07/2026 R$ 12.000,00
      Assinado digitalmente em 05/08/2026
      Sócio-administrador: FERNANDO ELI
      Contador: CONTADOR TESTE CRC 123
    `;
    const resultado = analisarTextoDocumentoLocal('faturamento_12_meses', texto);
    expect(resultado.dados.meses_referencia).toEqual(['2026-06', '2026-07']);
    expect(resultado.dados.data_assinatura).toBe('2026-08-05');
    expect(resultado.dados.assinatura_socio_administrador.tipo).toBe('eletronica');
  });

  it('extrai entradas e saídas do extrato, ignora saldo/total e remove duplicidade', () => {
    const texto = `
      EXTRATO DE CONTA CORRENTE
      BANCO: BANCO TESTE
      SALDO ANTERIOR 01/08/2026 R$ 1.000,00
      01/08/2026 PIX RECEBIDO CLIENTE C R$ 500,00
      02/08/2026 PAGAMENTO FORNECEDOR D R$ 120,50
      02/08/2026 PAGAMENTO FORNECEDOR D R$ 120,50
      SALDO ATUAL 02/08/2026 R$ 1.379,50
      TOTAL DO PERÍODO R$ 379,50
    `;
    const resultado = analisarTextoDocumentoLocal('extrato_bancario', texto);

    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.banco).toBe('BANCO TESTE');
    expect(resultado.dados.lancamentos).toEqual([
      expect.objectContaining({ data: '2026-08-01', tipo: 'entrada', valor: 500 }),
      expect.objectContaining({ data: '2026-08-02', tipo: 'saida', valor: 120.5 }),
    ]);
    expect(resultado.dados.lancamentos).toHaveLength(2);
    expect(resultado.dados.total_entradas).toBe(500);
    expect(resultado.dados.total_saidas).toBe(120.5);
  });

  it('lê o layout SICOOB com data DD/MM, marcadores C/D e linhas complementares', () => {
    const texto = `
      SICOOB EXECUTIVO
      EXTRATO CONTA CORRENTE
      CONTA: 135.873-1 / FHTECH SOLUCAO & DIESEL LTDA
      PERÍODO: 01/08/2026 - 17/08/2026
      DATA HISTÓRICO VALOR
      04/08 SALDO ANTERIOR 0,00C
      04/08 SALDO BLOQ.ANTERIOR 0,00*
      04/08 DEP DIN AG 1,00C
      DOC.: 3
      04/08 DEB.PARC.SUBS/INTEG 1,00D
      DOC.: 33130
      04/08 PIX RECEB.OUTRA IF 1.500,00C
      Recebimento Pix
      FREDIANA ALVES DA SILVA
      DOC.: Pix
      04/08 PIX EMIT.OUTRA IF 210,00D
      Pagamento Pix
      DOC.: Pix
      04/08 SALDO DO DIA 1.290,00C
      05/08 DÉB.TIT.COMPE.EFETI 338,71D
      DOC.: 3705493
      05/08 PIX EMIT.OUTRA IF 92,38D
      Pagamento Pix
      05/08 DEB.PARC.SUBS/INTEG 300,00D
      05/08 CADASTRO 45,00D
      05/08 DEB.PARC.SUBS/INTEG 50,00D
      05/08 SALDO DO DIA 463,91C
      10/08 PIX EMIT.OUTRA IF 17,58D
      Pagamento Pix
      SHEIN
      10/08 PIX EMIT.OUTRA IF 102,95D
      SHEIN
      10/08 PIX EMIT.OUTRA IF 10,00D
      10/08 PIX EMIT.OUTRA IF 8,93D
      10/08 SALDO DO DIA 324,45C
      13/08 PIX EMIT.OUTRA IF 110,00D
      13/08 PIX EMIT.OUTRA IF 80,00D
      13/08 PIX EMIT.OUTRA IF 13,98D
      13/08 SALDO DO DIA 120,47C
      14/08 TARIFA COBRANÇA 0,25D
      14/08 SALDO DO DIA 120,22C
      17/08 CRÉD.LIQ.COBRANÇA 945,00C
      17/08 TARIFA COBRANÇA 1,75D
      17/08 PIX EMIT.OUTRA IF 63,74D
      Pagamento Pix
      DOC.: Pix
      17/08 SALDO DO DIA 999,73C
      RESUMO
      (+) SALDO EM CONTA: 999,73C
      PREVISÃO TARIFAS: 20,00D
    `;
    const resultado = analisarTextoDocumentoLocal('extrato_bancario', texto);
    const lancamentos = resultado.dados.lancamentos as Array<Record<string, any>>;

    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.periodo_inicio).toBe('2026-08-01');
    expect(resultado.dados.periodo_fim).toBe('2026-08-17');
    expect(lancamentos).toHaveLength(20);
    expect(lancamentos).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: '2026-08-04', tipo: 'entrada', valor: 1500, descricao: expect.stringContaining('FREDIANA ALVES DA SILVA') }),
      expect.objectContaining({ data: '2026-08-04', tipo: 'saida', valor: 210 }),
      expect.objectContaining({ data: '2026-08-05', tipo: 'saida', valor: 338.71 }),
      expect.objectContaining({ data: '2026-08-05', tipo: 'saida', valor: 92.38 }),
      expect.objectContaining({ data: '2026-08-17', tipo: 'entrada', valor: 945 }),
      expect.objectContaining({ data: '2026-08-17', tipo: 'saida', valor: 63.74 }),
    ]));
    expect(lancamentos.some((item) => /saldo|resumo|previs[aã]o/i.test(String(item.descricao)))).toBe(false);
    expect(resultado.dados.total_entradas).toBe(2446);
    expect(resultado.dados.total_saidas).toBe(1446.27);
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.72);
  });

});
