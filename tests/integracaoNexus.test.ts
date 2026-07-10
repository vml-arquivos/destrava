/**
 * integracaoNexus.test.ts
 *
 * Testes automatizados para o integracaoNexusService.
 *
 * Cobertura:
 * - Validação de payload (campos obrigatórios, prioridade inválida)
 * - Geração de idempotencyKey
 * - Verificação de configuração de ambiente
 * - Idempotência (não duplicar tarefas já enviadas)
 * - Envio para Nexus e n8n (mock)
 * - Erro amigável quando integração não configurada
 * - Proteção contra arrays undefined e campos nulos
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock do fetch global ──────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// ─── Importar o serviço ────────────────────────────────────────────────────────

import {
  gerarIdempotencyKey,
  validarPayloadNexus,
  verificarConfiguracaoNexus,
  enviarPendenciaNexus,
  limparCacheIdempotencia,
  type PayloadNexus,
} from "../server/services/integracaoNexusService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _keyCounter = 0;
function payloadValido(overrides: Partial<PayloadNexus> = {}): PayloadNexus {
  _keyCounter++;
  return {
    empresaId: "emp-001",
    cnpj: "12345678000199",
    razaoSocial: "Empresa Teste Ltda",
    pendenciaId: `pend-${_keyCounter}`,
    prioridade: "alta",
    categoria: "documental",
    titulo: "Contrato social ausente",
    descricao: "O contrato social não foi enviado.",
    moduloOrigem: "inteligencia_360",
    acaoRecomendada: "Solicitar contrato social ao cliente",
    idempotencyKey: `destrava_emp-001_pend-${_keyCounter}_${Date.now()}`,
    ...overrides,
  };
}

// ─── Testes: gerarIdempotencyKey ──────────────────────────────────────────────

describe("gerarIdempotencyKey", () => {
  it("deve gerar chave com formato correto", () => {
    const key = gerarIdempotencyKey("emp-001", "pend-001");
    expect(key).toMatch(/^destrava_emp-001_pend-001_\d{4}-\d{2}-\d{2}$/);
  });

  it("deve gerar chaves diferentes para empresas diferentes", () => {
    const k1 = gerarIdempotencyKey("emp-001", "pend-001");
    const k2 = gerarIdempotencyKey("emp-002", "pend-001");
    expect(k1).not.toBe(k2);
  });

  it("deve gerar chaves diferentes para pendências diferentes", () => {
    const k1 = gerarIdempotencyKey("emp-001", "pend-001");
    const k2 = gerarIdempotencyKey("emp-001", "pend-002");
    expect(k1).not.toBe(k2);
  });

  it("deve ser determinístico para mesma empresa+pendência no mesmo dia", () => {
    const k1 = gerarIdempotencyKey("emp-001", "pend-001");
    const k2 = gerarIdempotencyKey("emp-001", "pend-001");
    expect(k1).toBe(k2);
  });

  it("deve lidar com strings vazias sem quebrar", () => {
    const key = gerarIdempotencyKey("", "");
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });
});

// ─── Testes: validarPayloadNexus ──────────────────────────────────────────────

describe("validarPayloadNexus", () => {
  it("deve retornar array vazio para payload válido", () => {
    const erros = validarPayloadNexus(payloadValido());
    expect(erros).toHaveLength(0);
  });

  it("deve retornar erro se empresaId estiver vazio", () => {
    const erros = validarPayloadNexus(payloadValido({ empresaId: "" }));
    expect(erros.some(e => e.campo === "empresaId")).toBe(true);
  });

  it("deve retornar erro se razaoSocial estiver vazia", () => {
    const erros = validarPayloadNexus(payloadValido({ razaoSocial: "" }));
    expect(erros.some(e => e.campo === "razaoSocial")).toBe(true);
  });

  it("deve retornar erro se pendenciaId estiver vazio", () => {
    const erros = validarPayloadNexus(payloadValido({ pendenciaId: "" }));
    expect(erros.some(e => e.campo === "pendenciaId")).toBe(true);
  });

  it("deve retornar erro se titulo estiver vazio", () => {
    const erros = validarPayloadNexus(payloadValido({ titulo: "" }));
    expect(erros.some(e => e.campo === "titulo")).toBe(true);
  });

  it("deve retornar erro se categoria estiver vazia", () => {
    const erros = validarPayloadNexus(payloadValido({ categoria: "" }));
    expect(erros.some(e => e.campo === "categoria")).toBe(true);
  });

  it("deve retornar erro se prioridade for inválida", () => {
    const erros = validarPayloadNexus(payloadValido({ prioridade: "urgente" as any }));
    expect(erros.some(e => e.campo === "prioridade")).toBe(true);
  });

  it("deve aceitar prioridade 'alta'", () => {
    const erros = validarPayloadNexus(payloadValido({ prioridade: "alta" }));
    expect(erros.some(e => e.campo === "prioridade")).toBe(false);
  });

  it("deve aceitar prioridade 'media'", () => {
    const erros = validarPayloadNexus(payloadValido({ prioridade: "media" }));
    expect(erros.some(e => e.campo === "prioridade")).toBe(false);
  });

  it("deve aceitar prioridade 'baixa'", () => {
    const erros = validarPayloadNexus(payloadValido({ prioridade: "baixa" }));
    expect(erros.some(e => e.campo === "prioridade")).toBe(false);
  });

  it("deve aceitar cnpj nulo (campo opcional)", () => {
    const erros = validarPayloadNexus(payloadValido({ cnpj: null }));
    expect(erros.some(e => e.campo === "cnpj")).toBe(false);
  });

  it("deve retornar erro se idempotencyKey estiver vazio", () => {
    const erros = validarPayloadNexus(payloadValido({ idempotencyKey: "" }));
    expect(erros.some(e => e.campo === "idempotencyKey")).toBe(true);
  });

  it("deve acumular múltiplos erros", () => {
    const erros = validarPayloadNexus(payloadValido({ empresaId: "", titulo: "", categoria: "" }));
    expect(erros.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Testes: verificarConfiguracaoNexus ───────────────────────────────────────

describe("verificarConfiguracaoNexus", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restaurar variáveis de ambiente
    if (originalEnv.NEXUS_WEBHOOK_URL !== undefined) {
      process.env.NEXUS_WEBHOOK_URL = originalEnv.NEXUS_WEBHOOK_URL;
    } else {
      delete process.env.NEXUS_WEBHOOK_URL;
    }
    if (originalEnv.NEXUS_API_TOKEN !== undefined) {
      process.env.NEXUS_API_TOKEN = originalEnv.NEXUS_API_TOKEN;
    } else {
      delete process.env.NEXUS_API_TOKEN;
    }
    if (originalEnv.N8N_WEBHOOK_URL !== undefined) {
      process.env.N8N_WEBHOOK_URL = originalEnv.N8N_WEBHOOK_URL;
    } else {
      delete process.env.N8N_WEBHOOK_URL;
    }
  });

  it("deve retornar algumConfigurado=false quando nenhuma variável está definida", () => {
    delete process.env.NEXUS_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.NEXUS_API_TOKEN;
    const config = verificarConfiguracaoNexus();
    expect(config.algumConfigurado).toBe(false);
    expect(config.destino).toBe("nenhum");
  });

  it("deve retornar nexusConfigurado=true quando NEXUS_WEBHOOK_URL está definida", () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    delete process.env.N8N_WEBHOOK_URL;
    const config = verificarConfiguracaoNexus();
    expect(config.nexusConfigurado).toBe(true);
    expect(config.algumConfigurado).toBe(true);
    expect(config.destino).toBe("nexus");
  });

  it("deve retornar n8nConfigurado=true quando N8N_WEBHOOK_URL está definida", () => {
    delete process.env.NEXUS_WEBHOOK_URL;
    process.env.N8N_WEBHOOK_URL = "https://n8n.exemplo.com/webhook";
    const config = verificarConfiguracaoNexus();
    expect(config.n8nConfigurado).toBe(true);
    expect(config.algumConfigurado).toBe(true);
    expect(config.destino).toBe("n8n");
  });

  it("deve priorizar Nexus quando ambos estão configurados", () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    process.env.N8N_WEBHOOK_URL = "https://n8n.exemplo.com/webhook";
    const config = verificarConfiguracaoNexus();
    expect(config.destino).toBe("nexus");
    expect(config.algumConfigurado).toBe(true);
  });

  it("deve retornar mensagemStatus descritiva quando não configurado", () => {
    delete process.env.NEXUS_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_URL;
    const config = verificarConfiguracaoNexus();
    expect(config.mensagemStatus).toBeTruthy();
    expect(config.mensagemStatus.length).toBeGreaterThan(10);
  });
});

// ─── Testes: enviarPendenciaNexus ─────────────────────────────────────────────

describe("enviarPendenciaNexus", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockFetch.mockReset();
    limparCacheIdempotencia(); // limpar cache entre testes
  });

  afterEach(() => {
    if (originalEnv.NEXUS_WEBHOOK_URL !== undefined) {
      process.env.NEXUS_WEBHOOK_URL = originalEnv.NEXUS_WEBHOOK_URL;
    } else {
      delete process.env.NEXUS_WEBHOOK_URL;
    }
    if (originalEnv.N8N_WEBHOOK_URL !== undefined) {
      process.env.N8N_WEBHOOK_URL = originalEnv.N8N_WEBHOOK_URL;
    } else {
      delete process.env.N8N_WEBHOOK_URL;
    }
    if (originalEnv.NEXUS_API_TOKEN !== undefined) {
      process.env.NEXUS_API_TOKEN = originalEnv.NEXUS_API_TOKEN;
    } else {
      delete process.env.NEXUS_API_TOKEN;
    }
    limparCacheIdempotencia();
  });

  it("deve retornar erro amigável quando integração não está configurada", async () => {
    delete process.env.NEXUS_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_URL;

    const resultado = await enviarPendenciaNexus(payloadValido());
    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toBeTruthy();
    expect(resultado.mensagem.length).toBeGreaterThan(10);
  });

  it("deve detectar duplicata via verificador externo e não enviar", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";

    const verificarDuplicata = vi.fn().mockResolvedValue(true);
    const resultado = await enviarPendenciaNexus(payloadValido(), verificarDuplicata);

    expect(resultado.jaEnviado).toBe(true);
    expect(resultado.sucesso).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("deve enviar para Nexus com sucesso quando configurado e não duplicado", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    delete process.env.N8N_WEBHOOK_URL;

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "task-001" }),
    });

    const verificarDuplicata = vi.fn().mockResolvedValue(false);
    const resultado = await enviarPendenciaNexus(payloadValido(), verificarDuplicata);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.destino).toBe("nexus");
    expect(resultado.jaEnviado).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("deve enviar para n8n quando apenas N8N_WEBHOOK_URL está configurado", async () => {
    delete process.env.NEXUS_WEBHOOK_URL;
    process.env.N8N_WEBHOOK_URL = "https://n8n.exemplo.com/webhook";

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{}",
    });

    const resultado = await enviarPendenciaNexus(payloadValido());

    expect(resultado.sucesso).toBe(true);
    expect(resultado.destino).toBe("n8n");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("deve retornar sucesso=false quando o webhook retorna erro HTTP", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    delete process.env.N8N_WEBHOOK_URL;

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const resultado = await enviarPendenciaNexus(payloadValido());
    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toBeTruthy();
  });

  it("deve retornar sucesso=false quando o fetch lança exceção (timeout, rede)", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    delete process.env.N8N_WEBHOOK_URL;

    mockFetch.mockRejectedValue(new Error("Network timeout"));

    const resultado = await enviarPendenciaNexus(payloadValido());
    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toBeTruthy();
  });

  it("deve incluir idempotencyKey no resultado", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

    const payload = payloadValido({ idempotencyKey: "chave-unica-teste-" + Date.now() });
    const resultado = await enviarPendenciaNexus(payload);

    expect(resultado.idempotencyKey).toBe(payload.idempotencyKey);
  });

  it("deve incluir timestamp no resultado", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

    const resultado = await enviarPendenciaNexus(payloadValido());
    expect(resultado.timestamp).toBeTruthy();
    expect(() => new Date(resultado.timestamp)).not.toThrow();
  });

  it("deve registrar idempotência em memória e não enviar segunda vez", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

    const payload = payloadValido({ idempotencyKey: "chave-idempotencia-mem-" + Date.now() });

    // Primeiro envio
    const r1 = await enviarPendenciaNexus(payload);
    expect(r1.sucesso).toBe(true);
    expect(r1.jaEnviado).toBe(false);

    // Segundo envio com mesma chave — deve detectar duplicata em memória
    const r2 = await enviarPendenciaNexus(payload);
    expect(r2.jaEnviado).toBe(true);
    // fetch só deve ter sido chamado uma vez
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("deve incluir todos os campos obrigatórios do payload no corpo enviado ao webhook", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

    const payload = payloadValido();
    await enviarPendenciaNexus(payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const chamada = mockFetch.mock.calls[0];
    const body = JSON.parse(chamada[1].body);

    // O payload enriquecido usa estrutura aninhada (empresa, tarefa, contexto)
    expect(body.idempotency_key).toBe(payload.idempotencyKey);
    expect(body.empresa.id).toBe(payload.empresaId);
    expect(body.empresa.razao_social).toBe(payload.razaoSocial);
    expect(body.tarefa.id).toBe(payload.pendenciaId);
    expect(body.tarefa.titulo).toBe(payload.titulo);
    expect(body.tarefa.categoria).toBe(payload.categoria);
    expect(body.tarefa.prioridade).toBe(payload.prioridade);
    expect(body.tarefa.acao_recomendada).toBe(payload.acaoRecomendada);
    expect(body.sistema).toBe("destrava_credito");
    expect(body.evento).toBe("pendencia.tarefa_criada");
  });

  it("deve incluir NEXUS_API_TOKEN no header Authorization quando configurado", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    process.env.NEXUS_API_TOKEN = "token-secreto-123";
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

    await enviarPendenciaNexus(payloadValido());

    const chamada = mockFetch.mock.calls[0];
    const headers = chamada[1].headers;
    expect(headers["Authorization"]).toBe("Bearer token-secreto-123");
  });

  it("deve funcionar sem NEXUS_API_TOKEN (sem header Authorization)", async () => {
    process.env.NEXUS_WEBHOOK_URL = "https://nexus.exemplo.com/webhook";
    delete process.env.NEXUS_API_TOKEN;
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

    await enviarPendenciaNexus(payloadValido());

    const chamada = mockFetch.mock.calls[0];
    const headers = chamada[1].headers;
    expect(headers["Authorization"]).toBeUndefined();
  });
});
