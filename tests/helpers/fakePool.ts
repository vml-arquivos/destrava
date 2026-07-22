/**
 * fakePool.ts
 *
 * Pool de Postgres falso, em memória, usado só nos testes do Automation
 * Engine (outbox/idempotência/concorrência). Não há Postgres disponível no
 * ambiente de testes deste projeto (os testes existentes do repositório são
 * todos unitários/deterministicos, sem banco real -- ver tests/motorPendencias.test.ts),
 * então esta fake reconhece só as poucas queries literais que
 * outboxRepository.ts/dispatcher.ts realmente emitem, o suficiente para
 * exercitar de verdade a lógica de idempotência e concorrência (que vive no
 * SQL, não só no JS).
 */

interface EventoFake {
  id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string | null;
  aggregate_id: string | null;
  idempotency_key: string;
  payload: any;
  correlation_id: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  dispatched_at: string | null;
}

export interface AuditoriaFake {
  event_id: string | null;
  evento: string;
  empresa_id: string | null;
  resultado: string;
  erro: string | null;
}

let contador = 0;
function proximoId(): string {
  contador += 1;
  return `evt-${contador}`;
}

export class FakePool {
  events: EventoFake[] = [];
  auditLog: AuditoriaFake[] = [];
  nexusTaskLinks: any[] = [];

  async query(text: string, params: any[] = []): Promise<{ rows: any[] }> {
    const sql = text.trim();

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }

    if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO automation_events")) {
      const [eventType, aggregateType, aggregateId, idempotencyKey, payloadJson, correlationId] = params;
      const existente = this.events.find(
        (e) => e.event_type === eventType && e.idempotency_key === idempotencyKey
      );
      if (existente) return { rows: [] }; // ON CONFLICT DO NOTHING
      const row: EventoFake = {
        id: proximoId(),
        event_type: eventType,
        event_version: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        idempotency_key: idempotencyKey,
        payload: JSON.parse(payloadJson || "{}"),
        correlation_id: correlationId,
        status: "pending",
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        dispatched_at: null,
      };
      this.events.push(row);
      return { rows: [row] };
    }

    if (sql.includes("FROM automation_events") && sql.includes("FOR UPDATE SKIP LOCKED")) {
      const limite = params[0] ?? 20;
      const pendentes = this.events.filter((e) => ["pending", "failed"].includes(e.status) && e.attempts < 10);
      return { rows: pendentes.slice(0, limite) };
    }

    if (sql.startsWith("UPDATE automation_events SET status = 'dispatched'")) {
      const [id] = params;
      const ev = this.events.find((e) => e.id === id);
      if (ev) {
        ev.status = "dispatched";
        ev.dispatched_at = new Date().toISOString();
      }
      return { rows: [] };
    }

    if (sql.startsWith("UPDATE automation_events SET status = $1")) {
      const [status, attempts, erro, id] = params;
      const ev = this.events.find((e) => e.id === id);
      if (ev) {
        ev.status = status;
        ev.attempts = attempts;
        ev.last_error = erro;
      }
      return { rows: [] };
    }

    if (sql.startsWith("SELECT * FROM automation_events WHERE id")) {
      const [id] = params;
      return { rows: this.events.filter((e) => e.id === id) };
    }

    if (sql.startsWith("INSERT INTO automation_audit_log")) {
      const [eventId, evento, origemSistema, empresaId, executadoPor, tempoMs, resultado, erro] = params;
      this.auditLog.push({ event_id: eventId, evento, empresa_id: empresaId, resultado, erro });
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO nexus_task_links")) {
      this.nexusTaskLinks.push({ params });
      return { rows: [] };
    }

    throw new Error(`FakePool: query não reconhecida nos testes: ${sql.slice(0, 120)}`);
  }

  async connect() {
    return {
      query: (text: string, params?: any[]) => this.query(text, params),
      release: () => {},
    };
  }
}
