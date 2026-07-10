/**
 * historicoCliente.test.ts
 *
 * Testes automatizados para o serviço consolidarHistorico360.
 * Cobre todos os cenários solicitados:
 *  - Histórico vazio
 *  - Histórico completo com múltiplas fontes
 *  - Eventos sem data (ficam no final)
 *  - Arrays undefined/null
 *  - Estrutura dos campos obrigatórios
 *  - Ordenação cronológica decrescente
 *  - Separação entre eventos com e sem data
 *  - Resumo por tipo
 *  - Não inventar usuário
 *  - Não criar eventos falsos
 */

import { describe, it, expect } from "vitest";
import { consolidarHistorico360, type HistoricoInput } from "../server/services/historicoClienteService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputVazio(): HistoricoInput {
  return {
    empresa: {},
    historicoEmpresa: [],
    followupsEmpresa: [],
    followupsEstruturados: [],
    documentos: [],
    simulacoes: [],
    contratos: [],
    orcamentos: [],
    acompanhamentos: [],
  };
}

function inputCompleto(): HistoricoInput {
  return {
    empresa: {
      id: "emp-001",
      razao_social: "Empresa Teste LTDA",
      cnpj: "12345678000195",
      status: "ativo",
      created_at: "2023-01-15T10:00:00Z",
      updated_at: "2024-06-01T14:00:00Z",
      ultima_sincronizacao_receita: "2024-05-10T09:00:00Z",
    },
    historicoEmpresa: [
      { id: "h1", tipo: "nota", descricao: "Nota de acompanhamento", autor: "João Silva", created_at: "2024-01-10T10:00:00Z" },
      { id: "h2", tipo: "simulacao", descricao: "Simulação registrada pelo sistema", autor: "Sistema", created_at: "2024-02-15T11:00:00Z" },
      { id: "h3", tipo: "analise", descricao: "Análise de crédito realizada", autor: "Maria Costa", created_at: "2024-03-20T09:00:00Z" },
    ],
    followupsEmpresa: [
      { id: "f1", tipo: "Ligação", descricao: "Ligação realizada com o sócio", autor: "Carlos", created_at: "2024-01-20T15:00:00Z" },
      { id: "f2", tipo: "Reunião", descricao: "Reunião de apresentação", autor: null, created_at: "2024-02-28T10:00:00Z" },
    ],
    followupsEstruturados: [
      { id: "fe1", tipo: "Proposta", titulo: "Envio de proposta comercial", descricao: "Proposta enviada por e-mail", concluido: true, created_at: "2024-03-05T14:00:00Z" },
    ],
    documentos: [
      { id: "d1", tipo: "contrato_social", nome_arquivo: "contrato.pdf", arquivo_path: "/docs/contrato.pdf", status: "validado", created_at: "2023-06-01T10:00:00Z" },
      { id: "d2", tipo: "cartao_cnpj", nome_arquivo: "cnpj.pdf", arquivo_path: "/docs/cnpj.pdf", status: "pendente", created_at: "2023-07-15T11:00:00Z" },
      { id: "d3", tipo: "extrato_bancario", nome_arquivo: "extrato.pdf", arquivo_path: null, status: "ativo", created_at: "2024-01-05T09:00:00Z" },
    ],
    simulacoes: [
      { id: "s1", produto: "Capital de Giro", valor_solicitado: 200000, prazo_meses: 36, status: "ativa", criado_em: "2024-02-10T10:00:00Z" },
      { id: "s2", produto: "Antecipação de Recebíveis", valor_solicitado: 50000, prazo_meses: 12, status: "expirada", criado_em: "2023-11-20T10:00:00Z" },
    ],
    contratos: [
      {
        id: "ct1", numero_contrato: "CT-001", tipo_contrato: "Capital de Giro",
        status: "ativo", valor_contrato: 200000,
        data_assinatura: "2024-04-01", created_at: "2024-03-25T10:00:00Z",
      },
    ],
    orcamentos: [
      { id: "o1", descricao: "Orçamento Capital de Giro", valor_total: 200000, status: "aprovado", created_at: "2024-01-30T10:00:00Z" },
    ],
    acompanhamentos: [
      { id: "ac1", banco: "Banco do Brasil", produto: "Capital de Giro", status: "aprovado", valor: 200000, responsavel: "Ana Lima", created_at: "2024-03-10T10:00:00Z" },
    ],
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("consolidarHistorico360", () => {

  // ── Proteção contra dados ausentes ──────────────────────────────────────────

  it("não deve lançar exceção com input completamente vazio", () => {
    expect(() => consolidarHistorico360(inputVazio())).not.toThrow();
  });

  it("não deve lançar exceção com input null", () => {
    expect(() => consolidarHistorico360(null as any)).not.toThrow();
  });

  it("não deve lançar exceção com input undefined", () => {
    expect(() => consolidarHistorico360(undefined as any)).not.toThrow();
  });

  it("não deve lançar exceção com todos os arrays null", () => {
    const input = {
      empresa: null,
      historicoEmpresa: null,
      followupsEmpresa: null,
      followupsEstruturados: null,
      documentos: null,
      simulacoes: null,
      contratos: null,
      orcamentos: null,
      acompanhamentos: null,
    } as any;
    expect(() => consolidarHistorico360(input)).not.toThrow();
  });

  it("não deve lançar exceção com arrays undefined", () => {
    const input = {
      empresa: undefined,
      historicoEmpresa: undefined,
      followupsEmpresa: undefined,
      followupsEstruturados: undefined,
      documentos: undefined,
      simulacoes: undefined,
      contratos: undefined,
      orcamentos: undefined,
      acompanhamentos: undefined,
    } as any;
    expect(() => consolidarHistorico360(input)).not.toThrow();
  });

  // ── Estrutura do resultado ───────────────────────────────────────────────────

  it("deve retornar a estrutura correta com input vazio", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(res).toHaveProperty("empresa_id");
    expect(res).toHaveProperty("calculado_em");
    expect(res).toHaveProperty("total_eventos");
    expect(res).toHaveProperty("total_sem_data");
    expect(res).toHaveProperty("eventos_com_data");
    expect(res).toHaveProperty("eventos_sem_data");
    expect(res).toHaveProperty("resumo_por_tipo");
    expect(res).toHaveProperty("primeiro_evento");
    expect(res).toHaveProperty("ultimo_evento");
    expect(res).toHaveProperty("fonte");
  });

  it("deve retornar fonte = consolidado_360", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(res.fonte).toBe("consolidado_360");
  });

  it("deve retornar calculado_em como ISO string válida", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(() => new Date(res.calculado_em)).not.toThrow();
    expect(new Date(res.calculado_em).getTime()).toBeGreaterThan(0);
  });

  // ── Histórico vazio ──────────────────────────────────────────────────────────

  it("input vazio deve ter total_eventos = 0", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(res.total_eventos).toBe(0);
  });

  it("input vazio deve ter eventos_com_data como array vazio", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(Array.isArray(res.eventos_com_data)).toBe(true);
    expect(res.eventos_com_data).toHaveLength(0);
  });

  it("input vazio deve ter eventos_sem_data como array vazio", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(Array.isArray(res.eventos_sem_data)).toBe(true);
    expect(res.eventos_sem_data).toHaveLength(0);
  });

  it("input vazio deve ter primeiro_evento e ultimo_evento como null", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(res.primeiro_evento).toBeNull();
    expect(res.ultimo_evento).toBeNull();
  });

  // ── Histórico completo ───────────────────────────────────────────────────────

  it("input completo deve ter total_eventos maior que 10", () => {
    const res = consolidarHistorico360(inputCompleto());
    expect(res.total_eventos).toBeGreaterThan(10);
  });

  it("input completo deve ter eventos de múltiplas fontes", () => {
    const res = consolidarHistorico360(inputCompleto());
    const origens = new Set([
      ...res.eventos_com_data.map(e => e.origem),
      ...res.eventos_sem_data.map(e => e.origem),
    ]);
    expect(origens.size).toBeGreaterThan(3);
  });

  it("input completo deve ter resumo_por_tipo com múltiplos tipos", () => {
    const res = consolidarHistorico360(inputCompleto());
    expect(Object.keys(res.resumo_por_tipo).length).toBeGreaterThan(3);
  });

  it("input completo deve ter primeiro_evento e ultimo_evento não nulos", () => {
    const res = consolidarHistorico360(inputCompleto());
    expect(res.primeiro_evento).not.toBeNull();
    expect(res.ultimo_evento).not.toBeNull();
  });

  it("ultimo_evento deve ser mais recente que primeiro_evento", () => {
    const res = consolidarHistorico360(inputCompleto());
    if (res.primeiro_evento && res.ultimo_evento) {
      expect(new Date(res.ultimo_evento).getTime()).toBeGreaterThanOrEqual(
        new Date(res.primeiro_evento).getTime()
      );
    }
  });

  // ── Eventos sem data ─────────────────────────────────────────────────────────

  it("eventos sem data devem ir para eventos_sem_data", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Nota sem data", autor: "João", created_at: null },
      { id: "h2", tipo: "nota", descricao: "Nota com data", autor: "Maria", created_at: "2024-01-10T10:00:00Z" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.eventos_sem_data.length).toBe(1);
    expect(res.eventos_com_data.length).toBe(1);
  });

  it("evento com data inválida deve ir para eventos_sem_data", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Nota data inválida", autor: "João", created_at: "data-invalida" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.eventos_sem_data.length).toBe(1);
  });

  it("evento com created_at vazio deve ir para eventos_sem_data", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Nota sem data", autor: null, created_at: "" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.eventos_sem_data.length).toBe(1);
  });

  it("total_sem_data deve corresponder ao tamanho de eventos_sem_data", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Sem data 1", autor: null, created_at: null },
      { id: "h2", tipo: "nota", descricao: "Sem data 2", autor: null, created_at: null },
      { id: "h3", tipo: "nota", descricao: "Com data", autor: null, created_at: "2024-01-01T00:00:00Z" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.total_sem_data).toBe(res.eventos_sem_data.length);
    expect(res.total_sem_data).toBe(2);
  });

  // ── Campos obrigatórios dos eventos ─────────────────────────────────────────

  it("cada evento deve ter os campos obrigatórios", () => {
    const res = consolidarHistorico360(inputCompleto());
    const todosEventos = [...res.eventos_com_data, ...res.eventos_sem_data];
    for (const e of todosEventos) {
      expect(e).toHaveProperty("id");
      expect(e).toHaveProperty("data");
      expect(e).toHaveProperty("data_valida");
      expect(e).toHaveProperty("tipo");
      expect(e).toHaveProperty("titulo");
      expect(e).toHaveProperty("descricao");
      expect(e).toHaveProperty("origem");
      expect(e).toHaveProperty("usuario");
      expect(e).toHaveProperty("modulo");
      expect(e).toHaveProperty("link_acao");
    }
  });

  it("titulo de cada evento deve ser uma string não vazia", () => {
    const res = consolidarHistorico360(inputCompleto());
    const todosEventos = [...res.eventos_com_data, ...res.eventos_sem_data];
    for (const e of todosEventos) {
      expect(typeof e.titulo).toBe("string");
      expect(e.titulo.length).toBeGreaterThan(0);
    }
  });

  it("descricao de cada evento deve ser uma string não vazia", () => {
    const res = consolidarHistorico360(inputCompleto());
    const todosEventos = [...res.eventos_com_data, ...res.eventos_sem_data];
    for (const e of todosEventos) {
      expect(typeof e.descricao).toBe("string");
      expect(e.descricao.length).toBeGreaterThan(0);
    }
  });

  // ── Não inventar usuário ─────────────────────────────────────────────────────

  it("evento sem autor deve ter usuario = null", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Nota sem autor", autor: null, created_at: "2024-01-10T10:00:00Z" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.eventos_com_data[0].usuario).toBeNull();
  });

  it("evento com autor vazio deve ter usuario = null", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Nota autor vazio", autor: "", created_at: "2024-01-10T10:00:00Z" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.eventos_com_data[0].usuario).toBeNull();
  });

  it("evento com autor informado deve preservar o nome do usuário", () => {
    const input = inputVazio();
    input.historicoEmpresa = [
      { id: "h1", tipo: "nota", descricao: "Nota com autor", autor: "João Silva", created_at: "2024-01-10T10:00:00Z" },
    ];
    const res = consolidarHistorico360(input);
    expect(res.eventos_com_data[0].usuario).toBe("João Silva");
  });

  // ── Ordenação ────────────────────────────────────────────────────────────────

  it("eventos_com_data devem estar em ordem cronológica decrescente", () => {
    const res = consolidarHistorico360(inputCompleto());
    const datas = res.eventos_com_data.map(e => new Date(e.data!).getTime());
    for (let i = 0; i < datas.length - 1; i++) {
      expect(datas[i]).toBeGreaterThanOrEqual(datas[i + 1]);
    }
  });

  // ── Fontes específicas ───────────────────────────────────────────────────────

  it("deve gerar evento de criação da empresa quando created_at estiver disponível", () => {
    const input = inputVazio();
    input.empresa = { id: "emp-1", razao_social: "Teste", created_at: "2023-01-15T10:00:00Z" };
    const res = consolidarHistorico360(input);
    const eventoEmpresa = res.eventos_com_data.find(e => e.id === "emp_criacao");
    expect(eventoEmpresa).toBeDefined();
    expect(eventoEmpresa!.tipo).toBe("cadastro");
    expect(eventoEmpresa!.origem).toBe("empresas");
  });

  it("deve gerar evento de atualização cadastral quando updated_at for diferente de created_at", () => {
    const input = inputVazio();
    input.empresa = {
      id: "emp-1",
      razao_social: "Teste",
      created_at: "2023-01-15T10:00:00Z",
      updated_at: "2024-06-01T14:00:00Z",
    };
    const res = consolidarHistorico360(input);
    const eventoAtualizacao = res.eventos_com_data.find(e => e.id === "emp_atualizacao");
    expect(eventoAtualizacao).toBeDefined();
    expect(eventoAtualizacao!.tipo).toBe("atualizacao_cadastral");
  });

  it("não deve gerar evento de atualização quando updated_at for igual a created_at", () => {
    const input = inputVazio();
    input.empresa = {
      id: "emp-1",
      razao_social: "Teste",
      created_at: "2023-01-15T10:00:00Z",
      updated_at: "2023-01-15T10:00:00Z",
    };
    const res = consolidarHistorico360(input);
    const eventoAtualizacao = res.eventos_com_data.find(e => e.id === "emp_atualizacao");
    expect(eventoAtualizacao).toBeUndefined();
  });

  it("deve gerar evento de sincronização com Receita Federal quando disponível", () => {
    const input = inputVazio();
    input.empresa = {
      id: "emp-1",
      cnpj: "12345678000195",
      ultima_sincronizacao_receita: "2024-05-10T09:00:00Z",
    };
    const res = consolidarHistorico360(input);
    const eventoReceita = res.eventos_com_data.find(e => e.id === "emp_receita");
    expect(eventoReceita).toBeDefined();
    expect(eventoReceita!.tipo).toBe("atualizacao_cadastral");
  });

  it("deve gerar evento separado de assinatura quando data_assinatura estiver disponível no contrato", () => {
    const input = inputVazio();
    input.contratos = [
      {
        id: "ct1", numero_contrato: "CT-001", tipo_contrato: "Capital de Giro",
        status: "ativo", valor_contrato: 100000,
        data_assinatura: "2024-04-01", created_at: "2024-03-25T10:00:00Z",
      },
    ];
    const res = consolidarHistorico360(input);
    const eventoAssinatura = res.eventos_com_data.find(e => e.id === "ct_assinatura_ct1");
    expect(eventoAssinatura).toBeDefined();
    expect(eventoAssinatura!.titulo).toContain("assinado");
  });

  it("não deve gerar evento de assinatura quando data_assinatura for null", () => {
    const input = inputVazio();
    input.contratos = [
      {
        id: "ct1", numero_contrato: "CT-001", tipo_contrato: "Capital de Giro",
        status: "pendente", valor_contrato: 100000,
        data_assinatura: null, created_at: "2024-03-25T10:00:00Z",
      },
    ];
    const res = consolidarHistorico360(input);
    const eventoAssinatura = res.eventos_com_data.find(e => e.id === "ct_assinatura_ct1");
    expect(eventoAssinatura).toBeUndefined();
  });

  // ── Resumo por tipo ──────────────────────────────────────────────────────────

  it("resumo_por_tipo deve ser um objeto", () => {
    const res = consolidarHistorico360(inputCompleto());
    expect(typeof res.resumo_por_tipo).toBe("object");
    expect(res.resumo_por_tipo).not.toBeNull();
  });

  it("soma dos valores do resumo_por_tipo deve ser igual a total_eventos", () => {
    const res = consolidarHistorico360(inputCompleto());
    const soma = Object.values(res.resumo_por_tipo).reduce((acc, v) => acc + v, 0);
    expect(soma).toBe(res.total_eventos);
  });

  it("resumo_por_tipo com input vazio deve ser objeto vazio", () => {
    const res = consolidarHistorico360(inputVazio());
    expect(Object.keys(res.resumo_por_tipo).length).toBe(0);
  });

  // ── Total de eventos ─────────────────────────────────────────────────────────

  it("total_eventos deve ser a soma de eventos_com_data e eventos_sem_data", () => {
    const res = consolidarHistorico360(inputCompleto());
    expect(res.total_eventos).toBe(res.eventos_com_data.length + res.eventos_sem_data.length);
  });

  // ── Tipos de eventos válidos ─────────────────────────────────────────────────

  it("todos os eventos devem ter tipo válido", () => {
    const tiposValidos = [
      "cadastro", "atualizacao_cadastral", "documento", "simulacao",
      "contrato", "orcamento", "followup", "nota",
      "acompanhamento_bancario", "analise", "sistema",
    ];
    const res = consolidarHistorico360(inputCompleto());
    const todosEventos = [...res.eventos_com_data, ...res.eventos_sem_data];
    for (const e of todosEventos) {
      expect(tiposValidos).toContain(e.tipo);
    }
  });

});
