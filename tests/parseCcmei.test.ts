import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';

// CORREÇÃO (11/09/2026, pedido explícito do usuário com print real de uma
// empresa MEI real -- CCMEI anexado no campo dedicado (rodada anterior),
// mas preso para sempre em "Revisão necessária": "Campos essenciais não
// comprovados: titular, condicao_mei". Investigação (ver comentário em
// `parseCcmei`, `extracaoDocumentalLocal.ts`): antes desta correção, CCMEI
// não tinha NENHUM parser local dedicado -- caía no fallback genérico, cujo
// teto de confiança (0,65) nunca alcança o limiar de uso direto (0,72), e o
// rótulo real do CCMEI oficial para o nome do titular ("Nome Civil") não
// estava na lista de aliases reconhecidos.
//
// Texto de amostra abaixo aproxima o layout real do CCMEI oficial
// (gov.br/empresas-e-negocios), incluindo o cabeçalho quebrado em duas
// linhas (comum quando o PDF renderiza o título em duas linhas) -- exatamente
// o caso que o teste de tolerância a quebra de linha cobre.
const CCMEI_TEXTO_REAL = `
República Federativa do Brasil
Cadastro Nacional da Pessoa Jurídica

CERTIFICADO DA CONDIÇÃO DE
MICROEMPREENDEDOR INDIVIDUAL - CCMEI

Nome Civil: VILSON MARCIO DE LIMA
Nome Empresarial: VILSON MARCIO DE LIMA 70010668187
CNPJ: 29.705.345/0001-22
Data de Início das Atividades: 15/03/2018
Situação Cadastral: ATIVA

Ocupação (CBO)
Cabeleireiro

Código e Descrição das Atividades Econômicas
96.02-5-01 - Cabeleireiros

Natureza Jurídica: 213-5 - Empresário Individual

Este Certificado atesta os efeitos: (i) da inscrição do Empresário
Individual, (ii) do enquadramento como Microempreendedor Individual, e
(iii) da inscrição do Contribuinte no CNPJ.

Emitido no dia 10/09/2026 às 21:20:05 (data e hora de Brasília)
Código Verificador: 8F2A9C1D
`;

describe('parseCcmei (extracaoDocumentalLocal.ts) -- CCMEI real deixa de ficar preso em "Revisão necessária" por titular/condicao_mei nunca comprovados', () => {
  it('extrai "titular" pelo rótulo real do CCMEI oficial, "Nome Civil" -- rótulo ausente antes desta correção', () => {
    const resultado = analisarTextoDocumentoLocal('ccmei', CCMEI_TEXTO_REAL);
    expect(resultado.dados.titular).toBe('VILSON MARCIO DE LIMA');
  });

  it('reconhece "condicao_mei" mesmo com o cabeçalho oficial quebrado em duas linhas (tolerante a quebra de linha, texto normalizado)', () => {
    const resultado = analisarTextoDocumentoLocal('ccmei', CCMEI_TEXTO_REAL);
    expect(resultado.dados.condicao_mei).toBe(true);
    expect(resultado.dados.documento_compativel).toBe(true);
  });

  it('extrai também cnpj e nome_empresarial (campos essenciais herdados do parser genérico)', () => {
    const resultado = analisarTextoDocumentoLocal('ccmei', CCMEI_TEXTO_REAL);
    expect(resultado.dados.cnpj).toBe('29.705.345/0001-22');
    expect(resultado.dados.nome_empresarial).toBe('VILSON MARCIO DE LIMA 70010668187');
  });

  it('extrai campos adicionais do perfil de CCMEI: data_inicio e situacao', () => {
    const resultado = analisarTextoDocumentoLocal('ccmei', CCMEI_TEXTO_REAL);
    expect(resultado.dados.data_inicio).toBe('2018-03-15');
    expect(resultado.dados.situacao).toBe('ATIVA');
  });

  it('a confiança de um CCMEI real e legível ultrapassa o limiar de uso direto (0,72) -- antes desta correção, o teto do parser genérico (0,65) nunca alcançava esse limiar', () => {
    const resultado = analisarTextoDocumentoLocal('ccmei', CCMEI_TEXTO_REAL);
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.72);
  });

  it('zero regressão: os aliases genéricos anteriores ("titular", "empresário") continuam funcionando quando "Nome Civil" não está presente', () => {
    const textoSemNomeCivil = CCMEI_TEXTO_REAL.replace('Nome Civil: VILSON MARCIO DE LIMA\n', 'Titular: VILSON MARCIO DE LIMA\n');
    const resultado = analisarTextoDocumentoLocal('ccmei', textoSemNomeCivil);
    expect(resultado.dados.titular).toBe('VILSON MARCIO DE LIMA');
  });

  it('documento sem nenhuma evidência de CCMEI: condicao_mei e documento_compativel ficam null/false, sem inventar dado', () => {
    const textoQualquer = 'Certidão Negativa de Débitos\nCNPJ: 11.222.333/0001-81\nSituação: Negativa';
    const resultado = analisarTextoDocumentoLocal('ccmei', textoQualquer);
    expect(resultado.dados.condicao_mei).toBeNull();
    expect(resultado.dados.documento_compativel).toBe(false);
  });

  it('roteamento: tipoLeitorLocalDocumentoCatalogado("ccmei") aponta para o novo parser dedicado, não mais para o fallback genérico', () => {
    const conteudo = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'server/services/analiseDocumentalEspecializada.ts'),
      'utf8',
    );
    expect(conteudo).toContain("if (tipoCanonico === 'ccmei') return 'ccmei';");
  });
});
