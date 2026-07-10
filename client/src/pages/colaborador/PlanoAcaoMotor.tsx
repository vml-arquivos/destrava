/**
 * PlanoAcaoMotor.tsx
 *
 * Bloco "Plano de Ação" integrado à aba Inteligência 360.
 * Exibe pendências por prioridade (kanban/lista), plano de ação numerado,
 * botão "Ir para módulo", "Copiar plano" e base futura para Nexus.
 *
 * REGRA: ZERO REGRESSÃO — apenas leitura, sem alterar dados.
 */

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  ClipboardList, RefreshCw, Copy, CheckCheck, ArrowRight,
  AlertTriangle, AlertCircle, Info, CheckCircle2,
  ChevronDown, ChevronUp, Zap,
  Building2, Users, FileText, BarChart3, FileSignature,
  TrendingUp, Handshake, Settings,
} from "lucide-react";
import EnviarNexus from "./EnviarNexus";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Prioridade = "alta" | "media" | "baixa";
type StatusGeral = "critico" | "atencao" | "bom" | "excelente";

interface Pendencia {
  id: string;
  categoria: string;
  prioridade: Prioridade;
  titulo: string;
  descricao: string;
  impacto: string;
  acaoRecomendada: string;
  modulo: string;
  resolvida: boolean;
}

interface GrupoPendencias {
  categoria: string;
  label: string;
  total: number;
  altas: number;
  medias: number;
  baixas: number;
  pendencias: Pendencia[];
}

interface PlanoAcaoItem {
  numero: number;
  pendencia_id: string;
  titulo: string;
  acao: string;
  modulo: string;
  prioridade: Prioridade;
  prazo: string;
}

interface MotorData {
  empresa_id: string;
  calculado_em: string;
  total: number;
  altas: number;
  medias: number;
  baixas: number;
  resolvidas: number;
  score_completude: number;
  status_geral: StatusGeral;
  grupos: GrupoPendencias[];
  plano_acao: PlanoAcaoItem[];
  resumo: string;
}

// ─── Configs visuais ──────────────────────────────────────────────────────────

const PRIO_CFG: Record<Prioridade, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  alta:  { label: "Alta",  color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    Icon: AlertCircle },
  media: { label: "Média", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  Icon: AlertTriangle },
  baixa: { label: "Baixa", color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   Icon: Info },
};

