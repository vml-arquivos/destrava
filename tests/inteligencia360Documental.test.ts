import { describe, expect, it, vi } from 'vitest';
import {
  buscarAnalisesDocumentaisAvancadas,
  calcularInteligencia360,
  consolidarEtapaIdentidadeDocumental,
} from '../server/services/inteligencia360Service';

const base = {
  empresa: {
    id: 'empresa-1',
    razao_social: 'Empresa Teste Ltda',
    cnpj: '12.345.678/0001-90',
    email: 'contato@empresa.com',
    telefone: '61999999999',
    cidade: 'Brasília',
    estado: 'DF',
    responsavel_nome: 'Ana Souza',
    responsavel_cpf: '111.222.333-44',
    cnae_principal: '6201501',
    capital_social: 100_000,
    faturamento_anual: 500_000,
    situacao_cadastral: 'Ativa',
    score_interno: 750,
  },
  socios: [{ nome: 'Ana Souza', cpf_cnpj: '111.222.333-44' }],
  documentos: [
    { tipo: 'cartao_cnpj', arquivo_path: '/docs/cartao.pdf', status: 'validado' },
    { tipo: 'contrato_social', arquivo_path: '/docs/contrato.pdf', status: 'validado' },
    { tipo: 'faturamento_12_meses', arquivo_path: '/docs/faturamento.pdf', status: 'validado' },
  ],
  simulacoes: [{ valor_solicitado: 50_000 }],
  contratos: [],
  historico: [],
  followups: [],
};

describe('Consistência Documental Avançada no motor 360', () => {
  it('incorpora alertas, recomendações, risco e penalidade de score', () => {
    const semAnalise = calcularInteligencia360(base);
    const comAnalise = calcularInteligencia360({
      ...base,
      analisesDocumentais: [{
        prompt_codigo: 'simples_extract',
        resultado: {
          tipo_analise: 'simples_nacional',
          alertas: [{
            codigo: 'simples_exclusao_agendada',
            mensagem: 'Exclusão do Simples Nacional agendada.',
            severidade: 'critica',
          }],
        },
      }],
    });

    expect(comAnalise.score_destrava).toBeLessThan(semAnalise.score_destrava);
    expect(comAnalise.risco_credito).toBe('critico');
    expect(comAnalise.pontos_atencao).toContain('Exclusão do Simples Nacional agendada.');
    expect(comAnalise.pendencias.some((p) => p.descricao.includes('Exclusão'))).toBe(true);
    expect(comAnalise.recomendacoes.some((r) => r.titulo === 'Verificar situação do Simples Nacional')).toBe(true);
    expect(comAnalise.consistencia_documental_avancada.total_criticos).toBe(1);
    expect(comAnalise.fonte).toBe('ia_assistida');
  });


  it('não cria recomendação de divergência quando a análise está concluída sem alertas', () => {
    const resultado = calcularInteligencia360({
      ...base,
      analisesDocumentais: [{
        prompt_codigo: 'qsa_extract',
        resultado: { tipo_analise: 'qsa', alertas: [] },
      }],
    });

    expect(resultado.consistencia_documental_avancada.disponivel).toBe(true);
    expect(resultado.consistencia_documental_avancada.alertas).toEqual([]);
    expect(resultado.recomendacoes.some((r) => r.titulo === 'Solicitar novo QSA atualizado')).toBe(false);
  });

  it('mantém comportamento anterior quando análises não são fornecidas', () => {
    const resultado = calcularInteligencia360(base);
    expect(resultado.consistencia_documental_avancada.disponivel).toBe(false);
    expect(resultado.pontos_atencao).toEqual([]);
    expect(resultado.fonte).toBe('deterministica');
  });

  it('status_aptidao é "EMPRESA APTA" quando não há alerta grave', () => {
    const resultado = calcularInteligencia360(base);
    expect(resultado.status_aptidao).toBe('EMPRESA APTA');
    expect(resultado.motivos_aptidao).toEqual([]);
  });

  it('status_aptidao vira "PONTOS DE ATENÇÃO" com alerta crítico da análise documental, com o motivo detalhado', () => {
    const resultado = calcularInteligencia360({
      ...base,
      analisesDocumentais: [{
        prompt_codigo: 'simples_extract',
        resultado: {
          tipo_analise: 'simples_nacional',
          alertas: [{
            codigo: 'simples_exclusao_agendada',
            mensagem: 'Exclusão do Simples Nacional agendada.',
            severidade: 'critica',
          }],
        },
      }],
    });
    expect(resultado.status_aptidao).toBe('PONTOS DE ATENÇÃO');
    expect(resultado.motivos_aptidao).toContain('Exclusão do Simples Nacional agendada.');
  });

  it('alerta de severidade BAIXA não derruba status_aptidao, mas continua visível em pontos_atencao', () => {
    const resultado = calcularInteligencia360({
      ...base,
      analisesDocumentais: [{
        prompt_codigo: 'simples_extract',
        resultado: {
          tipo_analise: 'simples_nacional',
          alertas: [{
            codigo: 'simples_historico_exclusao_anterior',
            mensagem: 'A empresa já esteve excluída do Simples Nacional no passado.',
            severidade: 'baixa',
          }],
        },
      }],
    });
    expect(resultado.status_aptidao).toBe('EMPRESA APTA');
    expect(resultado.motivos_aptidao).toEqual([]);
    expect(resultado.pontos_atencao).toContain('A empresa já esteve excluída do Simples Nacional no passado.');
  });
});

