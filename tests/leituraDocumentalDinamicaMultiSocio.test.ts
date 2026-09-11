import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { normalizarDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';
import { validarIdentidadeSocioExtraida } from '../server/services/regrasDocumentaisCredito';

// CORREÇÃO (11/09/2026, rodada seguinte -- pedido explícito do usuário, com
// CNH, comprovante de endereço e Declaração de IRPF REAIS anexados, ainda
// presos em "Revisão necessária"/"Incompatível" mesmo após a rodada
// anterior): esta suíte reproduz, com dados sintéticos (nunca os dados reais
// do usuário), os padrões estruturais que causavam a falha em cada um dos
// quatro documentos reais anexados -- confirmados um a um contra o texto
// real antes desta correção, e revalidados aqui de forma permanente para que
// nenhuma dessas regressões volte a ocorrer silenciosamente.
describe('leitura documental dinâmica -- documento de identidade do sócio (RG/CNH/Passaporte) via OCR ruidoso', () => {
  // Reproduz o padrão real de uma CNH cujo conteúdo só existe como imagem
  // embutida no PDF (sem camada de texto nativa): o OCR local lê os rótulos
  // oficiais ("4d CPF", "5 Nº REGISTRO") de forma corrompida, mas o padrão
  // visual dos VALORES (pontuação do CPF em posição fixa, dígitos do
  // registro adjacentes) sobrevive -- e o campo NOME sai colado ao campo
  // vizinho da mesma fileira do formulário (uma data), exigindo limpeza.
  const CNH_OCR_RUIDOSO = `Carteira Nacional de Habilitação (CNH) - SENATRAN
CARTEIRA NACIONAL DE HABILITAÇÃO / DRIVER LICENSE
2 1 NOME E SOBRENOME 1º HABILITAÇÃO
CARLOS EDUARDO SANTOS } 15/03/2018 [=] La al Te] - oO rity] oO +
3 DATA, LOCAL E UF DE NASCIMENTO
20/05/1990, GOIANIA, GO
£ "= Ned SER | 123.456.789-01 98765432100 AB
2 NACIONALIDADE
BRASILEIRO(A)`;

  it('extrai nome, CPF e nº de registro mesmo com rótulos oficiais corrompidos pelo OCR', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', CNH_OCR_RUIDOSO);
    expect(r.dados.tipo_detectado_local).toBe('CNH');
    expect(r.dados.documento_compativel).toBe(true);
    // Nome limpo -- sem a data e o ruído do campo vizinho ("1º HABILITAÇÃO")
    // que o OCR colou na mesma linha visual.
    expect(r.dados.nome).toBe('CARLOS EDUARDO SANTOS');
    // CPF encontrado pelo padrão visual (pontuação fixa), não pelo rótulo
    // (que saiu ilegível do OCR).
    expect(r.dados.cpf).toBe('123.456.789-01');
    // Nº de registro encontrado por proximidade ao CPF já localizado, já que
    // o rótulo "Nº REGISTRO" também saiu ilegível.
    expect(r.dados.numero_documento).toBe('98765432100');
    expect(r.dados.data_nascimento).toBe('1990-05-20');
  });

  // Passaporte: quarto subtipo de documento de identidade do sócio, pedido
  // explícito do usuário ("anexar RG, anexar passaporte, anexar CNH... saber
  // aonde é a leitura e os dados que têm que ser extraídos de cada um").
  // Diferente de RG/CNH/CPF, o passaporte brasileiro não imprime CPF na
  // página de dados -- o número do próprio passaporte é o identificador.
  const PASSAPORTE_TEXTO = `REPÚBLICA FEDERATIVA DO BRASIL PASSPORT
Documento de viagem
Surname / Sobrenome
OLIVEIRA
Given Names / Prenomes
ANA CAROLINA
Passport No / Passaporte Nº
FZ123456`;

  it('reconhece passaporte como um quarto subtipo de documento de identidade, com número do próprio passaporte', () => {
    const r = analisarTextoDocumentoLocal('documento_identidade_socio', PASSAPORTE_TEXTO);
    expect(r.dados.tipo_detectado_local).toBe('PASSAPORTE');
    expect(r.dados.documento_compativel).toBe(true);
    expect(r.dados.numero_documento).toBe('FZ123456');
  });
});

