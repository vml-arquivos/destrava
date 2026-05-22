import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Clock, RefreshCw, Target, Thermometer, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ETAPAS_FUNIL_LABELS, type EtapaFunil } from "@shared/funnel";

interface LeadFila {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  produto_interesse?: string;
  valor_solicitado?: number;
  etapa_funil: string;
  temperatura?: string;
  score_ia?: number;
  proximo_followup?: string;
  responsavel_id?: string | null;
  responsavel_nome?: string;
  chatwoot_conv_id?: number | null;
  ultima_conversa?: string | null;
  status_conversa?: string | null;
  created_at: string;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDataHora = (value?: string) => value
  ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  : "Sem follow-up";

const TEMP_BADGE: Record<string, string> = {
  frio: "bg-sky-100 text-sky-700 border-sky-200",
  morno: "bg-amber-100 text-amber-700 border-amber-200",
  quente: "bg-orange-100 text-orange-700 border-orange-200",
  urgente: "bg-red-100 text-red-700 border-red-200",
};

function getScopeFromUrl(podeVerTudo: boolean): "meus" | "sem_responsavel" | "todos" {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get("scope");
  if (scope === "meus") return "meus";
  if (podeVerTudo && scope === "sem_responsavel") return "sem_responsavel";
  return podeVerTudo ? "todos" : "meus";
}

export default function Fila() {
  const { colaborador } = useAuth();
  const podeVerTudo = Boolean(colaborador?.pode_ver_todos_leads || colaborador?.permissoes?.podeVerTudo);
  const [scope, setScope] = useState<"meus" | "sem_responsavel" | "todos">(() => getScopeFromUrl(podeVerTudo));
  const [leads, setLeads] = useState<LeadFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setScope(getScopeFromUrl(podeVerTudo));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [podeVerTudo]);

  useEffect(() => {
    const scopeNormalizado = getScopeFromUrl(podeVerTudo);
    if (scope !== scopeNormalizado) setScope(scopeNormalizado);
  }, [podeVerTudo, scope]);

  const carregarFila = useCallback(async () => {
    setLoading(true);
    try {
      const query = scope === "todos" ? "" : `?scope=${scope}`;
      const data = await apiFetch(`/api/leads/fila${query}`);
      // Após carregar os leads, não apenas armazenamos; a ordenação é feita separadamente via leadsOrdenados.
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar fila operacional.");
      setLeads([]);
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    carregarFila();
  }, [carregarFila]);

  async function assumirLead(leadId: string) {
    if (!colaborador?.id) {
      toast.error("Usuário autenticado inválido.");
      return;
    }

    setSavingId(leadId);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ responsavel_id: colaborador.id }),
      });
      toast.success("Lead atribuído com sucesso.");
      carregarFila();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível assumir este lead.");
    }
    setSavingId(null);
  }

  const metricas = useMemo(() => {
  const semResponsavel = leads.filter((lead) => !lead.responsavel_id).length;
  const comFollowupAtrasado = leads.filter(
    (lead) => lead.proximo_followup && new Date(lead.proximo_followup) < new Date()
  ).length;
  const quentes = leads.filter((lead) => ["quente", "urgente"].includes(lead.temperatura || "")).length;

  return {
    total: leads.length,
    semResponsavel,
    comFollowupAtrasado,
    quentes,
  };
}, [leads]);

  // Peso da temperatura para ordenação. Valores maiores têm maior prioridade.
  const TEMPERATURA_WEIGHT: Record<string, number> = {
    urgente: 4,
    quente: 3,
    morno: 2,
    frio: 1,
  };

  // Ordena os leads pela temperatura (decrescente) e, em seguida, pelo próximo follow‑up (crescente). Leads sem follow‑up vão para o fim.
  const leadsOrdenados = useMemo(() => {
    return [...leads].sort((a, b) => {
      const wA = TEMPERATURA_WEIGHT[a.temperatura || ""] || 0;
      const wB = TEMPERATURA_WEIGHT[b.temperatura || ""] || 0;
      if (wB !== wA) return wB - wA;
      const fA = a.proximo_followup ? new Date(a.proximo_followup).getTime() : Number.MAX_SAFE_INTEGER;
      const fB = b.proximo_followup ? new Date(b.proximo_followup).getTime() : Number.MAX_SAFE_INTEGER;
      return fA - fB;
    });
  }, [leads]);

  const titulo = scope === "meus"
    ? "Minha Fila"
    : scope === "sem_responsavel"
      ? "Leads sem Responsável"
      : "Fila Operacional";

  const descricao = scope === "meus"
    ? "Lista priorizada da sua atuação operacional atual."
    : scope === "sem_responsavel"
      ? "Leads ativos ainda não atribuídos a um responsável."
      : "Lista priorizada de leads ativos, ordenada por score, follow-up e antiguidade.";

  return (
    <Layout title={titulo}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Cabeçalho omitido */}
        {/* Métricas omitidas */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 px-6 text-center">
            <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">Nenhum lead disponível no recorte atual.</p>
            <p className="text-sm text-gray-400 mt-1">Os leads ativos aparecerão aqui conforme entram no pipeline.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leadsOrdenados.map((lead, index) => {
              const badgeTemp = TEMP_BADGE[lead.temperatura || ""] || "bg-gray-100 text-gray-700 border-gray-200";
              const atrasado = Boolean(lead.proximo_followup && new Date(lead.proximo_followup) < new Date());
              return (
                <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                  {/* Conteúdo do card omitido para brevidade */}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
