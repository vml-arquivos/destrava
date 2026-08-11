import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Calendar, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, ListChecks, Loader2, Paperclip, RefreshCw, User } from "lucide-react";
import { apiFetch } from "@/lib/api";

type NexusEvento = { id: string; evento: string; descricao: string; observacao?: string; executor_nome?: string; arquivo?: Record<string, any>; ocorrido_em: string };
type NexusTarefa = {
  id: string; nexus_tarefa_id: string; titulo: string; descricao?: string; status: string; prioridade?: string;
  responsavel_nome?: string; prazo?: string; progresso_feitos: number; progresso_total: number;
  checklist?: Array<Record<string, any>>; ultima_observacao?: string; origem_url?: string;
  atualizada_em: string; eventos?: NexusEvento[];
};

const STATUS: Record<string, { label: string; style: string }> = {
  pendente: { label: "Pendente", style: "bg-amber-50 text-amber-700 border-amber-200" },
  em_progresso: { label: "Em execução", style: "bg-blue-50 text-blue-700 border-blue-200" },
  concluida: { label: "Concluída — aguardando aprovação", style: "bg-violet-50 text-violet-700 border-violet-200" },
  devolvida: { label: "Devolvida", style: "bg-orange-50 text-orange-700 border-orange-200" },
  reenviada: { label: "Reenviada", style: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  aprovada: { label: "Aprovada", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelada: { label: "Cancelada", style: "bg-slate-100 text-slate-600 border-slate-200" },
};

function data(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TarefaCard({ tarefa }: { tarefa: NexusTarefa }) {
  const [aberta, setAberta] = useState(!["aprovada", "cancelada"].includes(tarefa.status));
  const status = STATUS[tarefa.status] || { label: tarefa.status || "Pendente", style: "bg-slate-50 text-slate-700 border-slate-200" };
  const itens = Array.isArray(tarefa.checklist) ? tarefa.checklist : [];
  const eventos = Array.isArray(tarefa.eventos) ? tarefa.eventos : [];
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={() => setAberta(v => !v)} className="w-full p-4 text-left hover:bg-slate-50/70 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-black text-slate-900 break-words">{tarefa.titulo}</h4>
            {tarefa.descricao && <p className="mt-1 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">{tarefa.descricao}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${status.style}`}>{status.label}</span>
            {aberta ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {tarefa.responsavel_nome && <span className="flex items-center gap-1"><User className="w-3 h-3" />{tarefa.responsavel_nome}</span>}
          {tarefa.prazo && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Prazo {data(tarefa.prazo)}</span>}
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{tarefa.progresso_feitos || 0}/{tarefa.progresso_total || itens.length} executadas</span>
          {tarefa.prioridade && <span>Prioridade: <strong className="capitalize">{tarefa.prioridade}</strong></span>}
          <span>Atualizada {data(tarefa.atualizada_em)}</span>
        </div>
      </button>
      {aberta && (
        <div className="border-t border-slate-100 p-4 grid gap-4 lg:grid-cols-2">
          <section>
            <h5 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">O que precisa ser executado</h5>
            {itens.length ? <div className="space-y-2">{itens.map((item, index) => (
              <div key={String(item.id || index)} className="flex gap-2 rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${item.feito ? "text-emerald-500" : "text-slate-300"}`} />
                <div><p className={`text-xs font-semibold ${item.feito ? "text-slate-500 line-through" : "text-slate-700"}`}>{String(item.texto || item.title || item.label || "Tarefa")}</p>
                  {(item.responsavel_nome || item.executado_por_nome) && <span className="text-[10px] text-slate-400">{item.feito ? "Executada" : "Responsável"}: {item.executado_por_nome || item.responsavel_nome}</span>}
                </div>
              </div>
            ))}</div> : <p className="text-xs text-slate-400">Nenhum checklist detalhado recebido ainda.</p>}
          </section>
          <section>
            <h5 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Histórico da execução</h5>
            {eventos.length ? <div className="space-y-2 max-h-72 overflow-y-auto pr-1">{eventos.map(evento => (
              <div key={evento.id} className="rounded-xl border border-slate-100 p-2.5">
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{evento.descricao}</p>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                  <span>{data(evento.ocorrido_em)}</span>{evento.executor_nome && <span>· {evento.executor_nome}</span>}
                  {evento.arquivo && <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{String(evento.arquivo.nome_original || evento.arquivo.nome || "Evidência")}</span>}
                </div>
              </div>
            ))}</div> : <p className="text-xs text-slate-400">Aguardando eventos de execução do Nexus.</p>}
            {tarefa.ultima_observacao && <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 p-3"><p className="text-[10px] font-bold uppercase text-blue-500">Última observação</p><p className="text-xs text-blue-800 mt-1 whitespace-pre-wrap">{tarefa.ultima_observacao}</p></div>}
            {tarefa.origem_url && <a href={tarefa.origem_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"><ExternalLink className="w-3.5 h-3.5" />Abrir tarefa no Nexus</a>}
          </section>
        </div>
      )}
    </article>
  );
}

export default function NexusTarefasEmpresa({ empresaId }: { empresaId: string }) {
  const [tarefas, setTarefas] = useState<NexusTarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try { const result = await apiFetch(`/api/empresas/${empresaId}/tarefas-nexus`); setTarefas(Array.isArray(result?.tarefas) ? result.tarefas : []); }
    catch (e: any) { setErro(e?.message || "Erro ao carregar tarefas do Nexus."); }
    finally { setLoading(false); }
  }, [empresaId]);
  useEffect(() => { void carregar(); }, [carregar]);
  const abertas = useMemo(() => tarefas.filter(t => !["aprovada", "cancelada"].includes(t.status)), [tarefas]);
  const encerradas = useMemo(() => tarefas.filter(t => ["aprovada", "cancelada"].includes(t.status)), [tarefas]);
  return <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-sm">
    <header className="flex items-center justify-between gap-3 mb-3"><div className="flex items-center gap-2"><span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center"><ListChecks className="w-4 h-4" /></span><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Integração Nexus</p><h3 className="text-sm font-black text-slate-900">Tarefas e execução da empresa</h3></div></div><button type="button" onClick={() => void carregar()} disabled={loading} className="p-2 rounded-lg hover:bg-blue-100"><RefreshCw className={`w-4 h-4 text-blue-600 ${loading ? "animate-spin" : ""}`} /></button></header>
    {loading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div> : erro ? <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex gap-2"><AlertCircle className="w-4 h-4" />{erro}</div> : tarefas.length === 0 ? <p className="rounded-xl border border-dashed border-blue-200 bg-white/70 p-5 text-center text-xs text-slate-500">Nenhuma tarefa do Nexus registrada para esta empresa.</p> : <div className="space-y-4"><div><div className="flex items-center justify-between mb-2"><h4 className="text-xs font-black text-slate-700">Para executar</h4><span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{abertas.length}</span></div><div className="space-y-2">{abertas.map(t => <TarefaCard key={t.id} tarefa={t} />)}</div></div>{encerradas.length > 0 && <div><div className="flex items-center justify-between mb-2"><h4 className="text-xs font-black text-slate-500">Histórico finalizado</h4><span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{encerradas.length}</span></div><div className="space-y-2">{encerradas.map(t => <TarefaCard key={t.id} tarefa={t} />)}</div></div>}</div>}
  </section>;
}