describe('leitura documental dinâmica -- comprovante de endereço com boleto de pagamento anexado', () => {
  // Reproduz a estrutura de uma fatura/conta REAL: cabeçalho com o endereço
  // do PRESTADOR do serviço (com um número de Inscrição Estadual que, por
  // coincidência de formato, se parece com um CEP), um bloco de
  // correspondência sem rótulo com o endereço do próprio titular, e o boleto
  // de pagamento anexado (padrão FEBRABAN, presente em praticamente toda
  // conta/fatura brasileira), cujo campo padrão "Endereço do
  // Beneficiário"/"Sacador/Avalista" identifica o EMISSOR da cobrança, não o
  // cliente.
  const COMPROVANTE_COM_BOLETO_ANEXADO = `PROVEDORA DE INTERNET EXEMPLO LTDA
RUA DA EMPRESA, 100 - CENTRO
CIDADE EXEMPLO - SP - CEP:01.310-100
CNPJ: 11.222.333/0001-44
Inscrição Estadual: 99887766

Extrato para simples conferência
Conta de internet
Data de emissão: 05/08/2026
AGO 2026

CARLOS EDUARDO SANTOS

Rua das Flores, 456, Apto 12,
Bairro Jardim, 12345678 - Cidade B - RJ

CPF
12345678901

Endereço do Beneficiário                                      UF        CEP
RUA DA EMPRESA, 100 - CENTRO                                   SP        01310-100

Pagador                                                        CPF/CNPJ  12345678901
CARLOS EDUARDO SANTOS                                          UF  RJ  CEP  12345678

Sacador/Avalista
PROVEDORA DE INTERNET EXEMPLO LTDA`;

  it('extrai nome e endereço do TITULAR (bloco de correspondência sem rótulo), nunca do prestador/beneficiário do boleto anexado', () => {
    const r = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_COM_BOLETO_ANEXADO);
    expect(r.dados.nome_titular).toBe('CARLOS EDUARDO SANTOS');
    expect(r.dados.endereco_completo).toContain('Rua das Flores');
    expect(r.dados.endereco_completo).toContain('Cidade B - RJ');
    // Nunca o endereço do prestador do serviço (cabeçalho) nem o do
    // "Beneficiário" do boleto anexado.
    expect(r.dados.endereco_completo).not.toContain('RUA DA EMPRESA');
  });

  it('nunca usa o número de Inscrição Estadual (nem outro ID de 8 dígitos solto no documento) como CEP', () => {
    const r = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_COM_BOLETO_ANEXADO);
    expect(r.dados.cep).not.toBe('99887766');
  });

  it('status_documental final: DADO_COMPROVADO, com identidade central confirmada pela leitura assistida', () => {
    const r = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_COM_BOLETO_ANEXADO);
    const extraidos = { ...r.dados, confianca: r.confianca, mecanismo_extracao: 'pdftotext' };
    const normalizado = normalizarDocumentoCatalogado(extraidos, 'comprovante_residencia');
    expect(normalizado.dados.status_documental).toBe('DADO_COMPROVADO');
    expect(normalizado.classificacao?.identidade_status).toBe('IDENTIFICADO');
  });
});

describe('leitura documental dinâmica -- classificador central não confunde boleto anexado com instrumento de Aval', () => {
  // "Sacador/Avalista" é o nome de campo padrão (FEBRABAN) impresso em
  // QUALQUER boleto bancário emitido no Brasil, de qualquer prestador de
  // serviço -- não é evidência de que o arquivo seja um instrumento de
  // aval/garantia de crédito.
  it('não classifica um comprovante com boleto anexado como "AVAL" só por causa do rótulo padrão do boleto', () => {
    const textoComBoleto = 'Extrato para conferência\nOLÁ, CLIENTE\nSacador/Avalista\nEMPRESA TESTE LTDA';
    const classificacao = classificarDocumentoDeterministico({ tipoEsperado: 'comprovante_residencia', texto: textoComBoleto });
    expect(classificacao.tipo_detectado).not.toBe('AVAL');
    expect(classificacao.identidade_status).not.toBe('INCOMPATIVEL');
  });

  it('zero regressão: um instrumento de aval de verdade continua sendo identificado como AVAL', () => {
    const textoAvalReal = 'O AVALISTA do presente contrato de empréstimo se compromete a garantir o pagamento integral da dívida em caso de inadimplência do devedor principal.';
    const classificacao = classificarDocumentoDeterministico({ tipoEsperado: 'garantia', texto: textoAvalReal });
    expect(classificacao.tipo_detectado).toBe('AVAL');
  });

  it('zero regressão: "garantidor solidário" continua sendo identificado como AVAL', () => {
    const texto = 'O garantidor solidário assina abaixo, em conjunto com o devedor principal, respondendo integralmente pela dívida.';
    const classificacao = classificarDocumentoDeterministico({ tipoEsperado: 'garantia', texto });
    expect(classificacao.tipo_detectado).toBe('AVAL');
  });
});

describe('leitura documental dinâmica -- Declaração de IRPF, CPF não sangra para a coluna vizinha', () => {
  // `pdftotext -layout` imprime "CPF: 038.211.981-92" e, na mesma linha
  // visual, bem mais à direita, "IMPOSTO SOBRE A RENDA - PESSOA FÍSICA"
  // (documento em duas colunas). Como as linhas chegam ao parser com os
  // espaços múltiplos (que demarcavam a coluna) colapsados em um só, uma
  // extração baseada em "resto da linha após o rótulo" capturaria o texto da
  // coluna vizinha junto.
  it('extrai o CPF correto mesmo com o rótulo "CPF:" colado, na mesma linha, ao título da coluna vizinha', () => {
    const texto = `DECLARAÇÃO DE AJUSTE ANUAL
Exercício: 2026                        Ano-calendário: 2025
Nome: CARLOS EDUARDO SANTOS
CPF: 123.456.789-01                    IMPOSTO SOBRE A RENDA - PESSOA FÍSICA
Bem ou direito pertencente ao: Titular CPF: 999.999.999-99`;
    const r = analisarTextoDocumentoLocal('declaracao_irpf', texto);
    expect(r.dados.cpf).toBe('123.456.789-01');
    expect(r.dados.nome).toBe('CARLOS EDUARDO SANTOS');
    expect(r.dados.ano_calendario).toBe(2025);
  });
});

