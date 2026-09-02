import { describe, expect, it } from 'vitest';
import {
  CHAVE_CONFIRMACAO_CADASTRAL_DOCUMENTO,
  deveIgnorarSincronizacaoAutomaticaSituacao,
  extrairConfirmacaoCadastralDocumento,
  montarPatchConfirmacaoCadastralDocumento,
} from '../server/utils/confirmacaoCadastralDocumento';

// Regra de negócio (2026-09-02, Rodada 20 -- pedido explícito do usuário, regressão
// causada pela própria Rodada 19): "Mas quando colocar o cartão do CNPJ, ele vai ler
// o cartão do CNPJ e o se o status da situação estiver apta... vai alterar no cadastro
// da empresa... Isso vai ser alterado e não vai sincronizar automaticamente alterando
// novamente pra inapta." Este módulo é o "contrato" compartilhado entre quem grava o
// selo de confirmação documental (leitura do Cartão CNPJ) e quem lê o selo para decidir
// se pula a sobrescrita (sincronização automática com as APIs gratuitas).

describe('confirmacaoCadastralDocumento -- montar/extrair (round-trip)', () => {
  it('monta o patch e a extração de volta devolve exatamente os mesmos dados', () => {
    const agora = new Date('2026-09-02T19:46:52.000Z');
    const patch = montarPatchConfirmacaoCadastralDocumento({
      situacaoCadastral: 'ATIVA',
      cartaoCnpjArquivoId: 'arquivo-123',
      dataEmissaoCartao: '2026-08-30',
      diasEmissaoCartao: 3,
      agora,
    });

    expect(patch).toHaveProperty(CHAVE_CONFIRMACAO_CADASTRAL_DOCUMENTO);

    const extraido = extrairConfirmacaoCadastralDocumento(patch);
    expect(extraido).toEqual({
      situacao_cadastral: 'ATIVA',
      confirmado_em: agora.toISOString(),
      cartao_cnpj_arquivo_id: 'arquivo-123',
      data_emissao_cartao: '2026-08-30',
      dias_emissao_cartao: 3,
      origem: 'leitura_cartao_cnpj',
    });
  });

  it('extrai corretamente quando o selo está misturado com outras chaves já existentes em dados_extra_receita', () => {
    const patch = montarPatchConfirmacaoCadastralDocumento({ situacaoCadastral: 'ATIVA' });
    const dadosExtraReceita = { enriquecimento_automatico: { origem: 'simulador' }, ...patch };
    const extraido = extrairConfirmacaoCadastralDocumento(dadosExtraReceita);
    expect(extraido?.situacao_cadastral).toBe('ATIVA');
  });

  it('valores default (sem cartão/data/dias informados) ficam null, nunca undefined', () => {
    const patch = montarPatchConfirmacaoCadastralDocumento({ situacaoCadastral: 'ATIVA' });
    const registro = (patch as any)[CHAVE_CONFIRMACAO_CADASTRAL_DOCUMENTO];
    expect(registro.cartao_cnpj_arquivo_id).toBeNull();
    expect(registro.data_emissao_cartao).toBeNull();
    expect(registro.dias_emissao_cartao).toBeNull();
  });
});

describe('confirmacaoCadastralDocumento -- extrairConfirmacaoCadastralDocumento (tolerância a formato inesperado)', () => {
  it.each([
    [null],
    [undefined],
    [{}],
    [{ confirmacao_cadastral_documento: null }],
    [{ confirmacao_cadastral_documento: 'texto-solto' }],
    [{ confirmacao_cadastral_documento: {} }],
    [{ confirmacao_cadastral_documento: { situacao_cadastral: 'ATIVA' } }], // sem confirmado_em
    [{ confirmacao_cadastral_documento: { confirmado_em: '2026-09-02T00:00:00.000Z' } }], // sem situacao_cadastral
    ['string solta'],
    [42],
  ])('retorna null para entrada inválida/incompleta: %j', (entrada) => {
    expect(extrairConfirmacaoCadastralDocumento(entrada)).toBeNull();
  });

  it('retorna null quando situacao_cadastral ou confirmado_em são strings vazias/só espaço', () => {
    expect(extrairConfirmacaoCadastralDocumento({
      confirmacao_cadastral_documento: { situacao_cadastral: '   ', confirmado_em: '2026-09-02T00:00:00.000Z' },
    })).toBeNull();
    expect(extrairConfirmacaoCadastralDocumento({
      confirmacao_cadastral_documento: { situacao_cadastral: 'ATIVA', confirmado_em: '' },
    })).toBeNull();
  });
});

describe('confirmacaoCadastralDocumento -- deveIgnorarSincronizacaoAutomaticaSituacao', () => {
  it('true quando existe selo de confirmação documental válido', () => {
    const patch = montarPatchConfirmacaoCadastralDocumento({ situacaoCadastral: 'ATIVA' });
    expect(deveIgnorarSincronizacaoAutomaticaSituacao(patch)).toBe(true);
  });

  it('false quando não existe dados_extra_receita, ou existe mas sem o selo -- zero regressão para empresas sem Cartão CNPJ lido', () => {
    expect(deveIgnorarSincronizacaoAutomaticaSituacao(null)).toBe(false);
    expect(deveIgnorarSincronizacaoAutomaticaSituacao(undefined)).toBe(false);
    expect(deveIgnorarSincronizacaoAutomaticaSituacao({})).toBe(false);
    expect(deveIgnorarSincronizacaoAutomaticaSituacao({ enriquecimento_automatico: { origem: 'simulador' } })).toBe(false);
  });
});
