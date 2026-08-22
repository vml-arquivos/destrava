/**
 * PropostaBancaria.tsx
 *
 * Bloco de Proposta Bancária Inteligente integrado à aba Inteligência 360.
 * Layout premium, compacto, responsivo e sem rolagem interna desnecessária.
 *
 * REGRA: ZERO REGRESSÃO — não altera dados, apenas leitura.
 * A proposta é preliminar e consultiva. Nunca promete aprovação bancária.
 */

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Banknote, RefreshCw, Copy, Send, ShoppingCart,
  CheckCircle2, AlertTriangle, XCircle, TrendingUp,
  FileDown, ChevronDown, ChevronUp, ArrowRight,
  ShieldCheck, ShieldAlert, ShieldX, Star,
  Building2, BarChart3, AlertCircle, Info,
  Clock, CheckCheck, Zap,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PropostaPreliminar {
  valorSugerido: number | null;
  prazoSugerido: number | null;
  produtoSugerido: string | null;
  justificativa: string;
  observacoes: string[];
}

interface PerfilCredito {
  situacao: string;
  regime_tributario: string;
  porte: string;
  tempo_atividade: string | null;
  cnae: string;
  natureza_juridica: string;
  capital_social: string;
  faturamento: string;
  limite_atual: string;
  score_destrava: number;
  score_interno: string;
  score_serasa: string;
  score_spc: string;
  nivel_risco: "baixo" | "medio" | "alto" | "critico";
  classificacao: string;
}

interface CapacidadeCredito {
  faturamento_base: number | null;
  capital_social_base: number | null;
  limite_estimado_min: number | null;
  limite_estimado_max: number | null;
  prazo_sugerido_min: number;
  prazo_sugerido_max: number;
  observacao: string;
  dados_suficientes: boolean;
}

interface DocumentacaoProposta {
  total_documentos: number;
  documentos_com_arquivo: number;
  documentos_sem_arquivo: number;
  documentos_validados: number;
  documentos_pendentes: number;
  percentual_cobertura: number;
  status: string;
  lista: Array<{ tipo: string; tem_arquivo: boolean; status: string }>;
}

interface RiscoProposta {
  tipo: string;
  descricao: string;
  severidade: "critica" | "alta" | "media" | "baixa";
  mitigacao: string;
}

interface PendenciaProposta {
  tipo: string;
  descricao: string;
  impacto: "bloqueia_proposta" | "reduz_limite" | "informativo";
  acao_requerida: string;
}

interface PropostaBancariaData {
  empresa: any;
  resumoExecutivo: string;
  perfilCredito: PerfilCredito;
  capacidadeCredito: CapacidadeCredito;
  documentacao: DocumentacaoProposta;
  pendencias: PendenciaProposta[];
  riscos: RiscoProposta[];
  pontosFortes: string[];
  simulacoes: any[];
  orcamentos: any[];
  contratos: any[];
  propostaPreliminar: PropostaPreliminar;
  parecerTecnico: string;
  proximosPassos: string[];
  score_destrava: number;
  status_proposta: "apto_analise" | "necessita_complementacao" | "dados_insuficientes" | "inapto";
  gerado_em: string;
  fonte: string;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function fmtBRL(v: number | null | undefined): string {
  if (v === null || v === undefined) return "Não informado";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return String(v); }
}

// ─── Configurações visuais ────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  apto_analise:              { label: "Apto para análise preliminar",       color: "text-success", bg: "bg-success/10 border-success/20", dot: "bg-success" },
  necessita_complementacao:  { label: "Necessita complementação documental", color: "text-warning",   bg: "bg-warning/10 border-warning/20",     dot: "bg-warning/100" },
  dados_insuficientes:       { label: "Dados insuficientes",                color: "text-warning",  bg: "bg-warning/10 border-warning/20",   dot: "bg-warning" },
  inapto:                    { label: "Inapto — regularização necessária",  color: "text-destructive",     bg: "bg-destructive/10 border-destructive/20",         dot: "bg-destructive" },
};

