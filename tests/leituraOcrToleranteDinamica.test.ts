import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';

describe('leitura documental tolerante a OCR', () => {
  it('extrai CNH fotografada com rótulos quebrados e ruído de caracteres', () => {
    const resultado = analisarTextoDocumentoLocal('cnh', `
      CARTEIRA NACIONAL DE HABILITACAO
      NOME DO CONDUTOR
      MARIA DE SOUZA TESTE
      CPF: 123.45S.789-01
      N REGISTRO
      98765432100
      DATA DE NASCIMENTO 01/02/1980
      VALIDADE
      01/02/2030
    `, 'cnh', 'tesseract');
    expect(resultado.dados.nome).toContain('MARIA DE SOUZA');
    expect(resultado.dados.cpf).toBe('12345578901');
    expect(resultado.dados.numero_documento).toBe('98765432100');
    expect(resultado.dados.data_nascimento).toBe('1980-02-01');
    expect(resultado.dados.data_validade).toBe('2030-02-01');
  });

  it('extrai comprovante com titular na mesma linha e janela OCR ampliada', () => {
    const resultado = analisarTextoDocumentoLocal('comprovante_residencia', `
      CONTA DE ENERGIA
      TITULAR: JOAO DE SOUZA TESTE
      ENDERECO AVENIDA CENTRAL, 100
      CEP 70000-000
      VENCIMENTO: 15/08/2026
    `, 'comprovante_residencia', 'tesseract');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.nome_titular).toContain('JOAO DE SOUZA');
    expect(resultado.dados.data_emissao).toBe('2026-08-15');
  });

  it('extrai declaração IRPF com CPF e recibo sob ruído OCR', () => {
    const resultado = analisarTextoDocumentoLocal('imposto_renda', `
      DECLARACAO DE AJUSTE ANUAL DO IMPOSTO DE RENDA
      CPF do contribuinte: 987.654.321-00
      NOME DO CONTRIBUINTE
      ANA DE SOUZA TESTE
      ANO CALENDARIO: 2024
      NUMERO DO RECIBO
      ABCD123456789
      DATA DE TRANSMISSAO: 30/04/2025
    `, 'imposto_renda', 'tesseract');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.cpf).toBe('98765432100');
    expect(resultado.dados.titular).toContain('ANA DE SOUZA');
    expect(resultado.dados.ano_calendario).toBe('2024');
    expect(resultado.dados.recibo_ou_protocolo).toContain('ABCD123456789');
    expect(resultado.dados.data_transmissao).toBe('2025-04-30');
  });

  it('extrai recibo IRPF mesmo quando o texto destaca apenas a entrega', () => {
    const resultado = analisarTextoDocumentoLocal('recibo_irpf', `
      RECIBO DE ENTREGA DA DECLARACAO DE AJUSTE ANUAL
      CPF 111.222.333-44
      TITULAR: CARLOS DE SOUZA TESTE
      EXERCICIO 2025
      RECIBO: XYZ987654321
    `, 'recibo_irpf', 'tesseract');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.cpf).toBe('11122233344');
    expect(resultado.dados.recibo_ou_protocolo).toContain('XYZ987654321');
  });

  it('extrai CCMEI com CNPJ, titular, condição MEI e datas', () => {
    const resultado = analisarTextoDocumentoLocal('ccmei', `
      CERTIFICADO DA CONDICAO DE MICROEMPREENDEDOR INDIVIDUAL
      CNPJ 12.345.678/0001-90
      NOME EMPRESARIAL
      TESTE SERVICOS MEI
      TITULAR
      JOSE DE SOUZA TESTE
      CPF 222.333.444-55
      DATA DE INICIO: 01/03/2022
      EMITIDO EM: 10/01/2026
    `, 'ccmei', 'tesseract');
    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.cnpj).toBe('12.345.678/0001-90');
    expect(resultado.dados.cpf).toBe('22233344455');
    expect(resultado.dados.condicao_mei).toBe(true);
    expect(resultado.dados.data_inicio).toBe('2022-03-01');
    expect(resultado.dados.data_emissao).toBe('2026-01-10');
  });
});
