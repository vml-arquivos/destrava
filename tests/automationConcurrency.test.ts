/**
 * automationConcurrency.test.ts
 *
 * Exercita a garantia central do Automation Engine: o mesmo evento nunca
 * pode ser registrado (e portanto nunca despachado) duas vezes, mesmo sob
 * disparos concorrentes -- ex.: o despacho imediato de publishEvent e a
 * varredura de retry do scheduler processando o mesmo evento quase ao
 * mesmo tempo, ou dois cliques duplos do usuário no mesmo formulário.
 *
 * Nota: sem Postgres real disponível neste ambiente (ver tests/helpers/fakePool.ts),
 * este teste roda contra a fake em memória -- ela é single-threaded, então não
 * reproduz uma corrida de verdade entre duas conexões, mas exercita a mesma
 * regra de negócio (UNIQUE(event_type, idempotency_key) + ON CONFLICT DO
 * NOTHING) que a migração 072 aplica no Postgres real.
 */
import { describe, it, expect } from "vitest";
import { FakePool } from "./helpers/fakePool";
import { inserirEvento } from "../server/services/automation/outboxRepository";

describe("concorrência de idempotência do outbox", () => {
  it("duas inserções simultâneas com a mesma idempotency_key resultam em exatamente um evento", async () => {
    const pool = new FakePool();

    const [a, b] = await Promise.all([
      inserirEvento(pool as any, {
        eventType: "AcompanhamentoCriado",
        aggregateId: "acomp-1",
        idempotencyKey: "acomp:acomp-1:criado",
        payload: {},
      }),
      inserirEvento(pool as any, {
        eventType: "AcompanhamentoCriado",
        aggregateId: "acomp-1",
        idempotencyKey: "acomp:acomp-1:criado",
        payload: {},
      }),
    ]);

    const sucessos = [a, b].filter((r) => r !== null);
    expect(sucessos.length).toBe(1);
    expect(pool.events.length).toBe(1);
  });

  it("dez disparos concorrentes da mesma rotina mensal produzem só um evento", async () => {
    const pool = new FakePool();

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () =>
        inserirEvento(pool as any, {
          eventType: "RotinaCndDue",
          aggregateId: "contrato-1",
          idempotencyKey: "rotina:cnd:contrato-1:2026-07",
          payload: {},
        })
      )
    );

    expect(resultados.filter((r) => r !== null).length).toBe(1);
    expect(pool.events.length).toBe(1);
  });
});
