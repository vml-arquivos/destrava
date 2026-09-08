import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { validarContratoComAtosJunta } from '../server/services/analiseDocumentalEspecializada';

/**
 * Regressão da correção "identidade por evidência, não por frase fixa" nos
 * Atos da Junta Comercial / Contrato Social e Alterações.
 *
 * Causa raiz corrigida: `documento_compativel` era decidido apenas por um
 * OR de substrings literais (ex.: "junta comercial", "lista de
 * arquivamentos", "nire"). Um documento genuíno de uma Junta que usa outro
 * vocabulário/layout (mas cujo conteúdo comprova NIRE, histórico de
 * arquivamentos ou reconstrução societária real) era marcado incompatível
 * mesmo tendo evidência de identidade genuína -- e essa marcação, sozinha,
 * gerava o alerta "não reconhecido" na Etapa 2 (validarContratoComAtosJunta),
 * independente da evidência positiva extraída.
 *
 * Estes testes não usam nomes de Juntas/UFs específicas como regra: o
 * "Documento B" abaixo é propositalmente de uma instituição fictícia e
 * genérica, para provar que a identificação generaliza para qualquer
 * emissor -- não que passou a reconhecer uma UF nova por nome.
 */
describe('identidade documental por evidência (Atos da Junta / Contrato Social)', () => {
  const DOCUMENTO_A_ATOS = `
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

  // Mesma natureza documental do Documento A (certidão/lista de atos de uma
  // Junta Comercial), mas com vocabulário e layout diferentes: nenhuma das
  // frases literais reconhecidas hoje ("junta comercial", "lista de
  // arquivamentos", "certidão simplificada", "serviços web", "nire",
  // "registro mercantil", "redesim", "extrato de atos") aparece no texto.
  const DOCUMENTO_B_ATOS = `
    SISTEMA INTEGRADO DE REGISTRO EMPRESARIAL - ÓRGÃO ESTADUAL
    CNPJ
    12.345.678/0001-90
    Nome Empresarial
    COMERCIO EXEMPLO LTDA
    Número de Identificação do Registro de Empresas
    42109876543
    Capital Social Atual
    R$ 80.000,00
    Histórico de Registro
    20180012345 15/03/2018 CONTRATO / CONSTITUIÇÃO
    20240098765 10/01/2024 ALTERAÇÃO CONTRATUAL / CONSOLIDAÇÃO
  `;

  const DOCUMENTO_B_CONTRATO = `
    INSTRUMENTO SOCIETÁRIO - COMERCIO EXEMPLO LTDA
    CNPJ 12.345.678/0001-90
    O capital social, que é de R$ 80.000,00, passa a ser assim distribuído.
    PASSA A SER ASSIM DISTRIBUÍDO
    FULANO DE TAL EXEMPLO 80.000 100%
    NIRE: 42109876543
    CERTIFICO O REGISTRO EM 10/01/2024 SOB Nº 20240098765
  `;

  it('Documento A (vocabulário usual) continua identificado como Atos da Junta', () => {
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_A_ATOS);
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.documento_identidade_evidencias).toContain('indicador_textual');
    expect(resultado.dados.nire).toBe('52206123456');
  });

  it('Documento B (layout/vocabulário diferente) passa a ser identificado como Atos da Junta pela evidência de NIRE e histórico', () => {
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_ATOS);
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.documento_identidade_evidencias).not.toContain('indicador_textual');
    expect(resultado.dados.documento_identidade_evidencias).toEqual(
      expect.arrayContaining(['nire', 'historico_arquivamentos']),
    );
    expect(resultado.dados.nire).toBe('42109876543');
    expect(resultado.dados.historico_arquivamentos).toHaveLength(2);
    expect(resultado.dados.razao_social).toContain('COMERCIO EXEMPLO');
  });

  it('Documento B (contrato/alteração com vocabulário diferente) é identificado pela evidência de registro e reconstrução societária', () => {
    const resultado = analisarTextoDocumentoLocal('contrato_social_alteracao', DOCUMENTO_B_CONTRATO);
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.documento_identidade_evidencias).not.toContain('indicador_textual');
    expect(resultado.dados.nire).toBe('42109876543');
  });

  it('documento genuinamente incompatível (sem nenhuma evidência de registro mercantil) continua marcado como incompatível', () => {
    const textoNaoRelacionado = `
      RECIBO DE PAGAMENTO
      Recebi de FULANO a quantia de R$ 200,00 referente a serviços prestados.
      Data: 10/01/2024
    `;
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', textoNaoRelacionado);
    expect(resultado.dados.documento_compativel).toBe(false);
    expect(resultado.dados.documento_identidade_evidencias).toEqual([]);
  });

  it('a Etapa 2 (validarContratoComAtosJunta) não gera mais alerta de incompatibilidade para o Documento B, e continua cruzando NIRE/data normalmente', () => {
    const atos = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_ATOS).dados;
    const contrato = analisarTextoDocumentoLocal('contrato_social_alteracao', DOCUMENTO_B_CONTRATO).dados;

    const alertas = validarContratoComAtosJunta(contrato, atos);

    expect(alertas.some((a) => a.codigo === 'atos_junta_incompativel')).toBe(false);
    expect(alertas.some((a) => a.codigo === 'contrato_societario_incompativel')).toBe(false);
    // NIRE bate entre os dois documentos: nenhuma divergência crítica.
    expect(alertas.some((a) => a.codigo === 'contrato_junta_nire_divergente')).toBe(false);
  });

  it('um NIRE realmente divergente entre contrato e Junta continua sendo bloqueado mesmo com identidade evidenciada nos dois', () => {
    const atos = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_ATOS).dados;
    const contratoComOutroNire = {
      ...analisarTextoDocumentoLocal('contrato_social_alteracao', DOCUMENTO_B_CONTRATO).dados,
      nire: '99999999999',
    };

    const alertas = validarContratoComAtosJunta(contratoComOutroNire, atos);

    expect(alertas.some((a) => a.codigo === 'contrato_junta_nire_divergente')).toBe(true);
  });
});

/**
 * Reprodução com os DOIS documentos reais anexados pelo usuário na missão:
 * um Ato da Junta que já era reconhecido corretamente ("Documento A" --
 * Certidão Online / Lista de Arquivamentos, Portal do Empreendedor de Goiás,
 * PALUMA BURGER LTDA) e um que era rejeitado ("Documento B" -- uma tela
 * "Atos disponíveis" de outra Junta, sem CNPJ/NIRE/razão social visíveis,
 * empresa transformada de EIRELI em LTDA).
 *
 * O texto abaixo é exatamente o texto extraído dos dois PDFs anexados
 * (mesma ordem/pontuação da extração real), não um resumo.
 */
describe('reprodução com os dois documentos reais da missão (Certidão GO x "Vik")', () => {
  const DOCUMENTO_A_REAL = `
DADOS DA EMPRESA
RAZÃO SOCIAL: PALUMA BURGER LTDA
CNPJ: 52.008.360/0001-33
NIRE: 52206183723
SELECIONE OS ARQUIVAMENTOS QUE DESEJA OBTER FOTOCÓPIA:
Arquivamento Data Ato
20251505987 06/06/2025 ALTERAÇÃO
20244323909 27/03/2025 ALTERAÇÃO
20232527288 30/08/2023 ENQUADRAMENTO DE MICROEMPRESA
52206183723 30/08/2023 CONTRATO
`;

  // Sem cabeçalho de instituição, sem CNPJ, sem NIRE rotulado, sem razão
  // social -- só a lista de atos. É exatamente o tipo de layout "pobre" em
  // frases literais que a correção precisa reconhecer pela evidência.
  const DOCUMENTO_B_REAL = `
Atos disponíveis
ENQUADRAMENTO DE MICROEMPRESA
Data de Aprovação:15/08/2013 - Número:20130711675
Evento(s): ENQUADRAMENTO DE MICROEMPRESA
ATO CONSTITUTIVO - EIRELI
Data de Aprovação:15/08/2013 - Número:53600026039
Evento(s): ATO CONSTITUTIVO
ALTERACAO
Data de Aprovação:27/08/2021 - Número:1959107
Evento(s): ALTERACAO DE NOME EMPRESARIAL
ALTERACAO DE SOCIO/TITULAR / ADMINISTRADOR
TRANSFORMACAO AUTOMATICA DE EIRELI EM LTDA (ART. 41 DA LEI 14.195/2021)
ALTERACAO
Data de Aprovação:26/01/2023 - Número:2004670
Evento(s): ALTERACAO DE DADOS (EXCETO NOME EMPRESARIAL)
CONSOLIDACAO DE CONTRATO/ESTATUTO
`;

  it('Documento A real continua reconhecido, com todos os 4 arquivamentos e o NIRE corretos (prova de não-regressão)', () => {
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_A_REAL).dados;
    expect(resultado.documento_compativel).toBe(true);
    expect(resultado.nire).toBe('52206183723');
    expect(resultado.razao_social).toBe('PALUMA BURGER LTDA');
    expect(resultado.cnpj).toBe('52.008.360/0001-33');
    expect(resultado.historico_arquivamentos).toHaveLength(4);
    expect(resultado.data_registro).toBe('2025-06-06');
  });

  it('Documento B real passa a ser reconhecido como Atos da Junta (era o caso rejeitado da missão)', () => {
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_REAL).dados;
    expect(resultado.documento_compativel).toBe(true);
    expect(resultado.documento_identidade_evidencias).not.toContain('indicador_textual');
    expect(resultado.documento_identidade_evidencias).toEqual(
      expect.arrayContaining(['nire', 'historico_arquivamentos']),
    );
  });

  it('Documento B real: o NIRE é corretamente inferido do Ato Constitutivo (EIRELI), mesmo sem o rótulo "NIRE" e sem a palavra "constituição"', () => {
    // Causa raiz adicional encontrada com o documento real: o ato de
    // constituição deste documento usa "ATO CONSTITUTIVO", não
    // "CONSTITUIÇÃO"/"CONSTITUINTE" -- a lista de palavras-chave já usada
    // para reconhecer atos de registro (histórico + inferência de NIRE)
    // reconhecia só o radical "constituic", que não cobre "constitutivo".
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_REAL).dados;
    expect(resultado.nire).toBe('53600026039');
    const atoConstitutivo = resultado.historico_arquivamentos.find((item: any) => item.numero === '53600026039');
    expect(atoConstitutivo?.tipo_ato).toContain('ATO CONSTITUTIVO');
  });

  it('Documento B real: razão social não é inventada a partir do título de um ato (ex.: "ATO CONSTITUTIVO - EIRELI") quando o documento não traz o nome da empresa', () => {
    // Antes da correção, o fallback "linha solta contendo LTDA/EIRELI"
    // confundia o CABEÇALHO de um cartão de ato ("ATO CONSTITUTIVO -
    // EIRELI") com o nome da empresa, porque a palavra "EIRELI" aparece
    // nos dois contextos. Este documento não traz nenhum campo de nome
    // empresarial -- o correto é não localizado, nunca um valor inventado.
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_REAL).dados;
    expect(resultado.razao_social).toBeNull();
  });

  it('Documento B real: histórico completo tem os 4 atos, cada um com o tipo correto (sem contaminação entre blocos vizinhos)', () => {
    const resultado = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_REAL).dados;
    const porNumero = (numero: string) => resultado.historico_arquivamentos.find((item: any) => item.numero === numero);

    expect(porNumero('20130711675')?.tipo_ato).toContain('ENQUADRAMENTO');
    expect(porNumero('53600026039')?.tipo_ato).toContain('ATO CONSTITUTIVO');
    expect(porNumero('1959107')?.data).toBe('2021-08-27');
    expect(porNumero('2004670')?.data).toBe('2023-01-26');
    expect(resultado.historico_arquivamentos).toHaveLength(4);
  });

  it('a Etapa 2 não gera mais o alerta "não reconhecido" para o Documento B real ao ser confrontado com um Contrato Social que cita o mesmo NIRE', () => {
    const atos = analisarTextoDocumentoLocal('atos_junta_comercial', DOCUMENTO_B_REAL).dados;
    const contrato = { documento_compativel: true, nire: '53600026039', data_registro: '2023-01-26' };

    const alertas = validarContratoComAtosJunta(contrato, atos);

    expect(alertas.some((a) => a.codigo === 'atos_junta_incompativel')).toBe(false);
    expect(alertas.some((a) => a.codigo === 'contrato_junta_nire_divergente')).toBe(false);
  });
});