const RISCO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  baixo:   { label: "Baixo",   color: "text-success", bg: "bg-success/10 border-success/20", Icon: ShieldCheck },
  medio:   { label: "Médio",   color: "text-warning",   bg: "bg-warning/10 border-warning/20",     Icon: ShieldAlert },
  alto:    { label: "Alto",    color: "text-warning",  bg: "bg-warning/10 border-warning/20",   Icon: ShieldAlert },
  critico: { label: "Crítico", color: "text-destructive",     bg: "bg-destructive/10 border-destructive/20",         Icon: ShieldX },
};

const SEV_CFG: Record<string, { color: string; label: string }> = {
  critica: { color: "text-destructive bg-destructive/10 border-destructive/20",           label: "Crítica" },
  alta:    { color: "text-warning bg-warning/10 border-warning/20",  label: "Alta" },
  media:   { color: "text-warning bg-warning/10 border-warning/20",     label: "Média" },
  baixa:   { color: "text-muted-foreground bg-muted border-border",     label: "Baixa" },
};

const IMPACTO_CFG: Record<string, { label: string; color: string }> = {
  bloqueia_proposta: { label: "Bloqueia proposta", color: "text-destructive" },
  reduz_limite:      { label: "Reduz limite",       color: "text-warning" },
  informativo:       { label: "Informativo",        color: "text-muted-foreground" },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const cor = pct >= 70 ? "bg-success" : pct >= 50 ? "bg-warning" : pct >= 30 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-black text-foreground w-8 text-right tabular-nums">{score}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-foreground text-right">{value || "—"}</span>
    </div>
  );
}

