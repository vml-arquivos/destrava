/**
 * schedulerBackfillDocumental.test.ts
 *
 * CORREÇÃO (Rodada 35, 05/09/2026, print real da tela em produção -- muitos
 * documentos presos em "análise pendente"/"Reanálise necessária" mesmo
 * depois da "Continuidade 05/09/2026" (leitura automática integral, ~141
 * tipos), pedido explícito do usuário: "essas leituras individuais elas já
 * podem ser programadas, cronometradas, garantidas individualmente"): antes
 * desta correção, `executarRetryDocumental` (server/services/automation/scheduler.ts)
 * só reenfileirava extrações que JÁ tinham falhado (`enqueueDueRetries`) e
 * processava jobs já enfileirados (`run`) -- nunca enfileirava, sozinho, um
 * documento que nunca teve nenhuma tentativa de análise sob o catálogo
 * atual. Este teste mocka `backfillLaudosService` (sem tocar em banco real)
 * para provar que `executarRetryDocumental` agora chama `enqueue()` --
 * exatamente o método já usado pelo comando manual `pnpm backfill:laudos --
 * enqueue-and-run` -- ANTES de `enqueueDueRetries`/`run`, e com um limite de
 * lote pequeno (nunca "sem limite"), para o sistema convergir sozinho, aos
 * poucos, sem depender de ação manual nem para o backlog atual nem para
 * qualquer bump de versão futuro.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const enqueue = vi.fn().mockResolvedValue({ enqueued: 0, skipped: 0, dryRun: false });
const enqueueDueRetries = vi.fn().mockResolvedValue(0);
const run = vi.fn().mockResolvedValue({ enqueued: 0, skipped: 0, processed: 0, succeeded: 0, failed: 0, dryRun: false });

vi.mock("../server/services/backfillLaudosService", () => ({
  backfillLaudosService: {
    enqueue: (...args: any[]) => enqueue(...args),
    enqueueDueRetries: (...args: any[]) => enqueueDueRetries(...args),
    run: (...args: any[]) => run(...args),
  },
}));

describe("executarRetryDocumental -- enfileiramento automático de documentos nunca analisados", () => {
  beforeEach(() => {
    enqueue.mockClear();
    enqueueDueRetries.mockClear();
    run.mockClear();
  });

  it("chama enqueue() (o mesmo método do backfill manual) antes de enqueueDueRetries()/run(), com um limite de lote finito", async () => {
    const { executarRetryDocumental } = await import("../server/services/automation/scheduler");
    await executarRetryDocumental();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueueDueRetries).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);

    const ordemEnqueue = enqueue.mock.invocationCallOrder[0];
    const ordemDueRetries = enqueueDueRetries.mock.invocationCallOrder[0];
    const ordemRun = run.mock.invocationCallOrder[0];
    expect(ordemEnqueue).toBeLessThan(ordemDueRetries);
    expect(ordemDueRetries).toBeLessThan(ordemRun);

    // Nunca "sem limite" -- sempre um lote pequeno e finito, para nunca gerar
    // um pico repentino de chamadas de IA (ex.: logo após um deploy grande
    // que reescreveu o catálogo, como a "Continuidade 05/09/2026").
    const limiteEnqueue = enqueue.mock.calls[0][0]?.limit;
    expect(typeof limiteEnqueue).toBe("number");
    expect(limiteEnqueue).toBeGreaterThan(0);
    expect(limiteEnqueue).toBeLessThanOrEqual(1000);
  });

  it("nunca roda duas execuções sobrepostas (mesma trava reentrante já usada para as retentativas)", async () => {
    const { executarRetryDocumental } = await import("../server/services/automation/scheduler");
    let resolveEnqueue: () => void = () => {};
    enqueue.mockImplementationOnce(() => new Promise((resolve) => { resolveEnqueue = () => resolve({ enqueued: 0, skipped: 0, dryRun: false }); }));

    const primeira = executarRetryDocumental();
    const segunda = executarRetryDocumental();
    resolveEnqueue();
    await Promise.all([primeira, segunda]);

    // A segunda chamada, disparada enquanto a primeira ainda está em
    // andamento, deve ter sido um no-op (mesma trava `retryDocumentalEmAndamento`
    // já usada antes desta rodada para as retentativas) -- enqueue() só é
    // chamado uma vez, não duas.
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
