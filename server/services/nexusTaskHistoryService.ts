import crypto from "crypto";

function obj(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export interface NexusTaskEventNormalized {
  tarefaId: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string | null;
  responsavelNome: string | null;
  prazo: string | null;
  progressoFeitos: number;
  progressoTotal: number;
  checklist: unknown[];
  observacao: string | null;
  arquivo: Record<string, any> | null;
  origemUrl: string | null;
  criadaEm: string | null;
  ocorridoEm: string | null;
  executorNome: string | null;
  evento: string;
  eventoKey: string;
  descricaoEvento: string;
  payload: Record<string, any>;
}

/** Normaliza eventos atuais e legados do Nexus sem descartar o payload original. */
export function normalizeNexusTaskEvent(raw: unknown): NexusTaskEventNormalized {
  const body = obj(raw);
  const tarefa = obj(body.tarefa);
  const progresso = obj(body.progresso);
  const arquivo = obj(body.arquivo);
  const evento = texto(body.evento || body.event_type) || "nexus.evento";
  const tarefaId = texto(tarefa.id || body.tarefa_id || body.aggregate_id || body.idempotency_key)
    || `legado:${crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24)}`;
  const checklist = Array.isArray(tarefa.checklist) ? tarefa.checklist : Array.isArray(body.checklist) ? body.checklist : [];
  const feitosChecklist = checklist.filter((item: any) => Boolean(item?.feito)).length;
  const progressoFeitos = numero(progresso.feitos ?? tarefa.progresso_feitos ?? feitosChecklist);
  const progressoTotal = numero(progresso.total ?? tarefa.progresso_total ?? checklist.length);
  const observacao = texto(body.observacao || tarefa.observacao || tarefa.obs) || null;
  const executorNome = texto(body.executor_nome || body.executado_por_nome || tarefa.responsavel_nome || tarefa.aceita_por_nome) || null;
  const titulo = texto(tarefa.titulo || body.titulo) || "Tarefa do Nexus";
  const partes = [
    titulo,
    texto(tarefa.descricao || body.descricao),
    executorNome ? `Executado por: ${executorNome}` : "",
    progressoTotal ? `Progresso: ${progressoFeitos}/${progressoTotal}` : "",
    observacao ? `Observação: ${observacao}` : "",
    texto(arquivo.nome_original || arquivo.nome) ? `Arquivo: ${texto(arquivo.nome_original || arquivo.nome)}` : "",
  ].filter(Boolean);
  const eventoKeyInformada = texto(body.evento_id || body.idempotency_key);
  const hash = crypto.createHash("sha256").update(JSON.stringify({ evento, tarefaId, body })).digest("hex").slice(0, 32);

  return {
    tarefaId,
    titulo,
    descricao: texto(tarefa.descricao || body.descricao) || null,
    status: texto(tarefa.status || body.status) || "pendente",
    prioridade: texto(tarefa.prioridade || body.prioridade) || null,
    responsavelNome: texto(tarefa.responsavel_nome || tarefa.responsavel_nome_perfil || body.responsavel_nome) || executorNome,
    prazo: texto(tarefa.prazo || body.prazo) || null,
    progressoFeitos,
    progressoTotal,
    checklist,
    observacao,
    arquivo: Object.keys(arquivo).length ? arquivo : null,
    origemUrl: texto(tarefa.origem_url || body.origem_url) || null,
    criadaEm: texto(tarefa.created_at || body.criada_em) || null,
    ocorridoEm: texto(body.ocorrido_em || body.created_at || body.timestamp) || null,
    executorNome,
    evento,
    eventoKey: eventoKeyInformada || `nexus:${hash}`,
    descricaoEvento: partes.join(" · "),
    payload: body,
  };
}
