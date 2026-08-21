/**
 * WeeklyMonitorDashboard.tsx
 * Dashboard de Inteligência do Acompanhamento Semanal — Destrava Crédito
 *
 * Posição no projeto:
 *   client/src/components/faturamento/WeeklyMonitorDashboard.tsx
 *
 * Uso (ex: dentro de AcompanhamentoBancario.tsx, ao abrir uma semana):
 *   <WeeklyMonitorDashboard
 *     acompanhamentoId={acomp.id}
 *     numeroSemana={semana.numero_semana}
 *     faturamentoAnual={acomp.faturamento_anual}
 *     onClose={() => setShowMonitor(false)}
 *   />
 *
 * Ou modo manual (sem ID do banco):
 *   <WeeklyMonitorDashboard
 *     faturamentoAnual={1200000}
 *     manualMode
 *   />
 */

import { useState, useMemo, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, TrendingDown, TrendingUp,
  Activity, BarChart3, Target, ChevronDown, ChevronUp,
  RefreshCw, X, Info, Zap, ArrowRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { maskCurrencyInput, unmaskCurrencyInput } from "@/lib/currency";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS (espelho de analisadorSemanal.ts)
// ─────────────────────────────────────────────────────────────────────────────

type NivelAlerta =
  | "verde" | "amarelo_baixo" | "amarelo_alto"
  | "vermelho_baixo" | "vermelho_alto" | "critico";

type StatusSemana =
  | "dentro_da_faixa" | "abaixo_referencia" | "abaixo_piso"
  | "acima_teto" | "critico";

interface CanaisEntrada {
  maquininha?: number;
  pix?: number;
  ted?: number;
  boleto?: number;
  dinheiro?: number;
  outros?: number;
}

interface InfoCompensacao {
  remaining_weeks_in_month: number;
  monthly_ceiling: number;
  accumulated_this_month: number;
  available_for_remaining_weeks: number;
  new_weekly_target: number;
  new_weekly_ceiling: number;
}

interface Alerta {
  level: NivelAlerta;
  message: string;
  technical_detail: string;
  compensation?: InfoCompensacao;
}

interface CorredorSemanal {
  reference_weekly: number;
  ceiling_weekly: number;
  floor_weekly: number;
  seasonal_index: number;
}

interface ProjecaoMensal {
  monthly_estimated: number;
  monthly_limit: number;
  percent_of_limit: number;
  on_track: boolean;
}

interface ResultadoAnalise {
  week_id: string;
  week_start: string;
  total_week: number;
  corridors: CorredorSemanal;
  status: StatusSemana;
  alerts: Alerta[];
  compensation: InfoCompensacao | null;
  projection: ProjecaoMensal;
  breakdown: Record<string, number>;
  accumulated: { month: number; year: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** ID do acompanhamento_bancario (modo automático) */
  acompanhamentoId?: string;
  /** Número da semana (modo automático) */
  numeroSemana?: number;
  /** Faturamento anual declarado */
  faturamentoAnual: number;
  /** Modo manual — usuário preenche os dados nos inputs */
  manualMode?: boolean;
  /** Mostra como modal/overlay — exibe botão fechar */
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  (isNaN(v) ? 0 : v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v: number) =>
  `${(isNaN(v) ? 0 : v).toFixed(1).replace(".", ",")}%`;

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG DE STATUS/ALERTA → UI
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusSemana, {
  label: string; bg: string; border: string; text: string; icon: React.ElementType;
}> = {
  dentro_da_faixa: {
    label: "Dentro da faixa",
    bg: "bg-success/10", border: "border-success/20", text: "text-success",
    icon: CheckCircle2,
  },
  abaixo_referencia: {
    label: "Abaixo da referência",
    bg: "bg-warning/10", border: "border-warning/20", text: "text-warning",
    icon: TrendingDown,
  },
  abaixo_piso: {
    label: "Abaixo do piso mínimo",
    bg: "bg-destructive/10", border: "border-destructive/20", text: "text-destructive",
    icon: TrendingDown,
  },
  acima_teto: {
    label: "Acima do teto",
    bg: "bg-warning/10", border: "border-warning/20", text: "text-warning",
    icon: TrendingUp,
  },
  critico: {
    label: "Crítico — Risco COAF",
    bg: "bg-destructive/20", border: "border-red-400", text: "text-destructive",
    icon: AlertTriangle,
  },
};

const ALERT_COLORS: Record<NivelAlerta, { bg: string; border: string; text: string; badge: string }> = {
  verde:          { bg: "bg-success/10", border: "border-success/20", text: "text-success", badge: "bg-success/20 text-success" },
  amarelo_baixo:  { bg: "bg-warning/10",   border: "border-warning/20",   text: "text-warning",   badge: "bg-warning/20 text-warning"   },
  amarelo_alto:   { bg: "bg-warning/10",  border: "border-warning/20",  text: "text-warning",  badge: "bg-warning/20 text-warning" },
  vermelho_baixo: { bg: "bg-destructive/10",     border: "border-destructive/20",     text: "text-destructive",     badge: "bg-destructive/20 text-destructive"      },
  vermelho_alto:  { bg: "bg-destructive/10",     border: "border-destructive/30",     text: "text-destructive",     badge: "bg-red-200 text-destructive"      },
  critico:        { bg: "bg-destructive/20",    border: "border-red-500",     text: "text-destructive",     badge: "bg-destructive text-primary-foreground"        },
};

const ALERT_LABELS: Record<NivelAlerta, string> = {
  verde:          "OK",
  amarelo_baixo:  "Atenção",
  amarelo_alto:   "Alerta",
  vermelho_baixo: "Risco",
  vermelho_alto:  "Risco Alto",
  critico:        "CRÍTICO",
};

// ─────────────────────────────────────────────────────────────────────────────
// BARRA DE PROGRESSO
// ─────────────────────────────────────────────────────────────────────────────

function BarraCorredor({
  total,
  floor,
  reference,
  ceiling,
}: {
  total: number;
  floor: number;
  reference: number;
  ceiling: number;
}) {
  const max = Math.max(ceiling * 1.6, total * 1.1, 1);
  const toP = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));

  const totalPct = toP(total);
  const floorPct = toP(floor);
  const refPct   = toP(reference);
  const ceilPct  = toP(ceiling);

  let barColor = "bg-success";
  if (total > ceiling * 1.5) barColor = "bg-destructive";
  else if (total > ceiling)  barColor = "bg-warning";
  else if (total < floor)    barColor = "bg-red-400";
  else if (total < reference) barColor = "bg-amber-400";

  return (
    <div className="space-y-2">
      <div className="relative h-5 bg-muted rounded-full overflow-hidden border border-border">
        {/* Faixa OK (floor → ceiling) */}
        <div
          className="absolute top-0 h-full bg-success/20 border-x border-success/30"
          style={{ left: `${floorPct}%`, width: `${ceilPct - floorPct}%` }}
        />
        {/* Barra total */}
        <div
          className={`absolute top-0 left-0 h-full ${barColor} transition-all duration-500 rounded-full`}
          style={{ width: `${totalPct}%` }}
        />
        {/* Marcadores */}
        {[
          { pct: floorPct, color: "bg-warning/100", label: "Piso" },
          { pct: refPct,   color: "bg-primary",  label: "Ref" },
          { pct: ceilPct,  color: "bg-destructive",   label: "Teto" },
        ].map(({ pct: p, color, label }) => (
          <div
            key={label}
            className={`absolute top-0 w-0.5 h-full ${color} opacity-80`}
            style={{ left: `${p}%` }}
            title={label}
          />
        ))}
      </div>

      {/* Legenda */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-warning/100" />
          <span>Piso {brl(floor)}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span>Ref {brl(reference)}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-destructive" />
          <span>Teto {brl(ceiling)}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE COMPENSAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

function CardCompensacao({ comp }: { comp: InfoCompensacao }) {
  const pctUsado = comp.monthly_ceiling > 0
    ? Math.min(100, (comp.accumulated_this_month / comp.monthly_ceiling) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-primary font-semibold text-sm">
        <Target className="w-4 h-4" />
        Compensação — Achatamento da Curva
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-card rounded-lg p-2.5 border border-primary/20">
          <p className="text-muted-foreground mb-0.5">Acumulado no mês</p>
          <p className="font-bold text-foreground">{brl(comp.accumulated_this_month)}</p>
        </div>
        <div className="bg-card rounded-lg p-2.5 border border-primary/20">
          <p className="text-muted-foreground mb-0.5">Teto mensal</p>
          <p className="font-bold text-foreground">{brl(comp.monthly_ceiling)}</p>
        </div>
        <div className="bg-card rounded-lg p-2.5 border border-primary/20">
          <p className="text-muted-foreground mb-0.5">Disponível (semanas rest.)</p>
          <p className="font-bold text-success">{brl(comp.available_for_remaining_weeks)}</p>
        </div>
        <div className="bg-card rounded-lg p-2.5 border border-primary/20">
          <p className="text-muted-foreground mb-0.5">Semanas restantes</p>
          <p className="font-bold text-foreground">{comp.remaining_weeks_in_month}</p>
        </div>
      </div>

      {/* Barra de uso mensal */}
      <div>
        <div className="flex justify-between text-xs text-primary mb-1">
          <span>Uso do teto mensal</span>
          <span className="font-bold">{pct(pctUsado)}</span>
        </div>
        <div className="h-2.5 bg-primary/20 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pctUsado > 100 ? "bg-destructive" : pctUsado > 85 ? "bg-warning" : "bg-primary"
            }`}
            style={{ width: `${Math.min(100, pctUsado)}%` }}
          />
        </div>
      </div>

      {comp.remaining_weeks_in_month > 0 && (
        <div className="flex items-center gap-2 bg-card rounded-lg p-2.5 border border-primary/20">
          <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="text-xs">
            <span className="text-muted-foreground">Nova meta semanal: </span>
            <span className="font-bold text-primary">{brl(comp.new_weekly_target)}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-muted-foreground">Teto: </span>
            <span className="font-bold text-warning">{brl(comp.new_weekly_ceiling)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMULÁRIO MANUAL
// ─────────────────────────────────────────────────────────────────────────────

function FormManual({
  faturamentoAnual,
  onAnalise,
  loading,
}: {
  faturamentoAnual: number;
  onAnalise: (payload: any) => void;
  loading: boolean;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [weekStart, setWeekStart] = useState(hoje);
  const [prevMonth, setPrevMonth] = useState("0");
  const [prevYear,  setPrevYear]  = useState("0");
  const [channels, setChannels]   = useState<Record<string, string>>({
    maquininha: "", pix: "", ted: "", boleto: "", dinheiro: "", outros: "",
  });
  const [margin, setMargin] = useState("30");
  const [seasonIdx, setSeasonIdx] = useState("");

  // setC aplica máscara automática ao digitar valores nos canais
  const setC = (k: string, v: string) => setChannels(p => ({ ...p, [k]: maskCurrencyInput(v) }));

  const CANAIS = [
    { key: "maquininha", label: "Maquininha" },
    { key: "pix",        label: "PIX" },
    { key: "ted",        label: "TED" },
    { key: "boleto",     label: "Boleto" },
    { key: "dinheiro",   label: "Dinheiro" },
    { key: "outros",     label: "Outros" },
  ];

  const totalPreview = useMemo(() =>
    Object.values(channels).reduce((s, v) => s + unmaskCurrencyInput(v), 0),
    [channels]
  );

  const handleSubmit = () => {
    const ch: Record<string, number> = {};
    for (const [k, v] of Object.entries(channels)) {
      ch[k] = unmaskCurrencyInput(v);
    }
    onAnalise({
      client_id: "manual",
      annual_revenue_declared: faturamentoAnual,
      week_start: weekStart,
      channels: ch,
      previous_accumulated: {
        monthly_total: unmaskCurrencyInput(prevMonth),
        annual_total:  unmaskCurrencyInput(prevYear),
      },
      operational_margin: parseFloat(margin) || 30,
      seasonal_index: seasonIdx ? parseFloat(seasonIdx) : undefined,
      persist: false,
    });
  };

  const cls = "w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  return (
    <div className="space-y-4 bg-muted rounded-xl border border-border p-4">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
        Entrada Manual de Dados
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Início da semana</label>
          <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Margem operacional (%)</label>
          <input type="number" min={0} max={100} value={margin} onChange={e => setMargin(e.target.value)} className={cls} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CANAIS.map(({ key, label }) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground mb-1 block">{label} (R$)</label>
            <input
              type="text"
              inputMode="numeric"
              value={channels[key]}
              onChange={e => setC(key, e.target.value)}
              placeholder="0,00"
              autoComplete="off"
              className={`${cls} text-right font-mono tabular-nums`}
            />
          </div>
        ))}
      </div>

      {/* Prévia do total */}
      <div className="flex items-center justify-between bg-card rounded-lg border border-border px-3 py-2 text-sm">
        <span className="text-muted-foreground">Total da semana (prévia)</span>
        <span className="font-bold text-foreground">{brl(totalPreview)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Acumulado mês anterior (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            value={prevMonth}
            onChange={e => setPrevMonth(maskCurrencyInput(e.target.value))}
            placeholder="0,00"
            autoComplete="off"
            className={`${cls} text-right font-mono tabular-nums`}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Acumulado ano anterior (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            value={prevYear}
            onChange={e => setPrevYear(maskCurrencyInput(e.target.value))}
            placeholder="0,00"
            autoComplete="off"
            className={`${cls} text-right font-mono tabular-nums`}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Índice de sazonalidade manual (opcional, 0.5–2.0)</label>
        <input
          type="number" min={0.5} max={2.0} step={0.05}
          value={seasonIdx}
          onChange={e => setSeasonIdx(e.target.value)}
          placeholder="Ex: 1.25 para Black Friday"
          className={cls}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B3A8C] text-primary-foreground text-sm font-bold rounded-lg hover:bg-[#142d6e] disabled:opacity-50 transition-colors"
      >
        {loading
          ? <><RefreshCw className="w-4 h-4 animate-spin" />Analisando...</>
          : <><Zap className="w-4 h-4" />Analisar Semana</>
        }
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklyMonitorDashboard({
  acompanhamentoId,
  numeroSemana,
  faturamentoAnual,
  manualMode = false,
  onClose,
}: Props) {
  const [resultado, setResultado]   = useState<ResultadoAnalise | null>(null);
  const [loading, setLoading]       = useState(false);
  const [erro, setErro]             = useState<string | null>(null);
  const [detalheAberto, setDetalhe] = useState<number | null>(null);

  // Carrega automaticamente se tiver ID + número de semana
  const carregarAutomatico = useCallback(async () => {
    if (!acompanhamentoId || !numeroSemana) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await apiFetch("/api/weekly-monitor/quick-analyze", {
        method: "POST",
        body: JSON.stringify({ acompanhamento_id: acompanhamentoId, numero_semana: numeroSemana }),
      });
      setResultado(res);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar análise.");
    } finally {
      setLoading(false);
    }
  }, [acompanhamentoId, numeroSemana]);

  // Auto-load on mount
  useState(() => {
    if (!manualMode) void carregarAutomatico();
  });

  const handleManualAnalise = async (payload: any) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await apiFetch("/api/weekly-monitor/analyze", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResultado(res);
    } catch (e: any) {
      setErro(e?.message || "Erro ao analisar semana.");
    } finally {
      setLoading(false);
    }
  };

  const statusCfg = resultado ? STATUS_CONFIG[resultado.status] : null;
  const StatusIcon = statusCfg?.icon ?? Activity;

  // Canais para gráfico de pizza simples
  const canalEntries = resultado
    ? Object.entries(resultado.breakdown).filter(([, v]) => v > 0)
    : [];
  const totalCanais = canalEntries.reduce((s, [, v]) => s + v, 0);
  const CORES = ["#1B3A8C", "#f0a500", "#10b981", "#6366f1", "#f43f5e", "#8b5cf6"];

  return (
    <div className="w-full space-y-4">

      {/* CABEÇALHO */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#1B3A8C] rounded-lg">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-foreground text-base leading-tight">
              Monitor Semanal Inteligente
            </h2>
            {resultado && (
              <p className="text-xs text-muted-foreground">{resultado.week_id} · {resultado.week_start}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!manualMode && (
            <button
              onClick={carregarAutomatico}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
              title="Recarregar análise"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* FORMULÁRIO MANUAL */}
      {manualMode && (
        <FormManual
          faturamentoAnual={faturamentoAnual}
          onAnalise={handleManualAnalise}
          loading={loading}
        />
      )}

      {/* ERRO */}
      {erro && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* LOADING sem resultado */}
      {loading && !resultado && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Analisando dados da semana...
        </div>
      )}

      {/* RESULTADO */}
      {resultado && statusCfg && (
        <div className="space-y-4">

          {/* STATUS PRINCIPAL */}
          <div className={`rounded-xl border-2 ${statusCfg.bg} ${statusCfg.border} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`flex items-center gap-2 ${statusCfg.text} font-bold text-sm`}>
                <StatusIcon className="w-5 h-5" />
                {statusCfg.label}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total da semana</p>
                <p className={`text-xl font-bold ${statusCfg.text}`}>{brl(resultado.total_week)}</p>
              </div>
            </div>

            <BarraCorredor
              total={resultado.total_week}
              floor={resultado.corridors.floor_weekly}
              reference={resultado.corridors.reference_weekly}
              ceiling={resultado.corridors.ceiling_weekly}
            />

            {resultado.corridors.seasonal_index !== 1.0 && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Sazonalidade aplicada: ×{resultado.corridors.seasonal_index.toFixed(2)}
              </p>
            )}
          </div>

          {/* MÉTRICAS RÁPIDAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Referência semanal", value: brl(resultado.corridors.reference_weekly), color: "text-primary" },
              { label: "Teto semanal",        value: brl(resultado.corridors.ceiling_weekly),  color: "text-warning" },
              { label: "Acumulado mês",        value: brl(resultado.accumulated.month),         color: "text-foreground" },
              { label: "Acumulado ano",        value: brl(resultado.accumulated.year),          color: "text-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card rounded-xl border border-border px-3 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1 leading-tight">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ALERTAS */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Alertas</p>
            {resultado.alerts.map((alerta, i) => {
              const cfg = ALERT_COLORS[alerta.level];
              const aberto = detalheAberto === i;
              return (
                <div key={i} className={`rounded-xl border ${cfg.bg} ${cfg.border} overflow-hidden`}>
                  <div
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${cfg.text}`}
                    onClick={() => setDetalhe(aberto ? null : i)}
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.badge}`}>
                          {ALERT_LABELS[alerta.level]}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-snug">{alerta.message}</p>
                    </div>
                    {aberto ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  </div>

                  {aberto && (
                    <div className="px-4 pb-4 space-y-3 border-t border-current/10">
                      <p className="text-xs text-current/70 mt-3">{alerta.technical_detail}</p>
                      {alerta.compensation && (
                        <CardCompensacao comp={alerta.compensation} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* COMPENSAÇÃO PRINCIPAL */}
          {resultado.compensation && (
            <CardCompensacao comp={resultado.compensation} />
          )}

          {/* PROJEÇÃO MENSAL */}
          <div className={`rounded-xl border p-4 ${
            resultado.projection.on_track
              ? "border-success/20 bg-success/10"
              : resultado.projection.percent_of_limit > 105
              ? "border-warning/20 bg-warning/10"
              : "border-warning/20 bg-warning/10"
          }`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
              <BarChart3 className="w-4 h-4" />
              Projeção de Fechamento Mensal
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs mb-3">
              <div className="text-center">
                <p className="text-muted-foreground mb-0.5">Projeção</p>
                <p className="font-bold text-foreground">{brl(resultado.projection.monthly_estimated)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground mb-0.5">Teto mensal</p>
                <p className="font-bold text-warning">{brl(resultado.projection.monthly_limit)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground mb-0.5">Uso do teto</p>
                <p className={`font-bold ${resultado.projection.percent_of_limit > 100 ? "text-destructive" : "text-foreground"}`}>
                  {pct(resultado.projection.percent_of_limit)}
                </p>
              </div>
            </div>

            <div className="h-2.5 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  resultado.projection.percent_of_limit > 100
                    ? "bg-destructive"
                    : resultado.projection.percent_of_limit > 85
                    ? "bg-warning"
                    : resultado.projection.on_track
                    ? "bg-success"
                    : "bg-warning/100"
                }`}
                style={{ width: `${Math.min(100, resultado.projection.percent_of_limit)}%` }}
              />
            </div>
          </div>

          {/* BREAKDOWN POR CANAL */}
          {canalEntries.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
                Composição por Canal
              </p>
              <div className="space-y-2">
                {canalEntries
                  .sort(([, a], [, b]) => b - a)
                  .map(([canal, valor], idx) => {
                    const parcela = totalCanais > 0 ? (valor / totalCanais) * 100 : 0;
                    const labels: Record<string, string> = {
                      maquininha: "Maquininha", pix: "PIX", ted: "TED",
                      boleto: "Boleto", dinheiro: "Dinheiro", outros: "Outros",
                    };
                    return (
                      <div key={canal} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{labels[canal] ?? canal}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${parcela}%`,
                              backgroundColor: CORES[idx % CORES.length],
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-foreground w-24 text-right flex-shrink-0">
                          {brl(valor)} <span className="text-muted-foreground font-normal">({pct(parcela)})</span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
