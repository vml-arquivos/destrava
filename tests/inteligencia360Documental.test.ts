import { describe, expect, it, vi } from 'vitest';
import {
  buscarAnalisesDocumentaisAvancadas,
  calcularInteligencia360,
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
