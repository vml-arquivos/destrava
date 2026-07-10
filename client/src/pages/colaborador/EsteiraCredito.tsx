/**
 * EsteiraCredito.tsx
 *
 * Componente de Esteira de Crédito e Assessoria.
 * Exibe a jornada operacional da empresa com 8 etapas,
 * bloqueios, ações recomendadas, histórico resumido e
 * botões de navegação para cada módulo.
 *
 * REGRA: ZERO REGRESSÃO — apenas leitura, sem alterar dados.
 */

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Workflow, RefreshCw, ArrowRight, CheckCircle2, AlertCircle,
  AlertTriangle, Clock, Minus, ChevronDown, ChevronUp,
  Building2, Users, FileText, BarChart3, FileSignature,
  Handshake, Zap, TrendingUp, History, ShieldAlert,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusEtapa = "concluida" | "em_andamento" | "bloqueada" | "pendente" | "nao_iniciada";
type StatusGeral = "critico" | "atencao" | "em_andamento" | "avancado" | "concluido";

interface Bloqueio { id: string; titulo: string; descricao: string; critico: boolean; modulo: string; }
interface Acao { titulo: string; descricao: string; modulo: string; prioridade: "imediata" | "proxima" | "futura"; }
interface Etapa {
  numero: number; id: string; titulo: string; descricao: string;
  status: StatusEtapa; percentual_conclusao: number;
  bloqueios: Bloqueio[]; acoes_recomendadas: Acao[];
  modulo_principal: string; dados_resumo: Record<string, string | number | boolean>;
}
interface HistoricoItem { data: string; tipo: string; descricao: string; modulo: string; }
interface EsteiraData {
  empresa_id: string; calculado_em: string;
  etapa_atual_numero: number; etapa_atual_id: string; etapa_atual_titulo: string;
  progresso_geral: number; status_geral: StatusGeral;
  total_bloqueios_criticos: number; total_acoes_pendentes: number;
  etapas: Etapa[];
  proximas_etapas: Array<{ numero: number; titulo: string; id: string }>;
  historico_resumido: HistoricoItem[];
  resumo_executivo: string;
}

// ─── Configs visuais ──────────────────────────────────────────────────────────

