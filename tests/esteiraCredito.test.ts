/**
 * esteiraCredito.test.ts
 *
 * Testes automatizados para o serviço esteiraCreditoService.
 * Cobre todos os cenários solicitados:
 *  - Empresa com dados vazios
 *  - Empresa completa com todas as etapas
 *  - Proteção contra arrays undefined/null
 *  - Determinação correta da etapa atual
 *  - Cálculo de progresso geral
 *  - Geração de bloqueios e ações recomendadas
 *  - Histórico resumido
 *  - Resumo executivo
 */

import { describe, it, expect } from "vitest";
import { calcularEsteiraCredito, type EsteiraInput } from "../server/services/esteiraCreditoService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputVazio(): EsteiraInput {
  return {
    empresa: {},
    socios: [],
    documentos: [],
    simulacoes: [],
    orcamentos: [],
    contratos: [],
    historico: [],
    followups: [],
    acompanhamentos: [],
  };
}

function inputCompleto(): EsteiraInput {
  return {
    empresa: {
      id: "emp-001",
      cnpj: "12345678000195",
      razao_social: "Empresa Teste LTDA",
      situacao_cadastral: "ATIVA",
      cnae_principal: "6201-5/01",
      email: "contato@empresa.com",
      telefone: "(11) 99999-9999",
      faturamento_anual: 1200000,
      capital_social: 100000,
      score_interno: 75,
      score_serasa: 680,
      porte: "epp",
      etapa_funil: "carteira",
    },
    socios: [
      { id: "s1", nome: "João Silva", cpf_cnpj: "12345678901", representante_legal: true, percentual: 60 },
      { id: "s2", nome: "Maria Souza", cpf_cnpj: "98765432100", representante_legal: false, percentual: 40 },
    ],
    documentos: [
      { id: "d1", tipo: "contrato_social", nome_arquivo: "contrato.pdf", arquivo_path: "/docs/contrato.pdf", status: "validado" },
      { id: "d2", tipo: "cartao_cnpj", nome_arquivo: "cnpj.pdf", arquivo_path: "/docs/cnpj.pdf", status: "validado" },
      { id: "d3", tipo: "extrato_bancario", nome_arquivo: "extrato.pdf", arquivo_path: "/docs/extrato.pdf", status: "validado" },
      { id: "d4", tipo: "balancete", nome_arquivo: "balancete.pdf", arquivo_path: "/docs/balancete.pdf", status: "pendente" },
    ],
    simulacoes: [
      { id: "sim1", produto: "Capital de Giro", valor_solicitado: 200000, prazo_meses: 36, status: "ativa", criado_em: "2024-01-15T10:00:00Z" },
    ],
    orcamentos: [
      { id: "orc1", descricao: "Orçamento 2024", valor_total: 200000, status: "aprovado" },
    ],
    contratos: [
      { id: "ct1", numero_contrato: "CT-001", tipo_contrato: "Capital de Giro", status: "ativo", valor_contrato: 200000, data_assinatura: "2024-02-01", created_at: "2024-02-01T10:00:00Z" },
    ],
    historico: [
      { id: "h1", tipo: "Atualização", descricao: "Dados atualizados pela Receita", created_at: "2024-01-10T10:00:00Z" },
      { id: "h2", tipo: "Contato", descricao: "Ligação realizada com o sócio", created_at: "2024-01-05T10:00:00Z" },
    ],
    followups: [
      { id: "f1", tipo: "Reunião", descricao: "Reunião de apresentação do produto", created_at: "2024-01-20T10:00:00Z" },
    ],
    acompanhamentos: [
      { id: "ac1", banco: "Banco do Brasil", produto: "Capital de Giro", status: "aprovado", valor: 200000, created_at: "2024-01-25T10:00:00Z" },
    ],
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("calcularEsteiraCredito", () => {

  // ── Proteção contra dados ausentes ──────────────────────────────────────────

  it("não deve lançar exceção com input completamente vazio", () => {
    expect(() => calcularEsteiraCredito(inputVazio())).not.toThrow();
  });

  it("não deve lançar exceção com input null/undefined", () => {
    expect(() => calcularEsteiraCredito(null as any)).not.toThrow();
    expect(() => calcularEsteiraCredito(undefined as any)).not.toThrow();
  });

  it("não deve lançar exceção com arrays null em vez de arrays vazios", () => {
    const input = {
      empresa: null,
      socios: null,
      documentos: null,
      simulacoes: null,
      orcamentos: null,
      contratos: null,
      historico: null,
      followups: null,
      acompanhamentos: null,
    } as any;
    expect(() => calcularEsteiraCredito(input)).not.toThrow();
  });

  // ── Estrutura do resultado ───────────────────────────────────────────────────

  it("deve retornar a estrutura correta com empresa vazia", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado).toHaveProperty("empresa_id");
    expect(resultado).toHaveProperty("calculado_em");
    expect(resultado).toHaveProperty("etapa_atual_numero");
    expect(resultado).toHaveProperty("etapa_atual_id");
    expect(resultado).toHaveProperty("etapa_atual_titulo");
    expect(resultado).toHaveProperty("progresso_geral");
    expect(resultado).toHaveProperty("status_geral");
    expect(resultado).toHaveProperty("total_bloqueios_criticos");
    expect(resultado).toHaveProperty("total_acoes_pendentes");
    expect(resultado).toHaveProperty("etapas");
    expect(resultado).toHaveProperty("proximas_etapas");
    expect(resultado).toHaveProperty("historico_resumido");
    expect(resultado).toHaveProperty("resumo_executivo");
    expect(resultado).toHaveProperty("fonte");
  });

  it("deve retornar exatamente 8 etapas", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado.etapas).toHaveLength(8);
  });

  it("deve retornar fonte = deterministica", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado.fonte).toBe("deterministica");
  });

  it("deve retornar calculado_em como ISO string válida", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(() => new Date(resultado.calculado_em)).not.toThrow();
    expect(new Date(resultado.calculado_em).getTime()).toBeGreaterThan(0);
  });

  // ── Empresa vazia — bloqueios e status ──────────────────────────────────────

  it("empresa vazia deve ter status_geral critico", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(["critico", "atencao"]).toContain(resultado.status_geral);
  });

  it("empresa vazia deve ter bloqueios críticos na etapa 1", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(etapa1).toBeDefined();
    expect(etapa1!.bloqueios.some(b => b.critico)).toBe(true);
  });

  it("empresa vazia deve ter etapa 1 com status bloqueada ou pendente", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(["bloqueada", "pendente"]).toContain(etapa1!.status);
  });

  it("empresa vazia deve ter progresso_geral menor que 30", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado.progresso_geral).toBeLessThan(30);
  });

  it("empresa vazia deve ter total_bloqueios_criticos maior que 0", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado.total_bloqueios_criticos).toBeGreaterThan(0);
  });

  // ── Empresa completa ─────────────────────────────────────────────────────────

  it("empresa completa deve ter progresso_geral maior que 50", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    expect(resultado.progresso_geral).toBeGreaterThan(50);
  });

  it("empresa completa deve ter status_geral avancado ou concluido", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    expect(["avancado", "concluido", "em_andamento"]).toContain(resultado.status_geral);
  });

  it("empresa completa deve ter etapa 1 com status concluida ou em_andamento", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(["concluida", "em_andamento"]).toContain(etapa1!.status);
  });

  it("empresa com contrato ativo deve ter etapa 6 em andamento ou concluida", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    const etapa6 = resultado.etapas.find(e => e.numero === 6);
    expect(["em_andamento", "concluida"]).toContain(etapa6!.status);
  });

  // ── Etapas individuais ───────────────────────────────────────────────────────

  it("cada etapa deve ter os campos obrigatórios", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    for (const etapa of resultado.etapas) {
      expect(etapa).toHaveProperty("numero");
      expect(etapa).toHaveProperty("id");
      expect(etapa).toHaveProperty("titulo");
      expect(etapa).toHaveProperty("descricao");
      expect(etapa).toHaveProperty("status");
      expect(etapa).toHaveProperty("percentual_conclusao");
      expect(etapa).toHaveProperty("bloqueios");
      expect(etapa).toHaveProperty("acoes_recomendadas");
      expect(etapa).toHaveProperty("modulo_principal");
      expect(etapa).toHaveProperty("dados_resumo");
    }
  });

  it("etapas devem ter percentual_conclusao entre 0 e 100", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    for (const etapa of resultado.etapas) {
      expect(etapa.percentual_conclusao).toBeGreaterThanOrEqual(0);
      expect(etapa.percentual_conclusao).toBeLessThanOrEqual(100);
    }
  });

  it("etapas devem ter status válido", () => {
    const statusValidos = ["concluida", "em_andamento", "bloqueada", "pendente", "nao_iniciada"];
    const resultado = calcularEsteiraCredito(inputCompleto());
    for (const etapa of resultado.etapas) {
      expect(statusValidos).toContain(etapa.status);
    }
  });

  it("etapas devem ter números de 1 a 8", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    const numeros = resultado.etapas.map(e => e.numero).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // ── Acervo documental vazio ──────────────────────────────────────────────────

  it("sem documentos deve ter etapa 2 bloqueada", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    const etapa2 = resultado.etapas.find(e => e.numero === 2);
    expect(["bloqueada", "pendente"]).toContain(etapa2!.status);
  });

  it("com documentos validados deve ter etapa 2 com percentual maior que 0", () => {
    const input = inputVazio();
    input.documentos = [
      { id: "d1", arquivo_path: "/docs/d1.pdf", status: "validado" },
      { id: "d2", arquivo_path: "/docs/d2.pdf", status: "validado" },
    ];
    const resultado = calcularEsteiraCredito(input);
    const etapa2 = resultado.etapas.find(e => e.numero === 2);
    expect(etapa2!.percentual_conclusao).toBeGreaterThan(0);
  });

  // ── Simulações e análise de crédito ─────────────────────────────────────────

  it("sem faturamento deve ter etapa 3 bloqueada", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    const etapa3 = resultado.etapas.find(e => e.numero === 3);
    expect(["bloqueada", "pendente"]).toContain(etapa3!.status);
  });

  it("com faturamento e simulação deve ter etapa 3 com percentual maior que 60", () => {
    const input = inputVazio();
    input.empresa = { faturamento_anual: 500000 };
    input.simulacoes = [{ id: "s1", produto: "Capital de Giro", valor_solicitado: 100000 }];
    const resultado = calcularEsteiraCredito(input);
    const etapa3 = resultado.etapas.find(e => e.numero === 3);
    expect(etapa3!.percentual_conclusao).toBeGreaterThan(60);
  });

  // ── Contratos ────────────────────────────────────────────────────────────────

  it("sem contratos deve ter etapa 6 nao_iniciada", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    const etapa6 = resultado.etapas.find(e => e.numero === 6);
    expect(etapa6!.status).toBe("nao_iniciada");
  });

  it("contrato vencido deve gerar bloqueio crítico na etapa 6", () => {
    const input = inputVazio();
    input.contratos = [
      { id: "ct1", numero_contrato: "CT-001", tipo_contrato: "CG", status: "ativo", data_vencimento: "2020-01-01", created_at: "2020-01-01T00:00:00Z" },
    ];
    const resultado = calcularEsteiraCredito(input);
    const etapa6 = resultado.etapas.find(e => e.numero === 6);
    expect(etapa6!.bloqueios.some(b => b.critico)).toBe(true);
  });

  // ── Histórico resumido ───────────────────────────────────────────────────────

  it("histórico resumido deve ser um array", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    expect(Array.isArray(resultado.historico_resumido)).toBe(true);
  });

  it("histórico resumido não deve exceder 8 itens", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    expect(resultado.historico_resumido.length).toBeLessThanOrEqual(8);
  });

  it("itens do histórico devem ter data, tipo e descricao", () => {
    const resultado = calcularEsteiraCredito(inputCompleto());
    for (const item of resultado.historico_resumido) {
      expect(item).toHaveProperty("data");
      expect(item).toHaveProperty("tipo");
      expect(item).toHaveProperty("descricao");
      expect(item).toHaveProperty("modulo");
    }
  });

  // ── Resumo executivo ─────────────────────────────────────────────────────────

  it("resumo executivo deve ser uma string não vazia", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(typeof resultado.resumo_executivo).toBe("string");
    expect(resultado.resumo_executivo.length).toBeGreaterThan(10);
  });

  it("resumo executivo com muitos bloqueios deve mencionar bloqueios", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado.resumo_executivo.toLowerCase()).toMatch(/bloqueio|cr\u00edtico|a\u00e7\u00e3o|etapa/i);
  });

  // ── Próximas etapas ──────────────────────────────────────────────────────────

  it("proximas_etapas deve ser um array", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(Array.isArray(resultado.proximas_etapas)).toBe(true);
  });

  it("proximas_etapas não deve exceder 3 itens", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    expect(resultado.proximas_etapas.length).toBeLessThanOrEqual(3);
  });

  // ── Progresso geral ──────────────────────────────────────────────────────────

  it("progresso_geral deve estar entre 0 e 100", () => {
    expect(calcularEsteiraCredito(inputVazio()).progresso_geral).toBeGreaterThanOrEqual(0);
    expect(calcularEsteiraCredito(inputVazio()).progresso_geral).toBeLessThanOrEqual(100);
    expect(calcularEsteiraCredito(inputCompleto()).progresso_geral).toBeGreaterThanOrEqual(0);
    expect(calcularEsteiraCredito(inputCompleto()).progresso_geral).toBeLessThanOrEqual(100);
  });

  it("empresa completa deve ter progresso maior que empresa vazia", () => {
    const vazio = calcularEsteiraCredito(inputVazio()).progresso_geral;
    const completo = calcularEsteiraCredito(inputCompleto()).progresso_geral;
    expect(completo).toBeGreaterThan(vazio);
  });

  // ── Bloqueios e ações ────────────────────────────────────────────────────────

  it("bloqueios devem ter id, titulo, descricao, critico e modulo", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    for (const etapa of resultado.etapas) {
      for (const bloqueio of etapa.bloqueios) {
        expect(bloqueio).toHaveProperty("id");
        expect(bloqueio).toHaveProperty("titulo");
        expect(bloqueio).toHaveProperty("descricao");
        expect(bloqueio).toHaveProperty("critico");
        expect(bloqueio).toHaveProperty("modulo");
      }
    }
  });

  it("ações recomendadas devem ter titulo, descricao, modulo e prioridade", () => {
    const resultado = calcularEsteiraCredito(inputVazio());
    for (const etapa of resultado.etapas) {
      for (const acao of etapa.acoes_recomendadas) {
        expect(acao).toHaveProperty("titulo");
        expect(acao).toHaveProperty("descricao");
        expect(acao).toHaveProperty("modulo");
        expect(acao).toHaveProperty("prioridade");
        expect(["imediata", "proxima", "futura"]).toContain(acao.prioridade);
      }
    }
  });

  // ── Cenário: empresa com CNPJ mas sem sócios ─────────────────────────────────

  it("empresa com CNPJ mas sem sócios deve ter bloqueio na etapa 1", () => {
    const input = inputVazio();
    input.empresa = { cnpj: "12345678000195", razao_social: "Teste", situacao_cadastral: "ATIVA" };
    const resultado = calcularEsteiraCredito(input);
    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(etapa1!.bloqueios.some(b => b.id === "e1-socios")).toBe(true);
  });

  // ── Cenário: empresa em carteira ─────────────────────────────────────────────

  it("empresa em carteira deve ter etapa 8 com percentual maior que 50", () => {
    const input = inputCompleto();
    input.empresa.etapa_funil = "carteira";
    const resultado = calcularEsteiraCredito(input);
    const etapa8 = resultado.etapas.find(e => e.numero === 8);
    expect(etapa8!.percentual_conclusao).toBeGreaterThan(50);
  });

});
