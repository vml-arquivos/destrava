import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';

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

});
