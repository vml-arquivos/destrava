import { describe, expect, it } from 'vitest';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { normalizarDocumentoCatalogado, tipoLeitorLocalDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';

// CORREÇÃO (11/09/2026, mesmo pedido do usuário, com Declaração de Ajuste
// Anual e Recibo de entrega reais anexados): dois defeitos sistemáticos no
// parser genérico, reproduzíveis em QUALQUER declaração de IRPF de qualquer
// sócio -- não específicos desta empresa: (1) `ano_calendario` capturava o
// ano do EXERCÍCIO (sempre um ano à frente do correto), porque "Exercício"
// sempre vem antes de "Ano-calendário" no cabeçalho oficial da Receita
// Federal e a regra genérica aceita qualquer um dos dois rótulos, vencendo
// sempre o primeiro; (2) `titular` capturava lixo de uma linha de tabela de
// rendimentos que começa com a palavra "Titular" (identificador de
// beneficiário na tabela, não o nome do declarante) -- toda declaração que
// lista rendimento de sócio/capital social tem essa linha. Além disso, o
// Recibo de entrega (`recibo_irpf`) nunca tinha um tipo de classificação
// próprio -- caía sempre na detecção genérica de "IRPF" e, como o campo
// espera "RECIBO_IRPF" (tipo distinto, no mesmo espírito de RECIBO_ECF x ECF
// já existente), QUALQUER recibo de entrega real era marcado "Documento
// incompatível", sempre -- nunca um problema desta empresa específica.
const DEC_TEXTO_REAL = `NOME:    JONNATHAS RODRIGUES PIRES
CPF:   038.211.981-92
DECLARAÇÃO DE AJUSTE ANUAL
IMPOSTO SOBRE A RENDA - PESSOA FÍSICA
EXERCÍCIO 2026    ANO-CALENDÁRIO 2025
IDENTIFICAÇÃO DO CONTRIBUINTE
Nome: JONNATHAS RODRIGUES PIRES
Data de Nascimento: 11/01/1996
Endereço: RUA AFONSO PENA
RENDIMENTOS TRIBUTÁVEIS RECEBIDOS DE PESSOA JURÍDICA PELO TITULAR
NOME DA FONTE PAGADORA REND. RECEBIDA DE PES. JURÍDICA
COOPERATIVA DE CREDITO DE LIVRE ADMISSAO DO SUDOESTE GOIANO
CNPJ/CPF: 24.795.049/0001-46
178,11 0,00 0,00 0,00 0,00
RENDIMENTOS ISENTOS E NÃO TRIBUTÁVEIS
13. Rendimento de sócio ou titular de microempresa ou empresa de pequeno porte optante pelo Simples Nacional 75.980,00
Beneficiário CPF CNPJ da Fonte Pagadora Nome da Fonte Pagadora Valor
Titular 038.211.981-92 52.008.360/0001-33 PALUMA BURGER LTDA 75.980,00
DECLARAÇÃO DE BENS E DIREITOS
03 02 QUOTAS SICOOB - CAPITAL SOCIAL 4.174,68 4.453,34
105 - Brasil Bem com usufruto: Não
Bem ou direito pertencente ao: Titular CPF: 038.211.981-92
CNPJ: 24.795.049/0001-46
Controle: 962233188904864 Página 1 de 9 Data/Hora da Entrega: 18/08/2026 às 13:52:15`;

const REC_TEXTO_REAL = `MINISTÉRIO DA FAZENDA IMPOSTO SOBRE A RENDA - PESSOA FÍSICA
SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL EXERCÍCIO 2026 ANO-CALENDÁRIO 2025
RECIBO DE ENTREGA DA DECLARAÇÃO DE AJUSTE ANUAL - OPÇÃO PELO DESCONTO SIMPLIFICADO
IDENTIFICAÇÃO DO DECLARANTE
CPF do declarante Nome do declarante
038.211.981-92 JONNATHAS RODRIGUES PIRES
Endereço
RUA AFONSO PENA
TOTAL RENDIMENTOS TRIBUTÁVEIS 178,11
Declaração recebida via Internet JV
 pelo Agente Receptor SERPRO
 em 18/08/2026 às 13:52:15
1309046737
Sr(a) JONNATHAS RODRIGUES PIRES, inscrito no CPF sob o nº 038.211.981-92.
O NÚMERO DO RECIBO de sua declaração apresentada em 18/08/2026, às 13:52:15, é:
18.53.84.52.55 - 08
Este número é de uso pessoal e NÃO deve ser fornecido a terceiros.`;

describe('tipoLeitorLocalDocumentoCatalogado -- irpf/recibo_irpf roteiam para leitores dedicados', () => {
  it.each(['irpf', 'imposto_renda', 'irpf_socio'])('%s vira declaracao_irpf', (tipo) => {
    expect(tipoLeitorLocalDocumentoCatalogado(tipo)).toBe('declaracao_irpf');
  });
  it('recibo_irpf vira recibo_irpf', () => {
    expect(tipoLeitorLocalDocumentoCatalogado('recibo_irpf')).toBe('recibo_irpf');
  });
});

describe('parseDeclaracaoIrpf -- Declaração de Ajuste Anual completa real', () => {
  it('ano_calendario é o ano-calendário (2025), não o exercício (2026)', () => {
    const r = analisarTextoDocumentoLocal('declaracao_irpf', DEC_TEXTO_REAL, 'irpf');
    expect(r.dados.ano_calendario).toBe(2025);
  });

  it('titular é o nome do declarante, não a linha de tabela "Titular <cpf> <cnpj> <fonte> <valor>"', () => {
    const r = analisarTextoDocumentoLocal('declaracao_irpf', DEC_TEXTO_REAL, 'irpf');
    expect(r.dados.titular).toBe('JONNATHAS RODRIGUES PIRES');
  });

  it('reconhece a declaração completa como compatível, distinta do recibo de entrega', () => {
    const r = analisarTextoDocumentoLocal('declaracao_irpf', DEC_TEXTO_REAL, 'irpf');
    expect(r.dados.documento_compativel).toBe(true);
    const recibo = analisarTextoDocumentoLocal('declaracao_irpf', REC_TEXTO_REAL, 'irpf');
    expect(recibo.dados.documento_compativel).toBe(false);
  });

  it('define a competência do ano-calendário, satisfazendo a política temporal "competencia_anual" do perfil', () => {
    const r = analisarTextoDocumentoLocal('declaracao_irpf', DEC_TEXTO_REAL, 'irpf');
    expect(r.dados.competencia).toEqual({ inicio: '2025-01-01', fim: '2025-12-31' });
  });

  it('status_documental final deixa de ficar preso em revisão e passa a DADO_COMPROVADO', () => {
    const leitura = analisarTextoDocumentoLocal('declaracao_irpf', DEC_TEXTO_REAL, 'irpf');
    const extraidos = { ...leitura.dados, confianca: leitura.confianca, __texto_local: DEC_TEXTO_REAL };
    const normalizado = normalizarDocumentoCatalogado(extraidos, 'irpf');
    expect(normalizado.dados.status_documental).toBe('DADO_COMPROVADO');
  });
});

describe('parseReciboIrpf -- Recibo de entrega real', () => {
  it('extrai CPF e o nome do declarante a partir da linha "cpf nome" da tabela de identificação', () => {
    const r = analisarTextoDocumentoLocal('recibo_irpf', REC_TEXTO_REAL, 'recibo_irpf');
    expect(r.dados.cpf).toBe('038.211.981-92');
    expect(r.dados.titular).toBe('JONNATHAS RODRIGUES PIRES');
  });

  it('extrai o número oficial do recibo no formato XX.XX.XX.XX.XX-XX impresso pela Receita Federal', () => {
    const r = analisarTextoDocumentoLocal('recibo_irpf', REC_TEXTO_REAL, 'recibo_irpf');
    expect(r.dados.recibo_ou_protocolo).toBe('18.53.84.52.55-08');
  });

  it('ano_calendario correto (2025, não 2026) também no recibo', () => {
    const r = analisarTextoDocumentoLocal('recibo_irpf', REC_TEXTO_REAL, 'recibo_irpf');
    expect(r.dados.ano_calendario).toBe(2025);
  });

  it('reconhece o recibo como compatível', () => {
    const r = analisarTextoDocumentoLocal('recibo_irpf', REC_TEXTO_REAL, 'recibo_irpf');
    expect(r.dados.documento_compativel).toBe(true);
    expect(r.dados.tipo_detectado_local).toBe('RECIBO_IRPF');
  });

  it('status_documental final deixa de ser "Documento incompatível" e passa a DADO_COMPROVADO', () => {
    const leitura = analisarTextoDocumentoLocal('recibo_irpf', REC_TEXTO_REAL, 'recibo_irpf');
    const extraidos = { ...leitura.dados, confianca: leitura.confianca, __texto_local: REC_TEXTO_REAL };
    const normalizado = normalizarDocumentoCatalogado(extraidos, 'recibo_irpf');
    expect(normalizado.dados.status_documental).toBe('DADO_COMPROVADO');
  });
});

describe('classificarDocumentoDeterministico -- RECIBO_IRPF é um tipo próprio, distinto de IRPF', () => {
  it('um recibo de entrega real é identificado como RECIBO_IRPF quando esperado recibo_irpf (antes: sempre INCOMPATIVEL)', () => {
    const r = classificarDocumentoDeterministico({ tipoEsperado: 'recibo_irpf', texto: REC_TEXTO_REAL });
    expect(r.tipo_detectado).toBe('RECIBO_IRPF');
    expect(r.identidade_status).toBe('IDENTIFICADO');
  });

  it('a declaração completa real continua identificada como IRPF quando esperado irpf (zero regressão)', () => {
    const r = classificarDocumentoDeterministico({ tipoEsperado: 'irpf', texto: DEC_TEXTO_REAL });
    expect(r.tipo_detectado).toBe('IRPF');
    expect(r.identidade_status).toBe('IDENTIFICADO');
  });

  it('zero regressão: RECIBO_ECF e RECIBO_PGDAS continuam detectados normalmente', () => {
    const ecf = classificarDocumentoDeterministico({ tipoEsperado: 'recibo_ecf', texto: 'Recibo de entrega da ECF - Escrituração Contábil Fiscal transmitida com sucesso.' });
    expect(ecf.tipo_detectado).toBe('RECIBO_ECF');
    const pgdas = classificarDocumentoDeterministico({ tipoEsperado: 'recibo_pgdas', texto: 'Recibo de entrega do PGDAS-D referente à competência informada.' });
    expect(pgdas.tipo_detectado).toBe('RECIBO_PGDAS');
  });
});