function Accordion({ title, icon: Icon, badge, children, defaultOpen = false, badgeColor = "bg-primary/20 text-primary" }: {
  title: string; icon: React.ElementType; badge?: number; children: React.ReactNode;
  defaultOpen?: boolean; badgeColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-3.5 hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  empresaId: string;
  onNavegar?: (aba: string) => void;
}

export default function PropostaBancaria({ empresaId, onNavegar }: Props) {
  const [data, setData] = useState<PropostaBancariaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [parecerCopiado, setParecerCopiado] = useState(false);

  const gerarProposta = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/proposta-bancaria`);
      setData(res);
      toast.success("Proposta bancária gerada com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar proposta bancária");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  const baixarPdf = useCallback(async () => {
    if (!empresaId || !data) return;
    setGerandoPdf(true);
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
      const res = await fetch(`/api/empresas/${empresaId}/proposta-bancaria/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta-bancaria-${data.empresa?.razao_social?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "empresa"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar PDF");
    } finally {
      setGerandoPdf(false);
    }
  }, [empresaId, data]);

  const copiarParecer = useCallback(() => {
    if (!data?.parecerTecnico) return;
    navigator.clipboard.writeText(data.parecerTecnico).then(() => {
      setParecerCopiado(true);
      toast.success("Parecer copiado para a área de transferência!");
      setTimeout(() => setParecerCopiado(false), 3000);
    }).catch(() => {
      toast.error("Não foi possível copiar o parecer");
    });
  }, [data]);

  const irParaOrcamento = useCallback(() => {
    if (onNavegar) {
      onNavegar("simulacoes");
      toast.info("Navegando para Simulações — selecione uma simulação para criar o orçamento.");
    }
  }, [onNavegar]);

  const enviarAoCliente = useCallback(() => {
    toast.info("Envio ao cliente será implementado na próxima sprint com integração ao módulo de comunicação.");
  }, []);

  // ── Estado inicial: sem proposta gerada ──
  if (!data && !loading) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/10 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <Banknote className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-foreground">Proposta Bancária Inteligente</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Consolida dados cadastrais, documentação, scores, simulações e pendências em uma proposta
              preliminar de crédito consultiva para bancos e parceiros.
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              Proposta preliminar e consultiva. Sujeita à análise bancária. Não constitui garantia de aprovação.
            </p>
            <button
              onClick={gerarProposta}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary active:scale-95 transition-all shadow-md shadow-blue-200"
            >
              <Zap className="w-4 h-4" />
              Gerar proposta bancária
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Carregando ──
  if (loading) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-6 flex items-center gap-3 text-primary">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">Consolidando dados e gerando proposta bancária...</span>
      </div>
    );
  }

  if (!data) return null;

  // Garantir arrays seguros
  const pendencias = safeArr<PendenciaProposta>(data.pendencias);
  const riscos = safeArr<RiscoProposta>(data.riscos);
  const pontosFortes = safeArr<string>(data.pontosFortes);
  const proximosPassos = safeArr<string>(data.proximosPassos);
  const simulacoes = safeArr<any>(data.simulacoes);
  const orcamentos = safeArr<any>(data.orcamentos);
  const contratos = safeArr<any>(data.contratos);
  const observacoes = safeArr<string>(data.propostaPreliminar?.observacoes);
  const docLista = safeArr<any>(data.documentacao?.lista);

  const statusCfg = STATUS_CFG[data.status_proposta] ?? STATUS_CFG.dados_insuficientes;
  const riscoCfg = RISCO_CFG[data.perfilCredito?.nivel_risco ?? "medio"] ?? RISCO_CFG.medio;
  const RiscoIcon = riscoCfg.Icon;
  const bloqueantes = pendencias.filter(p => p.impacto === "bloqueia_proposta");

  return (
    <div className="space-y-4">

      {/* ── Header da proposta ── */}
      <div className={`rounded-2xl border p-4 ${statusCfg.bg}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Banknote className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-foreground">Proposta Bancária Inteligente</h3>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                  {statusCfg.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gerado em {fmtDate(data.gerado_em)} · Análise determinística
              </p>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={gerarProposta}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-muted hover:border-input transition-all"
              title="Recalcular proposta"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Recalcular
            </button>

            <button
              onClick={copiarParecer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-muted hover:border-input transition-all"
            >
              {parecerCopiado ? <CheckCheck className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              {parecerCopiado ? "Copiado!" : "Copiar parecer"}
            </button>

            <button
              onClick={baixarPdf}
              disabled={gerandoPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
            >
              {gerandoPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              {gerandoPdf ? "Gerando..." : "Baixar PDF"}
            </button>

            <button
              onClick={enviarAoCliente}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-muted transition-all"
              title="Envio ao cliente será implementado na próxima sprint"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar ao cliente
            </button>

            <button
              onClick={irParaOrcamento}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-success/20 bg-success/10 text-xs font-semibold text-success hover:bg-success/20 transition-all"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Usar em orçamento
            </button>
          </div>
        </div>
      </div>

      {/* ── Resumo Executivo ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-bold text-foreground">Resumo Executivo</h4>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{data.resumoExecutivo}</p>
      </div>

      {/* ── Score + Risco ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground">Score Destrava</span>
          </div>
          <ScoreBar score={data.score_destrava} max={100} />
          <div className="mt-2 grid grid-cols-3 gap-1">
            {[
              { label: "Interno", value: data.perfilCredito?.score_interno },
              { label: "Serasa", value: data.perfilCredito?.score_serasa },
              { label: "SPC", value: data.perfilCredito?.score_spc },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-1.5 rounded-lg bg-muted">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-xs font-bold text-foreground">{value || "—"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-xl border p-3 ${riscoCfg.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <RiscoIcon className={`w-4 h-4 ${riscoCfg.color}`} />
            <span className="text-xs font-bold text-muted-foreground">Nível de Risco</span>
            <span className={`text-xs font-black ${riscoCfg.color}`}>{riscoCfg.label}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{data.perfilCredito?.classificacao}</p>
          <div className="mt-2 space-y-0.5">
            <InfoRow label="Situação" value={data.perfilCredito?.situacao} />
            <InfoRow label="Tempo de atividade" value={data.perfilCredito?.tempo_atividade || "Não informado"} />
          </div>
        </div>
      </div>

      {/* ── Proposta Preliminar ── */}
      {(data.propostaPreliminar?.valorSugerido || data.propostaPreliminar?.produtoSugerido) && (
        <div className="rounded-xl border border-success/20 bg-success/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Banknote className="w-4 h-4 text-success" />
            <h4 className="text-sm font-bold text-foreground">Proposta Preliminar de Crédito</h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/20 font-bold">Estimativa</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {data.propostaPreliminar.valorSugerido && (
              <div className="rounded-lg bg-card border border-success/20 p-3 text-center">
                <p className="text-[11px] text-muted-foreground mb-1">Valor Sugerido</p>
                <p className="text-lg font-black text-success">{fmtBRL(data.propostaPreliminar.valorSugerido)}</p>
              </div>
            )}
            {data.propostaPreliminar.produtoSugerido && (
              <div className="rounded-lg bg-card border border-success/20 p-3 text-center">
                <p className="text-[11px] text-muted-foreground mb-1">Produto Sugerido</p>
                <p className="text-sm font-bold text-foreground">{data.propostaPreliminar.produtoSugerido}</p>
              </div>
            )}
            {data.propostaPreliminar.prazoSugerido && (
              <div className="rounded-lg bg-card border border-success/20 p-3 text-center">
                <p className="text-[11px] text-muted-foreground mb-1">Prazo Sugerido</p>
                <p className="text-sm font-bold text-foreground">{data.propostaPreliminar.prazoSugerido} meses</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">{data.propostaPreliminar.justificativa}</p>
          {observacoes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {observacoes.map((obs, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                  {obs}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Capacidade de Crédito ── */}
      {data.capacidadeCredito?.dados_suficientes && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-bold text-foreground">Capacidade Estimada de Crédito</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-muted p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Faturamento Base</p>
              <p className="text-xs font-bold text-foreground">{fmtBRL(data.capacidadeCredito.faturamento_base)}</p>
            </div>
            <div className="rounded-lg bg-muted p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Capital Social</p>
              <p className="text-xs font-bold text-foreground">{fmtBRL(data.capacidadeCredito.capital_social_base)}</p>
            </div>
            <div className="rounded-lg bg-success/10 border border-success/20 p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Limite Mín. Est.</p>
              <p className="text-xs font-bold text-success">{fmtBRL(data.capacidadeCredito.limite_estimado_min)}</p>
            </div>
            <div className="rounded-lg bg-success/10 border border-success/20 p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Limite Máx. Est.</p>
              <p className="text-xs font-bold text-success">{fmtBRL(data.capacidadeCredito.limite_estimado_max)}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 italic">{data.capacidadeCredito.observacao}</p>
        </div>
      )}

      {/* ── Perfil de Crédito ── */}
      <Accordion title="Perfil de Crédito" icon={Building2} defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 pt-2">
          <InfoRow label="Regime Tributário" value={data.perfilCredito?.regime_tributario} />
          <InfoRow label="Porte" value={data.perfilCredito?.porte} />
          <InfoRow label="CNAE" value={data.perfilCredito?.cnae} />
          <InfoRow label="Natureza Jurídica" value={data.perfilCredito?.natureza_juridica} />
          <InfoRow label="Capital Social" value={data.perfilCredito?.capital_social} />
          <InfoRow label="Faturamento" value={data.perfilCredito?.faturamento} />
          <InfoRow label="Limite Atual" value={data.perfilCredito?.limite_atual} />
          <InfoRow label="Tempo de Atividade" value={data.perfilCredito?.tempo_atividade || "Não informado"} />
        </div>
      </Accordion>

      {/* ── Pontos Fortes ── */}
      {pontosFortes.length > 0 && (
        <Accordion title={`Pontos Fortes (${pontosFortes.length})`} icon={CheckCircle2} badge={pontosFortes.length} defaultOpen={true} badgeColor="bg-success/20 text-success">
          <ul className="space-y-2 pt-2">
            {pontosFortes.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-success">
                <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </Accordion>
      )}

      {/* ── Riscos ── */}
      {riscos.length > 0 && (
        <Accordion title={`Riscos Identificados (${riscos.length})`} icon={AlertTriangle} badge={riscos.length} defaultOpen={riscos.some(r => r.severidade === "critica" || r.severidade === "alta")} badgeColor="bg-warning/20 text-warning">
          <div className="space-y-2 pt-2">
            {riscos.map((r, i) => {
              const sev = SEV_CFG[r.severidade] ?? SEV_CFG.baixa;
              return (
                <div key={i} className={`rounded-xl border p-3 ${sev.color}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold">{r.descricao}</p>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${sev.color}`}>{sev.label}</span>
                  </div>
                  <p className="text-[11px] mt-1.5 opacity-75 flex items-start gap-1">
                    <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                    {r.mitigacao}
                  </p>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {/* ── Pendências ── */}
      {pendencias.length > 0 && (
        <Accordion title={`Pendências (${pendencias.length})`} icon={AlertCircle} badge={bloqueantes.length} defaultOpen={bloqueantes.length > 0} badgeColor="bg-destructive/20 text-destructive">
          <div className="space-y-2 pt-2">
            {pendencias.map((p, i) => {
              const imp = IMPACTO_CFG[p.impacto] ?? IMPACTO_CFG.informativo;
              return (
                <div key={i} className="rounded-xl border border-border bg-muted p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{p.descricao}</p>
                    <span className={`text-[10px] font-bold shrink-0 ${imp.color}`}>{imp.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                    <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                    {p.acao_requerida}
                  </p>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {/* ── Documentação ── */}
      <Accordion title="Documentação" icon={AlertTriangle} badge={data.documentacao?.documentos_sem_arquivo} badgeColor="bg-warning/20 text-warning">
        <div className="pt-2 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Total", value: data.documentacao?.total_documentos, color: "text-foreground" },
              { label: "Com arquivo", value: data.documentacao?.documentos_com_arquivo, color: "text-success" },
              { label: "Sem arquivo", value: data.documentacao?.documentos_sem_arquivo, color: "text-warning" },
              { label: "Validados", value: data.documentacao?.documentos_validados, color: "text-primary" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-muted p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={`text-lg font-black ${color}`}>{value ?? 0}</p>
              </div>
            ))}
          </div>
          {/* Barra de cobertura */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Cobertura documental</span>
              <span className="font-bold">{data.documentacao?.percentual_cobertura ?? 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (data.documentacao?.percentual_cobertura ?? 0) >= 80 ? "bg-success" :
                  (data.documentacao?.percentual_cobertura ?? 0) >= 50 ? "bg-warning" : "bg-destructive"
                }`}
                style={{ width: `${data.documentacao?.percentual_cobertura ?? 0}%` }}
              />
            </div>
          </div>
          {docLista.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-36 overflow-y-auto pr-1">
              {docLista.map((d, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted">
                  {d.tem_arquivo ? (
                    <CheckCheck className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                  )}
                  <span className="text-xs text-foreground truncate">{d.tipo}</span>
                </div>
              ))}
            </div>
          )}
          {onNavegar && (
            <button onClick={() => onNavegar("documentos")} className="text-xs text-primary hover:underline font-semibold flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Abrir Acervo Documental
            </button>
          )}
        </div>
      </Accordion>

      {/* ── Simulações ── */}
      {simulacoes.length > 0 && (
        <Accordion title={`Simulações de Referência (${simulacoes.length})`} icon={TrendingUp} badge={simulacoes.length} badgeColor="bg-primary/20 text-primary">
          <div className="space-y-2 pt-2">
            {simulacoes.slice(0, 4).map((s, i) => (
              <div key={s?.id ?? i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{s?.produto || "Produto não informado"}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtBRL(s?.valor_solicitado)} · {s?.prazo_meses ? `${s.prazo_meses} meses` : "—"}</p>
                </div>
                {s?.status && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold shrink-0">{s.status}</span>
                )}
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* ── Parecer Técnico ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Parecer Técnico</h4>
          </div>
          <button
            onClick={copiarParecer}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/20 bg-card text-xs font-semibold text-primary hover:bg-primary/10 transition-all"
          >
            {parecerCopiado ? <CheckCheck className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            {parecerCopiado ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{data.parecerTecnico}</p>
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          Proposta sujeita à análise bancária e critérios da instituição financeira parceira. Não constitui garantia ou promessa de aprovação de crédito.
        </p>
      </div>

      {/* ── Próximos Passos ── */}
      {proximosPassos.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-bold text-foreground">Próximos Passos</h4>
          </div>
          <ol className="space-y-2">
            {proximosPassos.map((passo, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {passo}
              </li>
            ))}
          </ol>
        </div>
      )}

    </div>
  );
}
