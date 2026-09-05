import { describe, expect, it } from 'vitest';
import {
  calcularCoberturaDocumentalSocios,
  regrasDocumentaisFallback,
  validarComprovanteEnderecoExtraido,
  validarFaturamentoExtraido,
} from '../server/services/regrasDocumentaisCredito';
import { obterPerfilAnaliseDocumental } from '../server/services/documentAnalysisProfiles';

const referencia = new Date('2026-08-11T12:00:00Z');
const empresa = { cnpj: '12.345.678/0001-90' };
const socios = [
  { id: 's1', nome: 'Maria da Silva', administrador: true, ativo: true },
  { id: 's2', nome: 'João Souza', administrador: false, ativo: true },
];

describe('regras documentais de crédito', () => {
  it('aceita faturamento até o último mês fechado com assinaturas equivalentes', () => {
    const meses = Array.from({ length: 12 }, (_, indice) => {
      const data = new Date(Date.UTC(2025, 7 + indice, 1));
      return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const resultado = validarFaturamentoExtraido(empresa, socios, {
      cnpj: '12345678000190',
      meses_referencia: meses,
      data_assinatura: '2026-08-05',
      assinatura_socio_administrador: { presente: true, nome: 'Maria da Silva', tipo: 'eletrônica' },
      assinatura_contador: { presente: true, nome: 'Contador Teste', tipo: 'digital' },
    }, referencia);
    expect(resultado.alertas.filter((a) => ['alta', 'critica'].includes(a.severidade))).toEqual([]);
    expect(resultado.dados.ultimo_mes_identificado).toBe('2026-07');
    expect(resultado.dados.documento_obrigatorio).toBe(false);
  });

  it('reprova faturamento que inclui o mês corrente e assinaturas de modalidades diferentes', () => {
    const resultado = validarFaturamentoExtraido(empresa, socios, {
      cnpj: '12345678000190',
      meses_referencia: ['2026-08'],
      data_assinatura: '2026-08-11',
      assinatura_socio_administrador: { presente: true, nome: 'Maria da Silva', tipo: 'manual' },
      assinatura_contador: { presente: true, tipo: 'eletrônica' },
    }, referencia);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('faturamento_mes_ainda_nao_fechado');
    expect(resultado.alertas.map((a) => a.codigo)).toContain('faturamento_assinaturas_modalidades_divergentes');
  });

  it('aceita comprovante de junho em agosto e pede justificativa para terceiro', () => {
    const resultado = validarComprovanteEnderecoExtraido(socios, { mes_referencia: '06/2026', nome_titular: 'Terceiro da Silva' }, 's1', referencia);
    expect(resultado.dados.comprovante_dentro_validade).toBe(true);
    expect(resultado.dados.exige_justificativa_titular).toBe(true);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('endereco_titular_diferente_socio');
  });

  it('reprova comprovante anterior a dois meses', () => {
    const resultado = validarComprovanteEnderecoExtraido(socios, { mes_referencia: '05/2026', nome_titular: 'Maria da Silva' }, 's1', referencia);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('endereco_fora_validade_dois_meses');
  });

  it('calcula cobertura separada para todos os sócios', () => {
    const cobertura = calcularCoberturaDocumentalSocios(socios, [
      { socio_id: 's1', tipo_documento: 'documento_socio' },
      { socio_id: 's1', tipo_documento: 'comprovante_residencia' },
      { socio_id: 's2', tipo_documento: 'documento_socio' },
    ], ['documento_socio', 'comprovante_residencia']);
    expect(cobertura.total_socios).toBe(2);
    expect(cobertura.socios_completos).toBe(1);
    expect(cobertura.por_socio[1].tipos_faltantes).toEqual(['comprovante_residencia']);
  });

  // CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
  // independentes -- "Manus AI" e GPT -- sobre a matriz documental de
  // crédito): as duas concluem que o prazo de validade do comprovante de
  // residência é prática de mercado, não obrigação legal ("não regra legal
  // nacional encontrada"). A regra `socio_comprovante_residencia` estava
  // rotulada `tipo_exigencia: 'obrigacao_legal'` -- o oposto do que as
  // pesquisas confirmam.
  it('CORREÇÃO Rodada 33: comprovante de residência do sócio é rotulado como política bancária, não obrigação legal', () => {
    const regra = regrasDocumentaisFallback().find((item) => item.codigo === 'socio_comprovante_residencia');
    expect(regra).toBeDefined();
    expect(regra?.tipo_exigencia).toBe('politica_bancaria');
  });

  it('CORREÇÃO Rodada 33: o prazo de validade do comprovante de residência tem uma única fonte, compartilhada com documentAnalysisProfiles.ts', () => {
    const regra = regrasDocumentaisFallback().find((item) => item.codigo === 'socio_comprovante_residencia');
    const perfil = obterPerfilAnaliseDocumental('comprovante_residencia');
    expect(regra?.validade_dias).toBe(perfil.validadePadraoDias);
    expect(perfil.grauFonte).toBe('PRATICA_MERCADO');
  });

  it('CORREÇÃO Rodada 33: regras com citação confirmada por ambas as pesquisas (PGDAS-D, DEFIS, DASN-SIMEI, ECF) carregam fonte_normativa; comprovante de residência (política, não lei) não carrega', () => {
    const regras = regrasDocumentaisFallback();
    for (const codigo of ['empresa_pgdas', 'empresa_defis', 'empresa_dasn_simei', 'empresa_ecf']) {
      const regra = regras.find((item) => item.codigo === codigo);
      expect(regra?.fonte_normativa, `${codigo} deveria ter fonte_normativa`).toBeTruthy();
    }
    const comprovante = regras.find((item) => item.codigo === 'socio_comprovante_residencia');
    expect(comprovante?.fonte_normativa ?? null).toBeNull();
  });
});