describe('busca das análises documentais persistidas', () => {
  it('consulta apenas os três prompts especializados', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ prompt_codigo: 'qsa_extract' }] });
    const rows = await buscarAnalisesDocumentaisAvancadas('empresa-1', { query });

    expect(rows).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][1]).toEqual(['qsa_extract', 'simples_extract', 'atos_junta_extract']);
  });

  it('retorna vazio quando a tabela estiver indisponível, sem quebrar o motor', async () => {
    const query = vi.fn().mockRejectedValue(new Error('relation does not exist'));
    await expect(buscarAnalisesDocumentaisAvancadas('empresa-1', { query })).resolves.toEqual([]);
  });
});

describe('Etapa 1 — Identidade do CNPJ', () => {
  const documentosIniciais = [
    { tipo: 'cartao_cnpj', arquivo_path: '/docs/cartao.pdf', status: 'validado' },
    { tipo: 'qsa', arquivo_path: '/docs/qsa.pdf', status: 'validado' },
    { tipo: 'enquadramento_tributario_cnpj', arquivo_path: '/docs/simples.pdf', status: 'validado' },
  ];
  const analisesOk = [
    { prompt_codigo: 'qsa_extract', status: 'concluido', resultado: { tipo_analise: 'qsa', alertas: [] } },
    { prompt_codigo: 'simples_extract', status: 'concluido', resultado: { tipo_analise: 'simples_nacional', alertas: [] } },
  ];
  const analiseCnpjOk = { status: 'concluida', idade_meses: 35, alertas: [], divergencias: [], situacao_cadastral: 'Ativa', porte: 'Micro Empresa' };

  it('libera a Etapa 2 somente com os três documentos iniciais analisados e consistentes', () => {
    const resultado = consolidarEtapaIdentidadeDocumental({
      empresa: { situacao_cadastral: 'Ativa', data_abertura: '2023-01-01', regime_tributario: 'Simples Nacional', porte: 'ME' },
      documentos: documentosIniciais,
      analisesDocumentais: analisesOk,
      analiseCnpj: analiseCnpjOk,
    });

    expect(resultado.documentos_ok).toBe(3);
    expect(resultado.apto_para_avancar).toBe(true);
    expect(resultado.bloqueios).toEqual([]);
  });

  it('não confunde pendências operacionais do sócio com a validação documental inicial', () => {
    const resultado = calcularInteligencia360({
      ...base,
      empresa: { ...base.empresa, data_abertura: '2023-01-01', regime_tributario: 'Simples Nacional', porte: 'ME' },
      socios: [{ nome: 'Ana Souza' }], // CPF/telefone serão tratados na próxima etapa
      documentos: documentosIniciais,
      analisesDocumentais: analisesOk,
      analiseCnpj: analiseCnpjOk,
    });

    expect(resultado.socios_sem_cpf).toBe(1);
    expect(resultado.etapa_identidade_documental.apto_para_avancar).toBe(true);
  });

  it('bloqueia o avanço quando um documento está anexado mas ainda não foi analisado', () => {
    const resultado = consolidarEtapaIdentidadeDocumental({
      empresa: { situacao_cadastral: 'Ativa', data_abertura: '2023-01-01', regime_tributario: 'Simples Nacional' },
      documentos: documentosIniciais,
      analisesDocumentais: analisesOk.filter((item) => item.prompt_codigo !== 'qsa_extract'),
      analiseCnpj: analiseCnpjOk,
    });

    expect(resultado.apto_para_avancar).toBe(false);
    expect(resultado.bloqueios.some((item) => item.includes('QSA') && item.includes('ainda não foi analisado'))).toBe(true);
  });

  it('bloqueia o avanço em divergência alta e mantém a mensagem concreta no relatório', () => {
    const resultado = consolidarEtapaIdentidadeDocumental({
      empresa: { situacao_cadastral: 'Ativa', data_abertura: '2023-01-01', regime_tributario: 'Simples Nacional' },
      documentos: documentosIniciais,
      analisesDocumentais: analisesOk.map((item) => item.prompt_codigo === 'qsa_extract'
        ? { ...item, resultado: { tipo_analise: 'qsa', alertas: [{ codigo: 'qsa_socio_divergente', mensagem: 'Sócio do QSA diverge da Receita Federal.', severidade: 'alta' }] } }
        : item),
      analiseCnpj: analiseCnpjOk,
    });

    expect(resultado.apto_para_avancar).toBe(false);
    expect(resultado.bloqueios).toContain('Sócio do QSA diverge da Receita Federal.');
  });
});

