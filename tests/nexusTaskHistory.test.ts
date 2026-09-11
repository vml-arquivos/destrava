import { describe, expect, it } from "vitest";
import { normalizeNexusTaskEvent } from "../server/services/nexusTaskHistoryService";

describe("histórico estruturado de tarefas Nexus por empresa", () => {
  it("preserva descrição, execução, checklist, progresso e evidência", () => {
    const event = normalizeNexusTaskEvent({
      evento_id: "evt-1",
      evento: "tarefa.objetivos_completos",
      tarefa: {
        id: "task-1", titulo: "Conferir documentos", descricao: "Validar documentação fiscal",
        status: "concluida", prioridade: "alta", responsavel_nome: "Joana",
        checklist: [{ id: "i1", texto: "Validar CND", feito: true }],
      },
      progresso: { feitos: 1, total: 1 },
      observacao: "CND validada sem pendências",
      arquivo: { nome_original: "cnd.pdf" },
    });
    expect(event).toMatchObject({ tarefaId: "task-1", titulo: "Conferir documentos", status: "concluida", progressoFeitos: 1, progressoTotal: 1, executorNome: "Joana", eventoKey: "evt-1" });
    expect(event.descricaoEvento).toContain("CND validada sem pendências");
    expect(event.descricaoEvento).toContain("cnd.pdf");
  });

  it("gera identidade determinística para evento legado", () => {
    const raw = { evento: "tarefa.criada", external_id: "empresa-1", tarefa: { titulo: "Lista antiga" } };
    expect(normalizeNexusTaskEvent(raw).eventoKey).toBe(normalizeNexusTaskEvent(raw).eventoKey);
  });
});