const STATUS_CFG: Record<StatusGeral, { label: string; color: string; bg: string }> = {
  critico:   { label: "Crítico",   color: "text-red-700",     bg: "bg-red-50 border-red-200" },
  atencao:   { label: "Atenção",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  bom:       { label: "Bom",       color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  excelente: { label: "Excelente", color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
};

const MODULO_ICONS: Record<string, React.ElementType> = {
  cadastro_empresa:   Building2,
  socios_qsa:         Users,
  acervo_documental:  FileText,
  simulacoes:         BarChart3,
  contratos:          FileSignature,
  orcamentos:         TrendingUp,
  followup:           Handshake,
  inteligencia_360:   Zap,
  proposta_bancaria:  BarChart3,
  relatorio_tecnico:  FileText,
};

const MODULO_ABA: Record<string, string> = {
  cadastro_empresa:   "visao_geral",
  socios_qsa:         "socios",
  acervo_documental:  "documentos",
  simulacoes:         "simulacoes",
  contratos:          "contratos",
  orcamentos:         "simulacoes",
  followup:           "followup",
  inteligencia_360:   "inteligencia_360",
  proposta_bancaria:  "inteligencia_360",
  relatorio_tecnico:  "inteligencia_360",
};

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function PrioridadeChip({ prioridade }: { prioridade: Prioridade }) {
  const cfg = PRIO_CFG[prioridade] ?? PRIO_CFG.baixa;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function CardPendencia({ p, onNavegar }: { p: Pendencia; onNavegar?: (aba: string) => void }) {
  const [expandido, setExpandido] = useState(false);
  const ModuloIcon = MODULO_ICONS[p.modulo] ?? Settings;
  const aba = MODULO_ABA[p.modulo] ?? "visao_geral";

  return (
    <div className={`rounded-xl border bg-white overflow-hidden ${p.prioridade === "alta" ? "border-red-200" : p.prioridade === "media" ? "border-amber-200" : "border-slate-200"}`}>
      <button
        onClick={() => setExpandido(e => !e)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${p.prioridade === "alta" ? "bg-red-100" : p.prioridade === "media" ? "bg-amber-100" : "bg-blue-100"}`}>
          <ModuloIcon className={`w-4 h-4 ${p.prioridade === "alta" ? "text-red-600" : p.prioridade === "media" ? "text-amber-600" : "text-blue-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-slate-800">{p.titulo}</p>
            <PrioridadeChip prioridade={p.prioridade} />
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{p.descricao}</p>
        </div>
        {expandido ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
      </button>
      {expandido && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
          <div className="text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Impacto: </span>{p.impacto}
          </div>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-600">
            <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-blue-500" />
            <span><span className="font-semibold text-slate-700">Ação: </span>{p.acaoRecomendada}</span>
          </div>
          {onNavegar && (
            <button
              onClick={() => onNavegar(aba)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ArrowRight className="w-3 h-3" />
              Ir para módulo →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoAccordion({ grupo, onNavegar }: { grupo: GrupoPendencias; onNavegar?: (aba: string) => void }) {
  const [aberto, setAberto] = useState(grupo.altas > 0);
  const ModuloIcon = MODULO_ICONS[grupo.categoria] ?? Settings;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setAberto(a => !a)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ModuloIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">{grupo.label}</span>
          <span className="text-[10px] text-slate-500">{grupo.total} pend.</span>
          {grupo.altas > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">{grupo.altas} alta{grupo.altas > 1 ? "s" : ""}</span>}
          {grupo.medias > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{grupo.medias} média{grupo.medias > 1 ? "s" : ""}</span>}
        </div>
        {aberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {aberto && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
          {safeArr<Pendencia>(grupo.pendencias).map(p => (
            <CardPendencia key={p.id} p={p} onNavegar={onNavegar} />
          ))}
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

export default function PlanoAcaoMotor({ empresaId, onNavegar }: Props) {
  const [data, setData] = useState<MotorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [visao, setVisao] = useState<"kanban" | "plano">("kanban");

  const calcular = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/pendencias`);
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao calcular pendências");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  const copiarPlano = useCallback(() => {
    if (!data) return;
    const plano = safeArr<PlanoAcaoItem>(data.plano_acao);
    if (plano.length === 0) {
      toast.info("Nenhuma pendência para copiar.");
      return;
    }
    const texto = [
      `PLANO DE AÇÃO — ${new Date(data.calculado_em).toLocaleDateString("pt-BR")}`,
      `Score de Completude: ${data.score_completude}/100 | Status: ${STATUS_CFG[data.status_geral]?.label}`,
      `Total de pendências: ${data.total} (${data.altas} alta, ${data.medias} média, ${data.baixas} baixa)`,
      "",
      ...plano.map(p => `${p.numero}. [${p.prioridade.toUpperCase()}] ${p.titulo}\n   → ${p.acao} (${p.prazo})`),
    ].join("\n");
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      toast.success("Plano de ação copiado!");
      setTimeout(() => setCopiado(false), 3000);
    }).catch(() => toast.error("Não foi possível copiar o plano"));
  }, [data]);

  // ── Estado inicial ──
  if (!data && !loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-amber-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-slate-900">Motor de Pendências e Plano de Ação</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Identifica automaticamente o que impede ou dificulta contrato, análise de crédito, proposta bancária, faturamento, documentação e relacionamento comercial.
            </p>
            <div className="mt-4">
              <button
                onClick={calcular}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 active:scale-95 transition-all shadow-md"
              >
                <Zap className="w-4 h-4" />
                Calcular pendências
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
        <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
        <span className="text-sm font-semibold">Calculando pendências e plano de ação...</span>
      </div>
    );
  }

  if (!data) return null;

  const grupos = safeArr<GrupoPendencias>(data.grupos);
  const planoAcao = safeArr<PlanoAcaoItem>(data.plano_acao);
  const statusCfg = STATUS_CFG[data.status_geral] ?? STATUS_CFG.atencao;

  // Pendências por prioridade (para visão kanban)
  const todasPendencias = grupos.flatMap(g => safeArr<Pendencia>(g.pendencias));
  const altas = todasPendencias.filter(p => p.prioridade === "alta");
  const medias = todasPendencias.filter(p => p.prioridade === "media");
  const baixas = todasPendencias.filter(p => p.prioridade === "baixa");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ClipboardList className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black">Motor de Pendências e Plano de Ação</h3>
              <p className="text-xs opacity-75 mt-0.5">
                {data.total} pendência(s) · Score de completude: {data.score_completude}/100
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copiarPlano} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
              {copiado ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiado ? "Copiado!" : "Copiar plano"}
            </button>
            <button
              title="Criar tarefas no Nexus"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all"
              onClick={() => document.getElementById(`nexus-block-${empresaId}`)?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Zap className="w-3.5 h-3.5" />
              Criar no Nexus
            </button>
            <button onClick={calcular} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Recalcular
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* Status e métricas */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
            Status: {statusCfg.label}
          </span>
          {data.altas > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
              {data.altas} alta{data.altas > 1 ? "s" : ""}
            </span>
          )}
          {data.medias > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
              {data.medias} média{data.medias > 1 ? "s" : ""}
            </span>
          )}
          {data.baixas > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
              {data.baixas} baixa{data.baixas > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Resumo */}
        <p className="text-sm text-slate-700 leading-relaxed">{data.resumo}</p>

        {/* Score de completude */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Score de completude do cadastro</span>
            <span className="font-bold text-slate-700">{data.score_completude}/100</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${data.score_completude >= 70 ? "bg-emerald-500" : data.score_completude >= 50 ? "bg-amber-400" : data.score_completude >= 30 ? "bg-orange-400" : "bg-red-500"}`}
              style={{ width: `${data.score_completude}%` }}
            />
          </div>
        </div>

        {/* Sem pendências */}
        {data.total === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800">
              Cliente sem pendências críticas identificadas com os dados atuais.
            </p>
          </div>
        )}

        {/* Abas de visão */}
        {data.total > 0 && (
          <>
            <div className="flex gap-2 border-b border-slate-200">
              {(["kanban", "plano"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVisao(v)}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${visao === v ? "border-amber-500 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  {v === "kanban" ? "Por Prioridade" : "Plano de Ação"}
                </button>
              ))}
            </div>

            {/* Visão Kanban */}
            {visao === "kanban" && (
              <div className="space-y-4">
                {altas.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <h4 className="text-xs font-black text-red-700 uppercase tracking-wide">Alta Prioridade ({altas.length})</h4>
                    </div>
                    <div className="space-y-2">
                      {altas.map(p => <CardPendencia key={p.id} p={p} onNavegar={onNavegar} />)}
                    </div>
                  </div>
                )}
                {medias.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <h4 className="text-xs font-black text-amber-700 uppercase tracking-wide">Média Prioridade ({medias.length})</h4>
                    </div>
                    <div className="space-y-2">
                      {medias.map(p => <CardPendencia key={p.id} p={p} onNavegar={onNavegar} />)}
                    </div>
                  </div>
                )}
                {baixas.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      <h4 className="text-xs font-black text-blue-700 uppercase tracking-wide">Baixa Prioridade ({baixas.length})</h4>
                    </div>
                    <div className="space-y-2">
                      {baixas.map(p => <CardPendencia key={p.id} p={p} onNavegar={onNavegar} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Visão Plano de Ação */}
            {visao === "plano" && (
              <div className="space-y-2">
                {planoAcao.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhuma ação pendente.</p>
                ) : (
                  planoAcao.map(p => {
                    const ModuloIcon = MODULO_ICONS[p.modulo] ?? Settings;
                    const aba = MODULO_ABA[p.modulo] ?? "visao_geral";
                    const prioCfg = PRIO_CFG[p.prioridade] ?? PRIO_CFG.baixa;
                    return (
                      <div key={p.pendencia_id} className={`flex items-start gap-3 p-3 rounded-xl border ${prioCfg.border} ${prioCfg.bg}`}>
                        <span className={`h-6 w-6 rounded-full font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5 ${p.prioridade === "alta" ? "bg-red-600 text-white" : p.prioridade === "media" ? "bg-amber-500 text-white" : "bg-blue-500 text-white"}`}>
                          {p.numero}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-slate-800">{p.titulo}</p>
                            <PrioridadeChip prioridade={p.prioridade} />
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 flex items-start gap-1">
                            <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />{p.acao}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <ModuloIcon className="w-3 h-3" />{p.modulo.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] text-slate-500">Prazo: {p.prazo}</span>
                            {onNavegar && (
                              <button
                                onClick={() => onNavegar(aba)}
                                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
                              >
                                Ir para módulo <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}

        {/* Por categoria (colapsável) */}
        {grupos.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide">Por Categoria</h4>
            {grupos.map(g => (
              <GrupoAccordion key={g.categoria} grupo={g} onNavegar={onNavegar} />
            ))}
          </div>
        )}

        {/* ── Integração Nexus/n8n ── */}
        {data.total > 0 && (
          <div id={`nexus-block-${empresaId}`}>
            <EnviarNexus
              empresaId={empresaId}
              cnpj={null}
              razaoSocial={empresaId}
              pendencias={todasPendencias
                .filter(p => p.prioridade === "alta" || p.prioridade === "media")
                .map(p => ({
                  pendenciaId: p.id,
                  prioridade: p.prioridade as "alta" | "media" | "baixa",
                  categoria: p.categoria || "geral",
                  titulo: p.titulo || "Pendência",
                  descricao: p.descricao || p.impacto || "",
                  moduloOrigem: p.modulo || "inteligencia_360",
                  acaoRecomendada: p.acaoRecomendada || "Resolver pendência",
                }))}
            />
          </div>
        )}

      </div>
    </div>
  );
}
