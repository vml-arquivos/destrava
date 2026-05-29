/**
 * states.tsx — Componentes reutilizáveis para estados da interface:
 *   - EmptyState   : lista vazia
 *   - ErrorState   : erro de carregamento
 *   - LoadingState : carregamento em andamento
 *
 * Uso:
 *   import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Inbox,
  FileSearch,
  Users,
  FileText,
  Building2,
  LucideIcon,
} from "lucide-react";

// ─── LoadingState ─────────────────────────────────────────────────────────────

interface LoadingStateProps {
  /** Mensagem exibida abaixo do spinner. Padrão: "Carregando…" */
  message?: string;
  /** Tamanho do spinner. Padrão: "md" */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingState({
  message = "Carregando…",
  size = "md",
  className,
}: LoadingStateProps) {
  const spinnerSize = { sm: "h-5 w-5", md: "h-8 w-8", lg: "h-12 w-12" }[size];
  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];

  return (
    <div
      role="status"
      aria-label={message}
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground",
        className
      )}
    >
      <Loader2 className={cn(spinnerSize, "animate-spin text-primary")} />
      <p className={cn(textSize, "font-medium")}>{message}</p>
    </div>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  /** Título do erro. Padrão: "Ocorreu um problema" */
  title?: string;
  /** Descrição detalhada do erro. */
  description?: string;
  /** Callback para tentar novamente. */
  onRetry?: () => void;
  /** Texto do botão de retry. Padrão: "Tentar novamente" */
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Ocorreu um problema",
  description = "Não foi possível carregar os dados. Verifique sua conexão e tente novamente.",
  onRetry,
  retryLabel = "Tentar novamente",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12 text-center",
        className
      )}
    >
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10">
        <AlertCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

type EmptyStatePreset =
  | "default"
  | "leads"
  | "contratos"
  | "empresas"
  | "usuarios"
  | "documentos"
  | "busca";

const PRESET_CONFIG: Record<
  EmptyStatePreset,
  { icon: LucideIcon; title: string; description: string }
> = {
  default: {
    icon: Inbox,
    title: "Nenhum item encontrado",
    description: "Não há itens para exibir no momento.",
  },
  leads: {
    icon: Users,
    title: "Nenhum lead cadastrado",
    description: "Adicione seu primeiro lead para começar a acompanhar oportunidades.",
  },
  contratos: {
    icon: FileText,
    title: "Nenhum contrato cadastrado",
    description: "Gere seu primeiro contrato a partir de um lead ou empresa.",
  },
  empresas: {
    icon: Building2,
    title: "Nenhuma empresa cadastrada",
    description: "Adicione empresas para gerenciar propostas e contratos.",
  },
  usuarios: {
    icon: Users,
    title: "Nenhum usuário cadastrado",
    description: "Convide membros da equipe para colaborar no sistema.",
  },
  documentos: {
    icon: FileText,
    title: "Nenhum documento enviado",
    description: "Faça upload de documentos para organizar o processo.",
  },
  busca: {
    icon: FileSearch,
    title: "Nenhum resultado encontrado",
    description: "Tente ajustar os filtros ou termos de busca.",
  },
};

interface EmptyStateProps {
  /** Preset de ícone e texto. Padrão: "default" */
  preset?: EmptyStatePreset;
  /** Substitui o título do preset */
  title?: string;
  /** Substitui a descrição do preset */
  description?: string;
  /** Ícone customizado (substitui o do preset) */
  icon?: LucideIcon;
  /** Ação principal (botão) */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  preset = "default",
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  const config = PRESET_CONFIG[preset];
  const Icon = icon ?? config.icon;
  const displayTitle = title ?? config.title;
  const displayDescription = description ?? config.description;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 text-center",
        className
      )}
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <p className="font-semibold text-foreground text-base">{displayTitle}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{displayDescription}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
