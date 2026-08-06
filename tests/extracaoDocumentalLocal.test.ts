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

  it('preserva as colunas do endereço no Cartão CNPJ oficial', () => {
    const texto = `
      CADASTRO NACIONAL DA PESSOA JURÍDICA
      COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL
      NÚMERO DE INSCRIÇÃO
      52.008.360/0001-33 MATRIZ
      DATA DE ABERTURA
      29/08/2023
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
      56.11-2-03 - Lanchonetes, casas de chá, de sucos e similares
      CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
      206-2 - Sociedade Empresária Limitada
      PORTE
      ME
      LOGRADOURO                         NÚMERO       COMPLEMENTO
      RUA LATTES 349 QUADRA 10 L         349          QUADRA 10 LOTE 11 SALA 01
      CEP            BAIRRO/DISTRITO      MUNICÍPIO                  UF
      74333-060      JARDIM PLANALTO      GOIÂNIA                    GO
      SITUAÇÃO CADASTRAL
      ATIVA
      DATA DA SITUAÇÃO CADASTRAL
      29/08/2023
    `;

    const resultado = analisarTextoDocumentoLocal('cartao_cnpj', texto);

    expect(resultado.dados.endereco_confiavel).toBe(true);
    expect(resultado.dados.numero).toBe('349');
    expect(resultado.dados.cep).toBe('74333-060');
    expect(resultado.dados.municipio).toBe('GOIÂNIA');
    expect(resultado.dados.uf).toBe('GO');
    expect(resultado.dados.endereco_completo).not.toContain('COMPROVANTE DE INSCRIÇÃO');
    expect(resultado.dados.endereco_completo).not.toContain('52.008.360/0001-33');
  });

  it('não inventa endereço quando o texto do PDF está achatado e mistura rótulos', () => {
    const texto = `
      CADASTRO NACIONAL DA PESSOA JURÍDICA
      COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL
      NÚMERO DE INSCRIÇÃO
      52.008.360/0001-33 MATRIZ
      DATA DE ABERTURA
      29/08/2023
      NOME EMPRESARIAL
      PALUMA BURGER LTDA
      CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
      56.11-2-03 - Lanchonetes, casas de chá, de sucos e similares
      CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
      206-2 - Sociedade Empresária Limitada
      PORTE
      ME
      LOGRADOURO NÚMERO COMPLEMENTO
      NÚMERO COMPLEMENTO 52.008.360/0001-33 COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO
      CEP BAIRRO/DISTRITO MUNICÍPIO UF
      BAIRRO/DISTRITO MUNICÍPIO UF
      SITUAÇÃO CADASTRAL
      ATIVA
      DATA DA SITUAÇÃO CADASTRAL
      29/08/2023
    `;

    const resultado = analisarTextoDocumentoLocal('cartao_cnpj', texto);

    expect(resultado.dados.endereco_confiavel).toBe(false);
    expect(resultado.dados.endereco_completo).toBeNull();
    expect(resultado.dados.numero).toBeNull();
  });
  it('não confunde NÃO optante no SIMEI nem ausência de agendamento', () => {
    const texto = `
      CONSULTA OPTANTES
      CNPJ: 52.008.360/0001-33
      Situação no Simples Nacional: Optante pelo Simples Nacional desde 29/08/2023
      Situação no SIMEI: NÃO optante pelo SIMEI
      Não existe agendamento de exclusão do Simples Nacional.
    `;

    const resultado = analisarTextoDocumentoLocal('simples_nacional', texto);

    expect(resultado.dados.situacao_simples).toBe('Optante');
    expect(resultado.dados.regime_tributario).toBe('Simples Nacional');
    expect(resultado.dados.opcao_mei).toBe(false);
    expect(resultado.dados.agendamento_exclusao).toBe(false);
  });

});
