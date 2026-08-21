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
    className: "bg-destructive/10 text-destructive border-destructive/30",
    dotClass: "bg-destructive",
    icon: XCircle,
  },
  alto: {
    label: "Alto",
    className: "bg-warning/10 text-warning border-warning/30",
    dotClass: "bg-warning",
    icon: AlertTriangle,
  },
  medio: {
    label: "Médio",
    className: "bg-secondary/30 text-secondary-foreground border-secondary/50",
    dotClass: "bg-secondary",
    icon: Info,
  },
  baixo: {
    label: "Baixo",
    className: "bg-success/10 text-success border-success/30",
    dotClass: "bg-success",
    icon: CheckCircle2,
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  incompleto: { label: "Incompleto", className: "bg-destructive/10 text-destructive border-destructive/30" },
  basico:     { label: "Básico",     className: "bg-warning/10 text-warning border-warning/30" },
  completo:   { label: "Completo",   className: "bg-primary/10 text-primary border-primary/30" },
  verificado: { label: "Verificado", className: "bg-success/10 text-success border-success/30" },
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
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-secondary-foreground";
  if (score >= 25) return "text-warning";
  return "text-destructive";
}

function barColor(score: number): string {
  if (score >= 75) return "bg-success";
  if (score >= 50) return "bg-secondary";
  if (score >= 25) return "bg-warning";
  return "bg-destructive";
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
