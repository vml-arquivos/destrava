import { describe, expect, it } from 'vitest';
import {
  calcularCoberturaDocumentalSocios,
  regrasDocumentaisFallback,
  validarComprovanteEnderecoExtraido,
  validarFaturamentoExtraido,
  validarIdentidadeSocioExtraida,
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

  it('não inventa validade de endereço quando a operação não configurou recência', () => {
    const resultado = validarComprovanteEnderecoExtraido(socios, { mes_referencia: '01/2026', nome_titular: 'Terceiro da Silva' }, 's1', referencia);
    expect(resultado.dados.comprovante_dentro_validade).toBeNull();
    expect(resultado.dados.comprovante_dentro_politica_recencia).toBeNull();
    expect(resultado.alertas.map((alerta) => alerta.codigo)).not.toContain('endereco_fora_politica_recencia');
    expect(resultado.alertas.map((alerta) => alerta.codigo)).toContain('endereco_titular_diferente_socio');
  });

  it('aplica recência somente quando a política de crédito informa o limite', () => {
    const resultado = validarComprovanteEnderecoExtraido(
      socios,
      { mes_referencia: '05/2026', nome_titular: 'Maria da Silva' },
      's1',
      referencia,
      { maxMesesRecencia: 2 },
    );
    expect(resultado.dados.comprovante_dentro_politica_recencia).toBe(false);
    expect(resultado.alertas.map((alerta) => alerta.codigo)).toContain('endereco_fora_politica_recencia');
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

  it('confirma identidade por sócio e sinaliza divergência sem bloquear automaticamente', () => {
    const confirmado = validarIdentidadeSocioExtraida([
      { id: 's1', nome: 'Maria da Silva', cpf: '123.456.789-00', ativo: true },
      { id: 's2', nome: 'João Souza', cpf: '987.654.321-00', ativo: true },
    ], { nome: 'Maria da Silva', cpf: '12345678900' }, 's1', 'CNH');
    expect(confirmado.dados.identidade_socio_confere).toBe(true);
    expect(confirmado.alertas).toEqual([]);

    const divergente = validarIdentidadeSocioExtraida([
      { id: 's1', nome: 'Maria da Silva', cpf: '123.456.789-00', ativo: true },
      { id: 's2', nome: 'João Souza', cpf: '987.654.321-00', ativo: true },
    ], { nome: 'João Souza', cpf: '98765432100' }, 's1', 'CNH');
    expect(divergente.dados.exige_justificativa_identidade).toBe(true);
    expect(divergente.alertas.map((alerta) => alerta.codigo)).toEqual(expect.arrayContaining([
      'identidade_cpf_diferente_socio',
      'identidade_nome_diferente_socio',
    ]));
    expect(divergente.alertas.every((alerta) => alerta.severidade === 'media')).toBe(true);
  });

  it('não conta documento com divergência de identidade como cobertura completa do sócio', () => {
    const cobertura = calcularCoberturaDocumentalSocios(socios, [
      { socio_id: 's1', tipo_documento: 'documento_socio', dados_extraidos: { identidade_socio_confere: false } },
      { socio_id: 's1', tipo_documento: 'comprovante_residencia', dados_extraidos: { titular_confere_com_socio: true } },
      { socio_id: 's2', tipo_documento: 'documento_socio', dados_extraidos: { identidade_socio_confere: true } },
      { socio_id: 's2', tipo_documento: 'comprovante_residencia', dados_extraidos: { titular_confere_com_socio: true } },
    ], ['documento_socio', 'comprovante_residencia']);
    expect(cobertura.socios_completos).toBe(1);
    expect(cobertura.por_socio[0].tipos_faltantes).toEqual(['documento_socio']);
    expect(cobertura.por_socio[1].tipos_faltantes).toEqual([]);
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
    expect(regra?.validade_dias).toBeNull();
    expect(perfil.validadePadraoDias).toBeNull();
    expect(perfil.politicaTemporal).toBe('politica_credito_configuravel');
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
