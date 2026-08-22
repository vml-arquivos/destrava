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
  concluida:    { label: "Concluída",    color: "text-success", bg: "bg-success/10",  border: "border-success/30", Icon: CheckCircle2 },
  em_andamento: { label: "Em andamento", color: "text-primary",    bg: "bg-primary/10",     border: "border-primary/30",    Icon: Clock },
  bloqueada:    { label: "Bloqueada",    color: "text-destructive",     bg: "bg-destructive/10",      border: "border-destructive/30",     Icon: AlertCircle },
  pendente:     { label: "Pendente",     color: "text-warning",   bg: "bg-warning/10",    border: "border-warning/30",   Icon: AlertTriangle },
  nao_iniciada: { label: "Não iniciada", color: "text-muted-foreground",   bg: "bg-muted",    border: "border-border",   Icon: Minus },
};

const STATUS_GERAL_CFG: Record<StatusGeral, { label: string; color: string; bg: string }> = {
  critico:      { label: "Crítico",      color: "text-destructive",     bg: "bg-destructive/10 border-destructive/20" },
  atencao:      { label: "Atenção",      color: "text-warning",   bg: "bg-warning/10 border-warning/20" },
  em_andamento: { label: "Em andamento", color: "text-primary",    bg: "bg-primary/10 border-primary/20" },
  avancado:     { label: "Avançado",     color: "text-primary",  bg: "bg-primary/10 border-primary/20" },
  concluido:    { label: "Concluído",    color: "text-success", bg: "bg-success/10 border-success/20" },
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
  imediata: { label: "Imediata", color: "text-destructive",   bg: "bg-destructive/10 border-destructive/20" },
  proxima:  { label: "Próxima",  color: "text-warning", bg: "bg-warning/10 border-warning/20" },
  futura:   { label: "Futura",   color: "text-muted-foreground", bg: "bg-muted border-border" },
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
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${atual ? "border-primary/30 shadow-md" : cfg.border}`}>
      {/* Header da etapa */}
      <button
        onClick={() => setExpandido(e => !e)}
        className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${atual ? "bg-primary/10 hover:bg-primary/20" : "bg-card hover:bg-muted"}`}
      >
        {/* Número */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black border-2 ${etapa.status === "concluida" ? "bg-success text-primary-foreground border-success/30" : etapa.status === "bloqueada" ? "bg-destructive text-primary-foreground border-destructive/30" : atual ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-input"}`}>
          {etapa.status === "concluida" ? <CheckCircle2 className="w-4 h-4" /> : etapa.numero}
        </div>
        {/* Título e status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${atual ? "text-primary" : "text-foreground"}`}>{etapa.titulo}</span>
            {atual && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">Etapa atual</span>}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              <Icon className="w-3 h-3 inline mr-0.5" />{cfg.label}
            </span>
          </div>
          {/* Barra de progresso */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${etapa.status === "concluida" ? "bg-success" : etapa.status === "bloqueada" ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${etapa.percentual_conclusao}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{etapa.percentual_conclusao}%</span>
          </div>
        </div>
        <ModuloIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        {expandido ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="border-t border-border p-3 space-y-3 bg-card">
          <p className="text-[11px] text-muted-foreground">{etapa.descricao}</p>

          {/* Dados resumo */}
          {Object.keys(etapa.dados_resumo ?? {}).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(etapa.dados_resumo).map(([k, v]) => (
                <div key={k} className="flex flex-col p-2 rounded-lg bg-muted border border-border">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
                  <span className="text-xs font-semibold text-foreground">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bloqueios */}
          {bloqueios.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-destructive uppercase tracking-wide flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Bloqueios ({bloqueios.length})
              </p>
              {bloqueios.map(b => (
                <div key={b.id} className={`flex items-start gap-2 p-2 rounded-lg border ${b.critico ? "bg-destructive/10 border-destructive/20" : "bg-warning/10 border-warning/20"}`}>
                  <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${b.critico ? "text-destructive" : "text-warning"}`} />
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{b.titulo}</p>
                    <p className="text-[10px] text-muted-foreground">{b.descricao}</p>
                    {onNavegar && (
                      <button onClick={() => onNavegar(MODULO_ABA[b.modulo] ?? "visao_geral")} className="text-[10px] font-semibold text-primary hover:text-primary flex items-center gap-0.5 mt-0.5">
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
              <p className="text-[10px] font-black text-primary uppercase tracking-wide flex items-center gap-1">
                <ArrowRight className="w-3 h-3" /> Ações recomendadas ({acoes.length})
              </p>
              {acoes.map((a, i) => {
                const prioCfg = PRIO_ACAO_CFG[a.prioridade] ?? PRIO_ACAO_CFG.futura;
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg border border-border bg-muted">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5 ${prioCfg.bg} ${prioCfg.color}`}>{prioCfg.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-foreground">{a.titulo}</p>
                      <p className="text-[10px] text-muted-foreground">{a.descricao}</p>
                      {onNavegar && (
                        <button onClick={() => onNavegar(MODULO_ABA[a.modulo] ?? "visao_geral")} className="text-[10px] font-semibold text-primary hover:text-primary flex items-center gap-0.5 mt-0.5">
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
      <div className="rounded-2xl border border-border bg-gradient-to-br from-slate-50 to-violet-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <Workflow className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-foreground">Esteira de Crédito e Assessoria</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Visualize a jornada operacional completa da empresa: etapa atual, próximas etapas, bloqueios, ações recomendadas e histórico resumido.
            </p>
            <div className="mt-4">
              <button
                onClick={calcular}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary active:scale-95 transition-all shadow-md"
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
      <div className="rounded-2xl border border-border bg-muted p-6 flex items-center gap-3 text-foreground">
        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
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
    <div className="rounded-2xl border border-border bg-card overflow-hidden">

      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-primary-foreground p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-card/20 flex items-center justify-center shrink-0">
              <Workflow className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-black">Esteira de Crédito e Assessoria</h3>
              <p className="text-xs opacity-75 mt-0.5">
                Etapa {data.etapa_atual_numero}/8 · {data.etapa_atual_titulo} · {data.progresso_geral}% concluído
              </p>
            </div>
          </div>
          <button onClick={calcular} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
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
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-destructive/10 text-destructive border-destructive/20">
              {data.total_bloqueios_criticos} bloqueio(s) crítico(s)
            </span>
          )}
          <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-muted text-muted-foreground border-border">
            {data.total_acoes_pendentes} ação(ões) pendente(s)
          </span>
        </div>

        {/* Resumo executivo */}
        <p className="text-sm text-foreground leading-relaxed">{data.resumo_executivo}</p>

        {/* Barra de progresso geral */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progresso geral da jornada</span>
            <span className="font-bold text-foreground">{data.progresso_geral}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${data.progresso_geral >= 80 ? "bg-primary/100" : data.progresso_geral >= 50 ? "bg-primary" : data.progresso_geral >= 30 ? "bg-warning" : "bg-destructive"}`}
              style={{ width: `${data.progresso_geral}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
            {["Cadastro", "Docs", "Análise", "Proposta", "Negoc.", "Contrato", "Liberação", "Pós-Crédito"].map((l, i) => (
              <span key={i} className={i + 1 === data.etapa_atual_numero ? "font-black text-primary" : ""}>{l}</span>
            ))}
          </div>
        </div>

        {/* Próximas etapas (resumo rápido) */}
        {proximasEtapas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] text-muted-foreground font-semibold self-center">Próximas:</span>
            {proximasEtapas.map(p => (
              <span key={p.id} className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                {p.numero}. {p.titulo}
              </span>
            ))}
          </div>
        )}

        {/* Abas de visão */}
        <div className="flex gap-2 border-b border-border">
          {(["timeline", "historico"] as const).map(v => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${visao === v ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {v === "timeline" ? "Jornada" : "Histórico"}
            </button>
          ))}
        </div>

        {/* Visão Timeline */}
        {visao === "timeline" && (
          <div className="space-y-3">
            {etapas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma etapa disponível.</p>
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
              <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted">
                <History className="w-5 h-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">Nenhum histórico registrado para esta empresa.</p>
              </div>
            ) : (
              historico.map((h, i) => {
                const ModuloIcon = MODULO_ICONS[h.modulo] ?? History;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted">
                    <div className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
                      <ModuloIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">{h.tipo}</span>
                        {h.data && <span className="text-[10px] text-muted-foreground">{formatarData(h.data)}</span>}
                      </div>
                      <p className="text-xs text-foreground mt-0.5">{h.descricao}</p>
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
