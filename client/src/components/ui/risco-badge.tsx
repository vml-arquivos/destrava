/**
 * risco-badge.tsx — Componentes para exibição de classificação de risco e score.
 *
 * Uso:
 *   import { RiscoBadge, ScoreIndicator, StatusCadastroBadge } from "@/components/ui/risco-badge";
 */

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RiscoClassificacao = "critico" | "alto" | "medio" | "baixo" | null | undefined;
export type StatusCadastro = "incompleto" | "basico" | "completo" | "verificado" | null | undefined;

// ─── Mapa de estilos ──────────────────────────────────────────────────────────

const RISCO_CONFIG: Record<
  string,
  { label: string; className: string; dotClass: string; icon: typeof XCircle }
> = {
  critico: {
    label: "Crítico",
    className: "bg-red-100 text-red-800 border-red-200",
    dotClass: "bg-red-500",
    icon: XCircle,
  },
  alto: {
    label: "Alto",
    className: "bg-orange-100 text-orange-800 border-orange-200",
    dotClass: "bg-orange-500",
    icon: AlertTriangle,
  },
  medio: {
    label: "Médio",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    dotClass: "bg-yellow-500",
    icon: Info,
  },
  baixo: {
    label: "Baixo",
    className: "bg-green-100 text-green-800 border-green-200",
    dotClass: "bg-green-500",
    icon: CheckCircle2,
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  incompleto: { label: "Incompleto", className: "bg-red-50 text-red-700 border-red-200" },
  basico:     { label: "Básico",     className: "bg-orange-50 text-orange-700 border-orange-200" },
  completo:   { label: "Completo",   className: "bg-blue-50 text-blue-700 border-blue-200" },
  verificado: { label: "Verificado", className: "bg-green-50 text-green-700 border-green-200" },
};

// ─── RiscoBadge ───────────────────────────────────────────────────────────────

interface RiscoBadgeProps {
  risco: RiscoClassificacao;
  /** Exibe ícone ao lado do texto. Padrão: true */
  showIcon?: boolean;
  className?: string;
}

export function RiscoBadge({ risco, showIcon = true, className }: RiscoBadgeProps) {
  if (!risco) return null;
  const config = RISCO_CONFIG[risco];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
        config.className,
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {config.label}
    </span>
  );
}

// ─── ScoreIndicator ───────────────────────────────────────────────────────────

interface ScoreIndicatorProps {
  /** Score de 0 a 100 */
  score: number | null | undefined;
  /** Exibe barra de progresso. Padrão: true */
  showBar?: boolean;
  /** Exibe tooltip com descrição. Padrão: true */
  showTooltip?: boolean;
  className?: string;
}

function scoreToRisco(score: number): RiscoClassificacao {
  if (score >= 75) return "baixo";
  if (score >= 50) return "medio";
  if (score >= 25) return "alto";
  return "critico";
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-700";
  if (score >= 50) return "text-yellow-700";
  if (score >= 25) return "text-orange-700";
  return "text-red-700";
}

function barColor(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  if (score >= 25) return "bg-orange-500";
  return "bg-red-500";
}

export function ScoreIndicator({
  score,
  showBar = true,
  showTooltip = true,
  className,
}: ScoreIndicatorProps) {
  if (score === null || score === undefined) {
    return (
      <span className="text-xs text-muted-foreground italic">Sem score</span>
    );
  }

  const risco = scoreToRisco(score);
  const riscoConfig = RISCO_CONFIG[risco!];

  const content = (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("text-sm font-bold tabular-nums", scoreColor(score))}>
        {score}
      </span>
      {showBar && (
        <div
          className="h-1.5 w-16 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Score: ${score} de 100`}
        >
          <div
            className={cn("h-full rounded-full transition-all", barColor(score))}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
      <span
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
          riscoConfig?.className
        )}
      >
        {riscoConfig?.label}
      </span>
    </div>
  );

  if (!showTooltip) return content;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            Score {score}/100 — Risco {riscoConfig?.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {score >= 75
              ? "Lead com alta probabilidade de conversão."
              : score >= 50
              ? "Lead com boa probabilidade de conversão."
              : score >= 25
              ? "Lead requer atenção especial."
              : "Lead com baixa probabilidade. Considere reativação."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── StatusCadastroBadge ──────────────────────────────────────────────────────

interface StatusCadastroBadgeProps {
  status: StatusCadastro;
  className?: string;
}

export function StatusCadastroBadge({ status, className }: StatusCadastroBadgeProps) {
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
