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
    bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800",
    icon: CheckCircle2,
  },
  abaixo_referencia: {
    label: "Abaixo da referência",
    bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800",
    icon: TrendingDown,
  },
  abaixo_piso: {
    label: "Abaixo do piso mínimo",
    bg: "bg-red-50", border: "border-red-200", text: "text-red-800",
    icon: TrendingDown,
  },
  acima_teto: {
    label: "Acima do teto",
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800",
    icon: TrendingUp,
  },
  critico: {
    label: "Crítico — Risco COAF",
    bg: "bg-red-100", border: "border-red-400", text: "text-red-900",
    icon: AlertTriangle,
  },
};

const ALERT_COLORS: Record<NivelAlerta, { bg: string; border: string; text: string; badge: string }> = {
  verde:          { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700" },
  amarelo_baixo:  { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   badge: "bg-amber-100 text-amber-700"   },
  amarelo_alto:   { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-800",  badge: "bg-orange-100 text-orange-700" },
  vermelho_baixo: { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-800",     badge: "bg-red-100 text-red-700"      },
  vermelho_alto:  { bg: "bg-red-50",     border: "border-red-300",     text: "text-red-900",     badge: "bg-red-200 text-red-800"      },
  critico:        { bg: "bg-red-100",    border: "border-red-500",     text: "text-red-900",     badge: "bg-red-500 text-white"        },
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

  let barColor = "bg-emerald-500";
  if (total > ceiling * 1.5) barColor = "bg-red-600";
  else if (total > ceiling)  barColor = "bg-orange-500";
  else if (total < floor)    barColor = "bg-red-400";
  else if (total < reference) barColor = "bg-amber-400";

  return (
    <div className="space-y-2">
      <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
        {/* Faixa OK (floor → ceiling) */}
        <div
          className="absolute top-0 h-full bg-emerald-100 border-x border-emerald-300"
          style={{ left: `${floorPct}%`, width: `${ceilPct - floorPct}%` }}
        />
        {/* Barra total */}
        <div
          className={`absolute top-0 left-0 h-full ${barColor} transition-all duration-500 rounded-full`}
          style={{ width: `${totalPct}%` }}
        />
        {/* Marcadores */}
        {[
          { pct: floorPct, color: "bg-amber-500", label: "Piso" },
          { pct: refPct,   color: "bg-blue-500",  label: "Ref" },
          { pct: ceilPct,  color: "bg-red-500",   label: "Teto" },
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
      <div className="flex justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Piso {brl(floor)}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>Ref {brl(reference)}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
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
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
        <Target className="w-4 h-4" />
        Compensação — Achatamento da Curva
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white rounded-lg p-2.5 border border-blue-100">
          <p className="text-gray-500 mb-0.5">Acumulado no mês</p>
          <p className="font-bold text-gray-900">{brl(comp.accumulated_this_month)}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-blue-100">
          <p className="text-gray-500 mb-0.5">Teto mensal</p>
          <p className="font-bold text-gray-900">{brl(comp.monthly_ceiling)}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-blue-100">
          <p className="text-gray-500 mb-0.5">Disponível (semanas rest.)</p>
          <p className="font-bold text-emerald-700">{brl(comp.available_for_remaining_weeks)}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-blue-100">
          <p className="text-gray-500 mb-0.5">Semanas restantes</p>
          <p className="font-bold text-gray-900">{comp.remaining_weeks_in_month}</p>
        </div>
      </div>

      {/* Barra de uso mensal */}
      <div>
        <div className="flex justify-between text-xs text-blue-700 mb-1">
          <span>Uso do teto mensal</span>
          <span className="font-bold">{pct(pctUsado)}</span>
        </div>
        <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pctUsado > 100 ? "bg-red-500" : pctUsado > 85 ? "bg-orange-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(100, pctUsado)}%` }}
          />
        </div>
      </div>

      {comp.remaining_weeks_in_month > 0 && (
        <div className="flex items-center gap-2 bg-white rounded-lg p-2.5 border border-blue-200">
          <ArrowRight className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="text-xs">
            <span className="text-gray-600">Nova meta semanal: </span>
            <span className="font-bold text-blue-800">{brl(comp.new_weekly_target)}</span>
            <span className="text-gray-400"> / </span>
            <span className="text-gray-600">Teto: </span>
            <span className="font-bold text-orange-700">{brl(comp.new_weekly_ceiling)}</span>
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

  const cls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  return (
    <div className="space-y-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
        Entrada Manual de Dados
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Início da semana</label>
          <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Margem operacional (%)</label>
          <input type="number" min={0} max={100} value={margin} onChange={e => setMargin(e.target.value)} className={cls} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CANAIS.map(({ key, label }) => (
          <div key={key}>
            <label className="text-xs text-gray-600 mb-1 block">{label} (R$)</label>
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
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm">
        <span className="text-gray-500">Total da semana (prévia)</span>
        <span className="font-bold text-gray-900">{brl(totalPreview)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Acumulado mês anterior (R$)</label>
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
          <label className="text-xs text-gray-600 mb-1 block">Acumulado ano anterior (R$)</label>
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
        <label className="text-xs text-gray-600 mb-1 block">Índice de sazonalidade manual (opcional, 0.5–2.0)</label>
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
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B3A8C] text-white text-sm font-bold rounded-lg hover:bg-[#142d6e] disabled:opacity-50 transition-colors"
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
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-base leading-tight">
              Monitor Semanal Inteligente
            </h2>
            {resultado && (
              <p className="text-xs text-gray-500">{resultado.week_id} · {resultado.week_start}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!manualMode && (
            <button
              onClick={carregarAutomatico}
              disabled={loading}
              className="p-1.5 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
              title="Recarregar análise"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* LOADING sem resultado */}
      {loading && !resultado && (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
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
                <p className="text-xs text-gray-500">Total da semana</p>
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
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Sazonalidade aplicada: ×{resultado.corridors.seasonal_index.toFixed(2)}
              </p>
            )}
          </div>

          {/* MÉTRICAS RÁPIDAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Referência semanal", value: brl(resultado.corridors.reference_weekly), color: "text-blue-700" },
              { label: "Teto semanal",        value: brl(resultado.corridors.ceiling_weekly),  color: "text-orange-700" },
              { label: "Acumulado mês",        value: brl(resultado.accumulated.month),         color: "text-gray-900" },
              { label: "Acumulado ano",        value: brl(resultado.accumulated.year),          color: "text-gray-900" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 px-3 py-3 text-center">
                <p className="text-xs text-gray-500 mb-1 leading-tight">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ALERTAS */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Alertas</p>
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
              ? "border-emerald-200 bg-emerald-50"
              : resultado.projection.percent_of_limit > 105
              ? "border-orange-200 bg-orange-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <BarChart3 className="w-4 h-4" />
              Projeção de Fechamento Mensal
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs mb-3">
              <div className="text-center">
                <p className="text-gray-500 mb-0.5">Projeção</p>
                <p className="font-bold text-gray-900">{brl(resultado.projection.monthly_estimated)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 mb-0.5">Teto mensal</p>
                <p className="font-bold text-orange-700">{brl(resultado.projection.monthly_limit)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 mb-0.5">Uso do teto</p>
                <p className={`font-bold ${resultado.projection.percent_of_limit > 100 ? "text-red-700" : "text-gray-900"}`}>
                  {pct(resultado.projection.percent_of_limit)}
                </p>
              </div>
            </div>

            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  resultado.projection.percent_of_limit > 100
                    ? "bg-red-500"
                    : resultado.projection.percent_of_limit > 85
                    ? "bg-orange-500"
                    : resultado.projection.on_track
                    ? "bg-emerald-500"
                    : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, resultado.projection.percent_of_limit)}%` }}
              />
            </div>
          </div>

          {/* BREAKDOWN POR CANAL */}
          {canalEntries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
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
                        <span className="text-xs text-gray-600 w-20 flex-shrink-0">{labels[canal] ?? canal}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${parcela}%`,
                              backgroundColor: CORES[idx % CORES.length],
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-24 text-right flex-shrink-0">
                          {brl(valor)} <span className="text-gray-400 font-normal">({pct(parcela)})</span>
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