const STATUS_ETAPA_CFG: Record<StatusEtapa, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  concluida:    { label: "Concluída",    color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-300", Icon: CheckCircle2 },
  em_andamento: { label: "Em andamento", color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-300",    Icon: Clock },
  bloqueada:    { label: "Bloqueada",    color: "text-red-700",     bg: "bg-red-50",      border: "border-red-300",     Icon: AlertCircle },
  pendente:     { label: "Pendente",     color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-300",   Icon: AlertTriangle },
  nao_iniciada: { label: "Não iniciada", color: "text-slate-500",   bg: "bg-slate-50",    border: "border-slate-200",   Icon: Minus },
};

const STATUS_GERAL_CFG: Record<StatusGeral, { label: string; color: string; bg: string }> = {
  critico:      { label: "Crítico",      color: "text-red-700",     bg: "bg-red-50 border-red-200" },
  atencao:      { label: "Atenção",      color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  em_andamento: { label: "Em andamento", color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  avancado:     { label: "Avançado",     color: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  concluido:    { label: "Concluído",    color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

const MODULO_ICONS: Record<string, React.ElementType> = {
  cadastro_empresa: Building2, socios_qsa: Users, acervo_documental: FileText,
  simulacoes: BarChart3, contratos: FileSignature, orcamentos: TrendingUp,
  followup: Handshake, inteligencia_360: Zap, proposta_bancaria: BarChart3,
  relatorio_tecnico: FileText,
};

const MODULO_ABA: Record<string, string> = {
  cadastro_empresa: "visao_geral", socios_qsa: "socios", acervo_documental: "documentos",
  simulacoes: "simulacoes", contratos: "contratos", orcamentos: "simulacoes",
  followup: "followup", inteligencia_360: "inteligencia_360",
  proposta_bancaria: "inteligencia_360", relatorio_tecnico: "inteligencia_360",
};

const PRIO_ACAO_CFG = {
  imediata: { label: "Imediata", color: "text-red-600",   bg: "bg-red-50 border-red-200" },
  proxima:  { label: "Próxima",  color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  futura:   { label: "Futura",   color: "text-slate-500", bg: "bg-slate-50 border-slate-200" },
};

function safeArr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

function formatarData(iso: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return iso; }
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CardEtapa({ etapa, atual, onNavegar }: { etapa: Etapa; atual: boolean; onNavegar?: (aba: string) => void }) {
  const [expandido, setExpandido] = useState(atual);
  const cfg = STATUS_ETAPA_CFG[etapa.status] ?? STATUS_ETAPA_CFG.nao_iniciada;
  const { Icon } = cfg;
  const ModuloIcon = MODULO_ICONS[etapa.modulo_principal] ?? Zap;
  const bloqueios = safeArr<Bloqueio>(etapa.bloqueios);
  const acoes = safeArr<Acao>(etapa.acoes_recomendadas);

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${atual ? "border-blue-400 shadow-md" : cfg.border}`}>
      {/* Header da etapa */}
      <button
        onClick={() => setExpandido(e => !e)}
        className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${atual ? "bg-blue-50 hover:bg-blue-100" : "bg-white hover:bg-slate-50"}`}
      >
        {/* Número */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black border-2 ${etapa.status === "concluida" ? "bg-emerald-500 text-white border-emerald-500" : etapa.status === "bloqueada" ? "bg-red-500 text-white border-red-500" : atual ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-500 border-slate-300"}`}>
          {etapa.status === "concluida" ? <CheckCircle2 className="w-4 h-4" /> : etapa.numero}
        </div>
        {/* Título e status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${atual ? "text-blue-800" : "text-slate-800"}`}>{etapa.titulo}</span>
            {atual && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-500 text-white">Etapa atual</span>}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              <Icon className="w-3 h-3 inline mr-0.5" />{cfg.label}
            </span>
          </div>
          {/* Barra de progresso */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${etapa.status === "concluida" ? "bg-emerald-500" : etapa.status === "bloqueada" ? "bg-red-400" : "bg-blue-400"}`}
                style={{ width: `${etapa.percentual_conclusao}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">{etapa.percentual_conclusao}%</span>
          </div>
        </div>
        <ModuloIcon className="w-4 h-4 text-slate-400 shrink-0" />
        {expandido ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="border-t border-slate-100 p-3 space-y-3 bg-white">
          <p className="text-[11px] text-slate-600">{etapa.descricao}</p>

          {/* Dados resumo */}
          {Object.keys(etapa.dados_resumo ?? {}).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(etapa.dados_resumo).map(([k, v]) => (
                <div key={k} className="flex flex-col p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
                  <span className="text-xs font-semibold text-slate-700">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bloqueios */}
          {bloqueios.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-red-600 uppercase tracking-wide flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Bloqueios ({bloqueios.length})
              </p>
              {bloqueios.map(b => (
                <div key={b.id} className={`flex items-start gap-2 p-2 rounded-lg border ${b.critico ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                  <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${b.critico ? "text-red-500" : "text-amber-500"}`} />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-800">{b.titulo}</p>
                    <p className="text-[10px] text-slate-600">{b.descricao}</p>
                    {onNavegar && (
                      <button onClick={() => onNavegar(MODULO_ABA[b.modulo] ?? "visao_geral")} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 mt-0.5">
                        Resolver → <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ações recomendadas */}
          {acoes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wide flex items-center gap-1">
                <ArrowRight className="w-3 h-3" /> Ações recomendadas ({acoes.length})
              </p>
              {acoes.map((a, i) => {
                const prioCfg = PRIO_ACAO_CFG[a.prioridade] ?? PRIO_ACAO_CFG.futura;
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5 ${prioCfg.bg} ${prioCfg.color}`}>{prioCfg.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-slate-800">{a.titulo}</p>
                      <p className="text-[10px] text-slate-600">{a.descricao}</p>
                      {onNavegar && (
                        <button onClick={() => onNavegar(MODULO_ABA[a.modulo] ?? "visao_geral")} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 mt-0.5">
                          Ir para módulo → <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  empresaId: string;
  onNavegar?: (aba: string) => void;
}

export default function EsteiraCredito({ empresaId, onNavegar }: Props) {
  const [data, setData] = useState<EsteiraData | null>(null);
  const [loading, setLoading] = useState(false);
  const [visao, setVisao] = useState<"timeline" | "historico">("timeline");

  const calcular = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/esteira-credito`);
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar esteira de crédito");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  // ── Estado inicial ──
  if (!data && !loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-violet-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center shrink-0">
            <Workflow className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-slate-900">Esteira de Crédito e Assessoria</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Visualize a jornada operacional completa da empresa: etapa atual, próximas etapas, bloqueios, ações recomendadas e histórico resumido.
            </p>
            <div className="mt-4">
              <button
                onClick={calcular}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 active:scale-95 transition-all shadow-md"
              >
                <Workflow className="w-4 h-4" />
                Carregar esteira
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 flex items-center gap-3 text-slate-700">
        <RefreshCw className="w-5 h-5 animate-spin text-violet-500" />
        <span className="text-sm font-semibold">Calculando esteira de crédito e assessoria...</span>
      </div>
    );
  }

  if (!data) return null;

  const etapas = safeArr<Etapa>(data.etapas);
  const historico = safeArr<HistoricoItem>(data.historico_resumido);
  const proximasEtapas = safeArr<{ numero: number; titulo: string; id: string }>(data.proximas_etapas);
  const statusCfg = STATUS_GERAL_CFG[data.status_geral] ?? STATUS_GERAL_CFG.em_andamento;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Workflow className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black">Esteira de Crédito e Assessoria</h3>
              <p className="text-xs opacity-75 mt-0.5">
                Etapa {data.etapa_atual_numero}/8 · {data.etapa_atual_titulo} · {data.progresso_geral}% concluído
              </p>
            </div>
          </div>
          <button onClick={calcular} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Recalcular
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* Métricas */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
          {data.total_bloqueios_criticos > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
              {data.total_bloqueios_criticos} bloqueio(s) crítico(s)
            </span>
          )}
          <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
            {data.total_acoes_pendentes} ação(ões) pendente(s)
          </span>
        </div>

        {/* Resumo executivo */}
        <p className="text-sm text-slate-700 leading-relaxed">{data.resumo_executivo}</p>

        {/* Barra de progresso geral */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Progresso geral da jornada</span>
            <span className="font-bold text-slate-700">{data.progresso_geral}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${data.progresso_geral >= 80 ? "bg-violet-500" : data.progresso_geral >= 50 ? "bg-blue-500" : data.progresso_geral >= 30 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${data.progresso_geral}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            {["Cadastro", "Docs", "Análise", "Proposta", "Negoc.", "Contrato", "Liberação", "Pós-Crédito"].map((l, i) => (
              <span key={i} className={i + 1 === data.etapa_atual_numero ? "font-black text-violet-600" : ""}>{l}</span>
            ))}
          </div>
        </div>

        {/* Próximas etapas (resumo rápido) */}
        {proximasEtapas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] text-slate-500 font-semibold self-center">Próximas:</span>
            {proximasEtapas.map(p => (
              <span key={p.id} className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {p.numero}. {p.titulo}
              </span>
            ))}
          </div>
        )}

        {/* Abas de visão */}
        <div className="flex gap-2 border-b border-slate-200">
          {(["timeline", "historico"] as const).map(v => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${visao === v ? "border-violet-500 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {v === "timeline" ? "Jornada" : "Histórico"}
            </button>
          ))}
        </div>

        {/* Visão Timeline */}
        {visao === "timeline" && (
          <div className="space-y-3">
            {etapas.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhuma etapa disponível.</p>
            ) : (
              etapas.map(etapa => (
                <CardEtapa
                  key={etapa.id}
                  etapa={etapa}
                  atual={etapa.numero === data.etapa_atual_numero}
                  onNavegar={onNavegar}
                />
              ))
            )}
          </div>
        )}

        {/* Visão Histórico */}
        {visao === "historico" && (
          <div className="space-y-2">
            {historico.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <History className="w-5 h-5 text-slate-400 shrink-0" />
                <p className="text-sm text-slate-500">Nenhum histórico registrado para esta empresa.</p>
              </div>
            ) : (
              historico.map((h, i) => {
                const ModuloIcon = MODULO_ICONS[h.modulo] ?? History;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <ModuloIcon className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide">{h.tipo}</span>
                        {h.data && <span className="text-[10px] text-slate-400">{formatarData(h.data)}</span>}
                      </div>
                      <p className="text-xs text-slate-700 mt-0.5">{h.descricao}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </div>
  );
}
