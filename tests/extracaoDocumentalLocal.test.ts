import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analisarTextoDocumentoLocal, detectarRegimeTributarioDeclarado, extrairDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
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

  // Rodada 21 (02/09/2026) -- pedido explícito do usuário: "quando ler o
  // cartão do cnpj [...] se tiver telefone atualizado, pegar o email".
  // Fixture baseada no texto real extraído (via pdftotext -layout) do Cartão
  // CNPJ oficial anexado pelo usuário (CNPJ 29.705.345/0001-22): os rótulos
  // "ENDEREÇO ELETRÔNICO" e "TELEFONE" ficam na mesma linha, e os dois
  // valores também ficam juntos na linha seguinte -- por isso a extração usa
  // regex dedicado, não `valorAposRotulo`.
  it('extrai email e telefone do Cartão CNPJ mesmo com os dois campos lado a lado na mesma linha (layout real da Receita)', () => {
    const texto = `
      REPÚBLICA FEDERATIVA DO BRASIL
      CADASTRO NACIONAL DA PESSOA JURÍDICA
      NÚMERO DE INSCRIÇÃO
      29.705.345/0001-22
      COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO DATA DE ABERTURA
                                            17/02/2018
      MATRIZ                                       CADASTRAL
      NOME EMPRESARIAL
      29.705.345 VILSON MARCIO DE LIMA
      CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
      73.19-0-02 - Promoção de vendas
      CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
      213-5 - Empresário (Individual)
      ENDEREÇO ELETRÔNICO                                        TELEFONE
      VILSONMARCIO@GMAIL.COM                                     (61) 9145-9287
      SITUAÇÃO CADASTRAL                                                                    DATA DA SITUAÇÃO CADASTRAL
      ATIVA                                                                                 30/08/2026
      Emitido no dia 30/08/2026 às 19:46:52 (data e hora de Brasília)
    `;

    const resultado = analisarTextoDocumentoLocal('cartao_cnpj', texto);

    expect(resultado.dados.email).toBe('vilsonmarcio@gmail.com');
    expect(resultado.dados.telefone).toBe('(61) 9145-9287');
  });

  // Rodada 22 (02/09/2026) -- descoberta ao testar o Cartão CNPJ real anexado
  // pelo usuário: nesse mesmo layout com colunas lado a lado (fixture acima),
  // "SITUAÇÃO CADASTRAL" e "DATA DA SITUAÇÃO CADASTRAL" ficam na mesma linha
  // de rótulo e "ATIVA"/"30/08/2026" na mesma linha de valor -- sem o ajuste,
  // `situacao_cadastral` saía contaminado como "ATIVA 30/08/2026".
  it('extrai a situação cadastral limpa (sem a data grudada) quando situação e data ficam lado a lado na mesma linha (layout real da Receita)', () => {
    const texto = `
      REPÚBLICA FEDERATIVA DO BRASIL
      CADASTRO NACIONAL DA PESSOA JURÍDICA
      NÚMERO DE INSCRIÇÃO
      29.705.345/0001-22
      COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO DATA DE ABERTURA
                                            17/02/2018
      MATRIZ                                       CADASTRAL
      NOME EMPRESARIAL
      29.705.345 VILSON MARCIO DE LIMA
      CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
      73.19-0-02 - Promoção de vendas
      CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
      213-5 - Empresário (Individual)
      ENDEREÇO ELETRÔNICO                                        TELEFONE
      VILSONMARCIO@GMAIL.COM                                     (61) 9145-9287
      SITUAÇÃO CADASTRAL                                                                    DATA DA SITUAÇÃO CADASTRAL
      ATIVA                                                                                 30/08/2026
      Emitido no dia 30/08/2026 às 19:46:52 (data e hora de Brasília)
    `;

    const resultado = analisarTextoDocumentoLocal('cartao_cnpj', texto);

    expect(resultado.dados.situacao_cadastral).toBe('ATIVA');
    expect(resultado.dados.data_situacao_cadastral).toBe('2026-08-30');
  });

  it('não inventa email/telefone quando o Cartão CNPJ não traz esses campos', () => {
    const texto = `
      CADASTRO NACIONAL DA PESSOA JURÍDICA
      NÚMERO DE INSCRIÇÃO
      52.008.360/0001-33
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      SITUAÇÃO CADASTRAL
      ATIVA
      Emitido no dia 05/08/2026 às 19:30:00
    `;
    const resultado = analisarTextoDocumentoLocal('cartao_cnpj', texto);
    expect(resultado.dados.email).toBeNull();
    expect(resultado.dados.telefone).toBeNull();
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

  it('aceita o CCMEI como prova interna da condição de MEI no enquadramento', () => {
    const resultado = analisarTextoDocumentoLocal('simples_nacional', `
      CERTIFICADO DA CONDIÇÃO DE MICROEMPREENDEDOR INDIVIDUAL
      CCMEI
      CNPJ: 29.705.345/0001-22
      Nome Empresarial: VILSON MARCIO DE LIMA
      Situação: ATIVA
    `);

    expect(resultado.dados).toMatchObject({
      documento_compativel: true,
      documento_ccmei: true,
      opcao_mei: true,
      regime_tributario: 'MEI / SIMEI',
      regime_confirmado: true,
    });
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

  it('extrai receita do PA e RBT12 do layout tabular do PGDAS sem confundir regime de apuração', () => {
    const resultado = analisarTextoDocumentoLocal('pgdas_d', `
      Programa Gerador do Documento de Arrecadação do Simples Nacional - Declaratório
      CNPJ Matriz: 52.008.360/0001-33
      Período de Apuração: 01/07/2026 a 31/07/2026
      Optante pelo Simples Nacional: Sim
      Regime de Apuração: Competência
      Receita Bruta do PA (RPA) - Competência 36.923,49 0,00 36.923,49
      Receita bruta acumulada nos doze meses anteriores 406.219,36 0,00 406.219,36
      ao PA (RBT12)
      Número da Declaração: 52008360202607001 Número do Recibo: 01.07.26229.0440173-6
    `);
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.receita_bruta).toBe(36923.49);
    expect(resultado.dados.receita_bruta_pa).toBe(36923.49);
    expect(resultado.dados.rbt12).toBe(406219.36);
    expect(resultado.dados.regime_tributario).toBe('Simples Nacional');
    expect(resultado.dados.regime_de_apuracao).toBe('Competência');
  });

  it('separa regime de apuração e extrai ano, recibo e transmissão da DEFIS', () => {
    const resultado = analisarTextoDocumentoLocal('documento_generico', `
      Declaração de Informações Socioeconômicas e Fiscais - DEFIS
      CNPJ: 52.008.360/0001-33
      Declaração Retificadora Exercício 2026 Ano-Calendário 2025
      Regime de Apuração: competência
      Optante pelo Simples Nacional: Sim
      Número da Declaração: 520083602025002 Número do Recibo: 02.07.26230.0312046-0
      Data e Horário da transmissão da Declaração: 18/08/2026 13:58:49
    `, 'defis');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.ano_calendario).toBe(2025);
    expect(resultado.dados.regime_tributario).toBe('Simples Nacional');
    expect(resultado.dados.regime_de_apuracao).toBe('competência');
    expect(resultado.dados.recibo_ou_protocolo).toBe('02.07.26230.0312046-0');
    expect(resultado.dados.data_transmissao).toBe('2026-08-18');
  });

  it('extrai a data de emissão da CPEND no formato oficial “Emitida às ... do dia”', () => {
    const resultado = analisarTextoDocumentoLocal('documento_generico', `
      CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA DE DÉBITOS
      Nome: PALUMA BURGER LTDA
      CNPJ: 52.008.360/0001-33
      Emitida às 11:02:55 do dia 20/08/2026 (hora e data de Brasília)
      Válida até 16/02/2027.
      Código de controle da certidão: 0188.7E30.06FB.13AC
    `, 'cnd_rfb_cnpj');

    expect(resultado.dados.data_emissao).toBe('2026-08-20');
    expect(resultado.dados.data_validade).toBe('2027-02-16');
    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
  });

  it('extrai competência e recibo do recibo PGDAS em tabela com colunas intermediárias', () => {
    const resultado = analisarTextoDocumentoLocal('documento_generico', `
      RECIBO DE ENTREGA DA APURAÇÃO NO PGDAS-D
      Nome Empresarial CNPJ da Matriz
      PALUMA BURGER LTDA 52.008.360/0001-33
      Período de Apuração Número da Apuração Receita Bruta Auferida
      07/2026 52008360202607001 R$ 36.923,49
      Data e Horário da Transmissão
      17/08/2026 15:30:07
      Número do Recibo
      01.07.26229.0440173-6
    `, 'recibo_pgdas');

    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.dados.competencia).toEqual({ inicio: '2026-07-01', fim: '2026-07-31' });
    expect(resultado.dados.recibo_ou_protocolo).toBe('01.07.26229.0440173-6');
    expect(resultado.dados.data_transmissao).toBe('2026-08-17');
  });

  it('reconhece as duas assinaturas digitais no rodapé OCR do faturamento', () => {
    const resultado = analisarTextoDocumentoLocal('faturamento_12_meses', `
      PALUMA BURGER LTDA CNPJ 52.008.360/0001-33
      Agosto de 2025 R$ 30.000,00
      TOTAL DO PERÍODO R$ 30.000,00
      Brasília - DF, 04 de agosto de 2026.
      Documento assinado digitalmente
      Itamar Gonçalves Cunha Filho PALUMA BURGER LTDA
      Contador Responsável Representante Legal
      CRCGO: 004102/O
    `);
    expect(resultado.dados.assinatura_socio_administrador).toMatchObject({ presente: true, tipo: 'eletronica' });
    expect(resultado.dados.assinatura_contador).toMatchObject({ presente: true, tipo: 'eletronica' });
  });

  it('aceita o layout oficial de faturamento que imprime cargos sem a palavra assinatura', () => {
    const resultado = analisarTextoDocumentoLocal('faturamento_12_meses', `
      DECLARAÇÃO DE FATURAMENTO
      CNPJ 52.008.360/0001-33
      Agosto de 2025 R$ 30.000,00
      TOTAL DO PERÍODO R$ 30.000,00
      Brasília - DF, 04 de agosto de 2026.
      Itamar Gonçalves Cunha Filho        PALUMA BURGER LTDA
      Contador Responsável                 Representante Legal
      CRCGO: 004102/O                      CNPJ: 52.008.360/0001-33
    `);
    expect(resultado.dados.data_assinatura).toBe('2026-08-04');
    expect(resultado.dados.assinatura_socio_administrador.presente).toBe(true);
    expect(resultado.dados.assinatura_contador.presente).toBe(true);
  });

  it('lê relatório empresarial consolidado com score, rating e data de consulta', () => {
    const resultado = analisarTextoDocumentoLocal('consulta_bureau', `
      ANÁLISE EMPRESARIAL, FINANCEIRA E SCR
      SCR + LAUDO FINANCEIRO COMPLETO + SCORE EMPRESARIAL
      PALUMA BURGER LTDA CNPJ 52.008.360/0001-33
      PONTUAÇÃO RATING 985 AA
      STATUS APROVADO_EXCELENTE
      DATA E HORA 23/07/2026 às 12:17:21
      PROTESTOS ESTADUAIS NADA CONSTA
    `, 'consulta_serasa_cnpj');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.dados.data_consulta).toBe('2026-07-23');
    expect(resultado.dados.score).toBe(985);
    expect(resultado.dados.rating).toBe('AA');
    expect(resultado.dados.resultado_consulta).toContain('Relatório empresarial consolidado');
  });

  it('não interpreta o “DE” do título RATING DE CRÉDITO como classificação do bureau', () => {
    const resultado = analisarTextoDocumentoLocal('consulta_bureau', `
      RATING DE CRÉDITO BANCÁRIO
      Data: 03/08/2026, 12:08:18
      RAZÃO SOCIAL VIK CONSTRUCOES E REFORMAS LTDA ME
      CNPJ 18.706.347/0001-10
      Conclusão de Análise Inteligente: Recusado
      CLASSIFICAÇÃO DO RISCO DE CRÉDITO
      C-
      AAA
      AA
      A
      BBB
      BB
      B
      C
      C-
      Classificação do Risco de Crédito C- -
      Rating BACEN: C-
    `, 'consulta_serasa_cnpj');

    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.rating).toBe('C-');
    expect(resultado.dados.rating).not.toBe('DE');
    expect(resultado.dados.resultado_consulta).toContain('rating C-');
    expect(resultado.dados.data_consulta).toBe('2026-08-03');
    expect(resultado.dados.situacao_certidao).toBeUndefined();
  });

  it('lê a data de consulta do laudo consolidado quando o PDF quebra o rótulo em DA TA', () => {
    const resultado = analisarTextoDocumentoLocal('consulta_bureau', `
      ANÁLI S E EM PRES ARI AL, FI NANCEI RA E S CR
      SCR + LAUDO FINANCEIRO COMPLETO + SCORE EMPRESARIAL
      CNPJ 52.008.360/0001-33
      DA TA E HO RA
      23/07/2026 às 12:17:21
      PONTUAÇÃO PJ 985 RATING AA
      PROTESTOS ESTADUAIS NADA CONSTA
    `, 'consulta_serasa_cnpj');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.data_consulta).toBe('2026-07-23');
  });

  it('extrai o ato societário completo do instrumento chancelado pela Junta', () => {
    const resultado = analisarTextoDocumentoLocal('contrato_social_alteracao', `
      ALTERAÇÃO CONTRATUAL CONSOLIDADA
      PALUMA BURGER LTDA — CNPJ 52.008.360/0001-33 — NIRE 52206183723
      O sócio MARCOS HENRIQUE SOARES PIO retira-se da sociedade, cedendo e transferindo suas 65.000 quotas para o sócio ora admitido neste ato JONNATHAS RODRIGUES PIRES, brasileiro.
      E por estarem assim justos e contratados, assinam o presente instrumento e mandam registrar e arquivar na Junta Comercial do Estado de Goiás.
      Goiânia-GO, 02 de junho de 2025
      ASSINATURA ELETRÔNICA
      CERTIFICO O REGISTRO EM 06/06/2025 09:42 SOB Nº 20251505987.
      NIRE: 52206183723. COM EFEITOS DO REGISTRO EM: 02/06/2025.
    `);
    expect(resultado.dados.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.dados.nire).toBe('52206183723');
    expect(resultado.dados.data_documento).toBe('2025-06-02');
    expect(resultado.dados.data_registro).toBe('2025-06-06');
    expect(resultado.dados.numero_arquivamento).toBe('20251505987');
    expect(resultado.dados.assinaturas).toHaveLength(1);
    expect(resultado.dados.alteracoes_societarias).toHaveLength(1);
  });

  it('classifica uma foto empresarial JPEG decodificável sem exigir OCR textual', async () => {
    const diretorio = await mkdtemp(path.join(os.tmpdir(), 'destrava-foto-'));
    const arquivo = path.join(diretorio, 'fachada.jpg');
    const sof = Buffer.alloc(17, 0);
    sof[0] = 8;
    sof.writeUInt16BE(900, 1);
    sof.writeUInt16BE(1600, 3);
    await writeFile(arquivo, Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11]),
      sof,
      Buffer.alloc(12_000, 0),
      Buffer.from([0xff, 0xd9]),
    ]));
    try {
      const resultado = await extrairDocumentoLocal(arquivo, 'image/jpeg', 'documento_generico', 'foto_fachada');
      expect(resultado.legivel).toBe(true);
      expect(resultado.mecanismo).toBe('imagem_visual');
      expect(resultado.dados.documento_compativel).toBe(true);
      expect(resultado.dados.tipo_evidencia).toBe('fachada');
      expect(resultado.dados.qualidade_imagem).toBe('adequada');
      expect(resultado.dados.dimensoes_imagem).toEqual({ largura: 1600, altura: 900 });
    } finally {
      await rm(diretorio, { recursive: true, force: true });
    }
  });

  it('não promove uma imagem empresarial pequena como evidência visual adequada', async () => {
    const diretorio = await mkdtemp(path.join(os.tmpdir(), 'destrava-foto-baixa-'));
    const arquivo = path.join(diretorio, 'fachada.jpg');
    const sof = Buffer.alloc(17, 0);
    sof[0] = 8;
    sof.writeUInt16BE(200, 1);
    sof.writeUInt16BE(320, 3);
    await writeFile(arquivo, Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11]),
      sof,
      Buffer.alloc(128, 0),
      Buffer.from([0xff, 0xd9]),
    ]));
    try {
      const resultado = await extrairDocumentoLocal(arquivo, 'image/jpeg', 'documento_generico', 'foto_fachada');
      expect(resultado.legivel).toBe(false);
      expect(resultado.dados.documento_compativel).toBe(true);
      expect(resultado.dados.qualidade_imagem).toBe('insuficiente');
      expect(resultado.motivo).toContain('qualidade');
    } finally {
      await rm(diretorio, { recursive: true, force: true });
    }
  });

});
