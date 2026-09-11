/**
 * automationRecorrenciaCancelamento.test.ts
 *
 * Cobre recorrência (uma rotina por competência, nunca duplicada dentro do
 * mesmo mês/semana) e cancelamento (encerrar um contrato não apaga nada
 * nem gera eventos duplicados). O gate "só roda no dia 22 / é contrato
 * ativo" é aplicado em SQL no scheduler (WHERE EXTRACT(DAY FROM CURRENT_DATE)
 * = 22 / data_fim_vigencia), que exigiria um Postgres real para testar de
 * ponta a ponta -- não disponível neste ambiente (ver tests/helpers/fakePool.ts).
 * O que É testável sem banco, e é o que garante "nunca duplica", é a chave
 * de idempotência: é isso que este arquivo cobre.
 */
import { describe, it, expect } from "vitest";
import { FakePool } from "./helpers/fakePool";
import { inserirEvento } from "../server/services/automation/outboxRepository";
import { formatarCompetencia } from "../server/services/automation/scheduler";

describe("formatarCompetencia", () => {
  it("formata para YYYY-MM", () => {
    expect(formatarCompetencia(new Date("2026-07-22T12:00:00Z"))).toBe("2026-07");
    expect(formatarCompetencia(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01");
  });
});

describe("recorrência: uma rotina por competência", () => {
  it("a mesma rotina CND não é reemitida dentro do mesmo mês, mesmo se o scheduler rodar várias vezes", async () => {
    const pool = new FakePool();
    const contratoId = "contrato-1";
    const competencia = "2026-07";

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      await inserirEvento(pool as any, {
        eventType: "RotinaCndDue",
        aggregateId: contratoId,
        idempotencyKey: `rotina:cnd:${contratoId}:${competencia}`,
        payload: { contrato_id: contratoId, competencia },
      });
    }

    expect(pool.events.length).toBe(1);
  });

  it("meses diferentes do mesmo contrato geram eventos distintos (a rotina continua mês a mês)", async () => {
    const pool = new FakePool();
    const contratoId = "contrato-1";

    await inserirEvento(pool as any, {
      eventType: "RotinaCndDue",
      aggregateId: contratoId,
      idempotencyKey: `rotina:cnd:${contratoId}:2026-07`,
      payload: {},
    });
    await inserirEvento(pool as any, {
      eventType: "RotinaCndDue",
      aggregateId: contratoId,
      idempotencyKey: `rotina:cnd:${contratoId}:2026-08`,
      payload: {},
    });

    expect(pool.events.length).toBe(2);
  });

  it("CND e CEMPROT do mesmo contrato não colidem entre si (event_type diferente)", async () => {
    const pool = new FakePool();
    const contratoId = "contrato-1";
    const competencia = "2026-07";

    await inserirEvento(pool as any, {
      eventType: "RotinaCndDue",
      aggregateId: contratoId,
      idempotencyKey: `rotina:cnd:${contratoId}:${competencia}`,
      payload: {},
    });
    await inserirEvento(pool as any, {
      eventType: "RotinaCemprotDue",
      aggregateId: contratoId,
      idempotencyKey: `rotina:cemprot:${contratoId}:${competencia}:2026-IW30`,
      payload: {},
    });

    expect(pool.events.length).toBe(2);
  });
});

describe("cancelamento: ContratoEncerrado", () => {
  it("encerrar o mesmo contrato duas vezes não gera dois eventos de encerramento", async () => {
    const pool = new FakePool();
    const contratoId = "contrato-1";

    await inserirEvento(pool as any, {
      eventType: "ContratoEncerrado",
      aggregateId: contratoId,
      idempotencyKey: `contrato:${contratoId}:encerrado`,
      payload: { contrato_id: contratoId },
    });
    await inserirEvento(pool as any, {
      eventType: "ContratoEncerrado",
      aggregateId: contratoId,
      idempotencyKey: `contrato:${contratoId}:encerrado`,
      payload: { contrato_id: contratoId },
    });

    expect(pool.events.length).toBe(1);
  });

  it("eventos de rotina emitidos antes do encerramento continuam no outbox (histórico preservado, nada é apagado)", async () => {
    const pool = new FakePool();
    const contratoId = "contrato-1";

    await inserirEvento(pool as any, {
      eventType: "RotinaCndDue",
      aggregateId: contratoId,
      idempotencyKey: `rotina:cnd:${contratoId}:2026-06`,
      payload: {},
    });
    await inserirEvento(pool as any, {
      eventType: "ContratoEncerrado",
      aggregateId: contratoId,
      idempotencyKey: `contrato:${contratoId}:encerrado`,
      payload: { contrato_id: contratoId },
    });

    // O encerramento não remove o histórico de rotinas já geradas.
    expect(pool.events.some((e) => e.event_type === "RotinaCndDue")).toBe(true);
    expect(pool.events.length).toBe(2);
  });
});
