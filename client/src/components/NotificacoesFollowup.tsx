import { useState, useEffect, useRef } from "react";
import { Bell, Clock, AlertTriangle, CheckCircle2, X, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface Lead {
  id: string;
  nome_completo?: string;
  nome?: string;
  etapa_funil?: string;
  proximo_followup?: string;
  temperatura?: string;
}

function formatarDataRelativa(dataStr: string): string {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffD > 1) return `${diffD} dias atrás`;
  if (diffD === 1) return "ontem";
  if (diffH > 0) return `${diffH}h atrás`;
  if (diffMin > 0) return `${diffMin}min atrás`;
  return "agora";
}

export default function NotificacoesFollowup() {
  const [aberto, setAberto] = useState(false);
  const [atrasados, setAtrasados] = useState<Lead[]>([]);
  const [hoje, setHoje] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const total = atrasados.length + hoje.length;

  async function carregar() {
    setCarregando(true);
    try {
      const [resAtrasados, resHoje] = await Promise.all([
        fetch("/api/leads/atrasados", { credentials: "include" }),
        fetch("/api/leads/hoje", { credentials: "include" }),
      ]);
      if (resAtrasados.ok) setAtrasados(await resAtrasados.json());
      if (resHoje.ok) setHoje(await resHoje.json());
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    const interval = setInterval(carregar, 5 * 60 * 1000); // a cada 5 min
    return () => clearInterval(interval);
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    if (aberto) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [aberto]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setAberto(!aberto); if (!aberto) carregar(); }}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Follow-ups pendentes"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Follow-ups</span>
              {total > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  {total}
                </Badge>
              )}
            </div>
            <button onClick={() => setAberto(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conteúdo */}
          <div className="max-h-80 overflow-y-auto">
            {carregando && (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                Carregando...
              </div>
            )}

            {!carregando && total === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                <p className="text-sm font-medium">Tudo em dia!</p>
                <p className="text-xs">Nenhum follow-up pendente.</p>
              </div>
            )}

            {/* Atrasados */}
            {atrasados.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border-b">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-700">
                    Atrasados ({atrasados.length})
                  </span>
                </div>
                {atrasados.slice(0, 5).map((lead) => (
                  <Link key={lead.id} href={`/colaborador/crm?lead=${lead.id}`}>
                    <a
                      className="flex items-start gap-3 px-4 py-3 hover:bg-red-50 border-b border-gray-100 cursor-pointer transition-colors"
                      onClick={() => setAberto(false)}
                    >
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {lead.nome_completo || lead.nome || "Lead sem nome"}
                        </p>
                        <p className="text-xs text-red-600">
                          {lead.proximo_followup ? formatarDataRelativa(lead.proximo_followup) : ""}
                          {lead.etapa_funil ? ` · ${lead.etapa_funil}` : ""}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    </a>
                  </Link>
                ))}
                {atrasados.length > 5 && (
                  <p className="px-4 py-2 text-xs text-muted-foreground text-center">
                    +{atrasados.length - 5} mais atrasados
                  </p>
                )}
              </div>
            )}

            {/* Hoje */}
            {hoje.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border-b">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700">
                    Para hoje ({hoje.length})
                  </span>
                </div>
                {hoje.slice(0, 5).map((lead) => (
                  <Link key={lead.id} href={`/colaborador/crm?lead=${lead.id}`}>
                    <a
                      className="flex items-start gap-3 px-4 py-3 hover:bg-amber-50 border-b border-gray-100 cursor-pointer transition-colors"
                      onClick={() => setAberto(false)}
                    >
                      <Clock className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {lead.nome_completo || lead.nome || "Lead sem nome"}
                        </p>
                        <p className="text-xs text-amber-600">
                          {lead.proximo_followup
                            ? new Date(lead.proximo_followup).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                            : ""}
                          {lead.etapa_funil ? ` · ${lead.etapa_funil}` : ""}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    </a>
                  </Link>
                ))}
                {hoje.length > 5 && (
                  <p className="px-4 py-2 text-xs text-muted-foreground text-center">
                    +{hoje.length - 5} mais para hoje
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {total > 0 && (
            <div className="px-4 py-3 border-t bg-gray-50">
              <Link href="/colaborador/crm">
                <a
                  className="text-xs text-primary font-medium hover:underline"
                  onClick={() => setAberto(false)}
                >
                  Ver todos no Funil Comercial →
                </a>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
