import { useState, useEffect, useRef } from "react";
import { Zap, AlertTriangle, Clock, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AlertaAutomacao {
  id: string;
  tarefa_id: string;
  empresa_id: string | null;
  empresa_nome: string | null;
  workflow_tipo: string | null;
  tier: string;
  titulo: string;
  prazo: string | null;
  criado_em: string;
}

const LABEL_WORKFLOW: Record<string, string> = {
  rotina_cnd: "Rotina CND",
  rotina_cemprot: "Rotina CEMPROT",
  acompanhamento_bancario: "Acompanhamento Bancário",
};

function corTier(tier: string): string {
  if (tier === "atrasado") return "text-red-600 bg-red-50 border-red-100";
  if (tier === "hoje") return "text-amber-600 bg-amber-50 border-amber-100";
  return "text-blue-600 bg-blue-50 border-blue-100";
}

/**
 * Sino de alertas do Automation Engine (rotinas CND/CEMPROT e acompanhamento
 * bancário). O tier (7d/3d/1d/hoje/atrasado) é decidido pelo Nexus -- este
 * componente só exibe o que já veio calculado via /api/automation/alertas.
 */
export default function NotificacoesAutomacao() {
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState<AlertaAutomacao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await fetch("/api/automation/alertas", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAlertas(Array.isArray(data?.alertas) ? data.alertas : []);
      }
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    const interval = setInterval(carregar, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [aberto]);

  const total = alertas.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setAberto(!aberto); if (!aberto) carregar(); }}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Alertas de automação (rotinas e acompanhamento bancário)"
      >
        <Zap className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border bg-white shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Automação</span>
              {total > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">{total}</Badge>
              )}
            </div>
            <button onClick={() => setAberto(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {carregando && (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">Carregando...</div>
            )}

            {!carregando && total === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                <p className="text-sm font-medium">Tudo em dia!</p>
                <p className="text-xs">Nenhuma rotina ou acompanhamento pendente.</p>
              </div>
            )}

            {alertas.map((alerta) => (
              <div key={alerta.id} className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 ${corTier(alerta.tier)}`}>
                {alerta.tier === "atrasado" ? <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{alerta.empresa_nome || "Empresa"}</p>
                  <p className="text-xs truncate">{alerta.titulo}</p>
                  {alerta.workflow_tipo && (
                    <p className="text-[10px] text-gray-400">{LABEL_WORKFLOW[alerta.workflow_tipo] || alerta.workflow_tipo}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
