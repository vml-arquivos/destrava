import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { normalizarDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';

// CORREÇÃO (11/09/2026, pedido explícito do usuário: "o comprovante de
// endereço também está dando como incompatível [revisão]"): o perfil de
// análise de `comprovante_residencia` exige `endereco_completo` como campo
// essencial (`registrarPerfis(['comprovante_residencia'], ['nome_titular',
// 'endereco_completo', 'data_emissao'], ...)`), mas o leitor local nunca
// extraía esse campo -- ficava permanentemente ausente para QUALQUER
// comprovante de endereço anexado ao sistema, de qualquer empresa,
// independente da qualidade ou legibilidade do arquivo (confirmado com um
// comprovante sintético perfeito, sem nenhuma falha de leitura possível:
// mesmo assim `endereco_completo` nunca aparecia). Corrigido para compor o
// endereço a partir de um rótulo explícito ou dos campos separados que
// contas de concessionária/comprovantes costumam trazer (logradouro,
// bairro, município, UF, CEP).
const COMPROVANTE_CAMPOS_SEPARADOS = `EQUATORIAL GOIÁS
CONTA DE ENERGIA ELÉTRICA
Cliente: JONNATHAS RODRIGUES PIRES
Endereço: RUA AFONSO PENA, SN, RES KALAHARI
Bairro: VILA DOS ALPES
Município: GOIANIA
UF: GO
CEP: 74310-375
Data de emissão: 05/08/2026
Mês de referência: 08/2026
Valor a pagar: R$ 152,30`;

const COMPROVANTE_ENDERECO_ROTULADO = `SANEAGO - COMPANHIA DE SANEAMENTO DE GOIÁS
FATURA DE ÁGUA E ESGOTO
Titular: MARIA DA SILVA SANTOS
Endereço completo: AVENIDA T-9, 1234, SETOR BUENO, GOIANIA - GO, CEP 74223-060
Data de emissão: 12/07/2026
Referência: 07/2026`;

describe('parseComprovanteResidencia -- endereco_completo (campo essencial que nunca era extraído)', () => {
  it('compõe o endereço a partir de campos separados (logradouro, bairro, município, UF, CEP)', () => {
    const r = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_CAMPOS_SEPARADOS);
    expect(r.dados.endereco_completo).toBeTruthy();
    expect(r.dados.endereco_completo).toContain('RUA AFONSO PENA');
    expect(r.dados.endereco_completo).toContain('VILA DOS ALPES');
    expect(r.dados.endereco_completo).toContain('GOIANIA - GO');
    expect(r.dados.endereco_completo).toContain('74310-375');
  });

  it('usa diretamente um endereço já completo quando o rótulo já traz tudo junto', () => {
    const r = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_ENDERECO_ROTULADO);
    expect(r.dados.endereco_completo).toBe('AVENIDA T-9, 1234, SETOR BUENO, GOIANIA - GO, CEP 74223-060');
  });

  it('zero regressão: nome_titular, data_emissao e mes_referencia continuam extraídos como antes', () => {
    const r = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_CAMPOS_SEPARADOS);
    expect(r.dados.nome_titular).toBe('JONNATHAS RODRIGUES PIRES');
    expect(r.dados.data_emissao).toBe('2026-08-05');
    expect(r.dados.mes_referencia).toBe('08/2026');
  });

  it('status_documental final deixa de ficar preso em "Revisão necessária" -- passa a DADO_COMPROVADO', () => {
    const leitura = analisarTextoDocumentoLocal('comprovante_residencia', COMPROVANTE_CAMPOS_SEPARADOS);
    const extraidos = { ...leitura.dados, confianca: leitura.confianca, __texto_local: COMPROVANTE_CAMPOS_SEPARADOS };
    const normalizado = normalizarDocumentoCatalogado(extraidos, 'comprovante_residencia');
    expect(normalizado.dados.status_documental).toBe('DADO_COMPROVADO');
    expect(normalizado.dados.campos_essenciais_ausentes).toEqual([]);
  });
});
