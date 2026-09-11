/**
 * automationOutbox.test.ts
 *
 * Cobre o outbox do Automation Engine (server/services/automation/):
 * inserção idempotente, varredura de retry, marcação de sucesso/falha, e o
 * fluxo completo via publishEvent (inclui o registro de auditoria).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakePool } from "./helpers/fakePool";
import {
  inserirEvento,
  reivindicarLotePendente,
  marcarDespachado,
  marcarFalha,
  buscarEventoPorId,
} from "../server/services/automation/outboxRepository";
import { publishEvent } from "../server/services/automation/eventBus";

describe("outboxRepository", () => {
  let pool: FakePool;

  beforeEach(() => {
    pool = new FakePool();
  });

  it("insere um evento novo normalmente", async () => {
    const evento = await inserirEvento(pool as any, {
      eventType: "ContratoAssinado",
      aggregateType: "contrato",
      aggregateId: "c1",
      idempotencyKey: "contrato:c1:assinado",
      payload: { contrato_id: "c1" },
    });
    expect(evento).not.toBeNull();
    expect(evento!.status).toBe("pending");
  });

  it("retorna null ao inserir a mesma idempotency_key duas vezes (nunca duplica)", async () => {
    const primeiro = await inserirEvento(pool as any, {
      eventType: "ContratoAssinado",
      aggregateId: "c1",
      idempotencyKey: "contrato:c1:assinado",
      payload: {},
    });
    const segundo = await inserirEvento(pool as any, {
      eventType: "ContratoAssinado",
      aggregateId: "c1",
      idempotencyKey: "contrato:c1:assinado",
      payload: {},
    });
    expect(primeiro).not.toBeNull();
    expect(segundo).toBeNull();
    expect(pool.events.length).toBe(1);
  });

  it("evento com idempotency_key diferente para o mesmo event_type não colide", async () => {
    await inserirEvento(pool as any, {
      eventType: "RotinaCndDue",
      aggregateId: "c1",
      idempotencyKey: "rotina:cnd:c1:2026-07",
      payload: {},
    });
    const outroMes = await inserirEvento(pool as any, {
      eventType: "RotinaCndDue",
      aggregateId: "c1",
      idempotencyKey: "rotina:cnd:c1:2026-08",
      payload: {},
    });
    expect(outroMes).not.toBeNull();
    expect(pool.events.length).toBe(2);
  });

  it("reivindicarLotePendente só retorna eventos pending/failed com menos de 10 tentativas", async () => {
    const e1 = await inserirEvento(pool as any, { eventType: "A", aggregateId: "1", idempotencyKey: "k1", payload: {} });
    await marcarDespachado(pool as any, e1!.id);
    await inserirEvento(pool as any, { eventType: "B", aggregateId: "2", idempotencyKey: "k2", payload: {} });

    const lote = await reivindicarLotePendente(pool as any);
    expect(lote.length).toBe(1);
    expect(lote[0].event_type).toBe("B");
  });

  it("marcarFalha aumenta attempts e vira 'dead' na décima tentativa", async () => {
    const evento = await inserirEvento(pool as any, { eventType: "A", aggregateId: "1", idempotencyKey: "k1", payload: {} });
    await marcarFalha(pool as any, evento!.id, "erro de rede", 10);
    const atualizado = await buscarEventoPorId(pool as any, evento!.id);
    expect(atualizado!.status).toBe("dead");
    expect(atualizado!.attempts).toBe(10);
  });

  it("marcarFalha mantém 'failed' (não 'dead') antes da décima tentativa", async () => {
    const evento = await inserirEvento(pool as any, { eventType: "A", aggregateId: "1", idempotencyKey: "k1", payload: {} });
    await marcarFalha(pool as any, evento!.id, "timeout", 3);
    const atualizado = await buscarEventoPorId(pool as any, evento!.id);
    expect(atualizado!.status).toBe("failed");
  });
});

describe("publishEvent (fluxo completo)", () => {
  let pool: FakePool;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    pool = new FakePool();
    delete process.env.NEXUS_PUBLIC_URL;
    delete process.env.NEXUS_INTEGRATION_SECRET;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("evento duplicado não é despachado de novo (auditoria registra ignorado_duplicado)", async () => {
    const input = {
      eventType: "ContratoAssinado" as const,
      aggregateType: "contrato",
      aggregateId: "c1",
      idempotencyKey: "contrato:c1:assinado",
      payload: {},
    };
    await publishEvent(pool as any, input);
    await publishEvent(pool as any, input);

    expect(pool.events.length).toBe(1);
    const duplicados = pool.auditLog.filter((a) => a.resultado === "ignorado_duplicado");
    expect(duplicados.length).toBe(1);
  });

  it("sem NEXUS_PUBLIC_URL configurado, o despacho imediato falha e o evento fica pending/failed (não se perde)", async () => {
    await publishEvent(pool as any, {
      eventType: "ContratoAssinado" as const,
      aggregateId: "c1",
      idempotencyKey: "contrato:c1:assinado",
      payload: {},
    });
    // dá tempo do despacho assíncrono (catch(() => {})) rodar
    await new Promise((r) => setTimeout(r, 10));
    const evento = pool.events[0];
    expect(["pending", "failed"]).toContain(evento.status);
  });

  it("com o Nexus configurado e respondendo 200, o evento é marcado como dispatched", async () => {
    process.env.NEXUS_PUBLIC_URL = "https://nexus.teste.local";
    process.env.NEXUS_INTEGRATION_SECRET = "segredo-teste";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    }) as any;

    await publishEvent(pool as any, {
      eventType: "ContratoAssinado" as const,
      aggregateId: "c1",
      idempotencyKey: "contrato:c1:assinado",
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(pool.events[0].status).toBe("dispatched");
  });
});