describe('leitura documental dinâmica -- diagnóstico da leitura automática exposto como alerta (zero código novo de frontend)', () => {
  it('sinaliza quando a extração ficou parcial, com o motivo quando disponível', () => {
    const normalizado = normalizarDocumentoCatalogado(
      { extracao_parcial: true, motivo_extracao_parcial: 'somente 2 de 5 páginas foram lidas', documento_compativel: true, nome: 'X' },
      'documento_socio',
    );
    expect(normalizado.alertas.map((a) => a.codigo)).toContain('leitura_automatica_parcial');
  });

  it('sinaliza quando a leitura veio de OCR (reconhecimento de imagem), mais sujeita a erro', () => {
    const normalizado = normalizarDocumentoCatalogado(
      { mecanismo_extracao: 'tesseract', documento_compativel: true, nome: 'X', numero_documento: '123' },
      'documento_socio',
    );
    expect(normalizado.alertas.map((a) => a.codigo)).toContain('leitura_via_reconhecimento_de_imagem');
  });

  it('não gera nenhum dos dois alertas quando a leitura veio completa da camada de texto nativa', () => {
    const normalizado = normalizarDocumentoCatalogado(
      { mecanismo_extracao: 'pdftotext', documento_compativel: true, nome: 'X', numero_documento: '123' },
      'documento_socio',
    );
    expect(normalizado.alertas.map((a) => a.codigo)).not.toContain('leitura_via_reconhecimento_de_imagem');
    expect(normalizado.alertas.map((a) => a.codigo)).not.toContain('leitura_automatica_parcial');
  });
});

describe('validarIdentidadeSocioExtraida -- confronto do documento de identidade/IRPF contra o QSA (sócios_empresa)', () => {
  const socios = [
    { id: 's1', nome: 'CARLOS EDUARDO SANTOS', cpf: '123.456.789-01', ativo: true },
    { id: 's2', nome: 'MARIANA COSTA LIMA', cpf: '987.654.321-00', ativo: true },
  ];

  it('confirma identidade quando CPF e nome do documento batem com o sócio ao qual o arquivo foi anexado', () => {
    const r = validarIdentidadeSocioExtraida(socios, { cpf: '123.456.789-01', nome: 'CARLOS EDUARDO SANTOS' }, 's1', 'CNH');
    expect(r.dados.identidade_socio_confere).toBe(true);
    expect(r.dados.exige_justificativa_identidade).toBe(false);
    expect(r.alertas).toEqual([]);
  });

  it('sinaliza divergência (CPF e nome) quando o documento pertence a outra pessoa, sem redirecionar automaticamente', () => {
    const r = validarIdentidadeSocioExtraida(socios, { cpf: '999.999.999-99', nome: 'OUTRA PESSOA QUALQUER' }, 's1', 'CNH');
    expect(r.dados.identidade_socio_confere).toBe(false);
    expect(r.dados.exige_justificativa_identidade).toBe(true);
    expect(r.alertas.map((a) => a.codigo).sort()).toEqual(['identidade_cpf_diferente_socio', 'identidade_nome_diferente_socio']);
  });

  it('detecta um documento anexado no card do sócio errado (mesma empresa, múltiplos sócios)', () => {
    const r = validarIdentidadeSocioExtraida(socios, { cpf: '987.654.321-00', nome: 'MARIANA COSTA LIMA' }, 's1', 'CNH');
    expect(r.dados.identidade_socio_confere).toBe(false);
    expect(r.dados.exige_justificativa_identidade).toBe(true);
  });

  it('quando o documento não traz CPF (ex.: comprovante de endereço), confirma pelo nome, sem exigir CPF', () => {
    const r = validarIdentidadeSocioExtraida(socios, { nome_titular: 'CARLOS EDUARDO SANTOS' }, 's1', 'comprovante de residência');
    expect(r.dados.cpf_confere_com_socio).toBeNull();
    expect(r.dados.nome_confere_com_socio).toBe(true);
    expect(r.dados.identidade_socio_confere).toBe(true);
    expect(r.alertas).toEqual([]);
  });

  it('quando o arquivo não está vinculado a nenhum sócio específico (socioAlvoId nulo), não afirma nem nega identidade', () => {
    const r = validarIdentidadeSocioExtraida(socios, { cpf: '123.456.789-01', nome: 'CARLOS EDUARDO SANTOS' }, null, 'CNH');
    expect(r.dados.identidade_socio_confere).toBeNull();
    expect(r.alertas).toEqual([]);
  });
});
