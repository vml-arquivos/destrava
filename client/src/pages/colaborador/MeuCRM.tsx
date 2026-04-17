import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Kanban,
  MessageSquare,
  RefreshCw,
  Save,
  Target,
  Thermometer,
  UserCheck,
} from "lucide-react";
import { ETAPAS_FUNIL_LABELS, ETAPAS_FUNIL_VALIDAS, type EtapaFunil } from "@shared/funnel";

interface LeadResumo {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  produto_interesse?: string;
  valor_solicitado?: number;
  etapa_funil: string;
  temperatura?: string;
  responsavel_id?: string | null;
  responsavel_nome?: string;
  proximo_followup?: string | null;
  observacoes?: string | null;
  created_at: string;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDataHora = (value?: string | null) => value
  ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  : "Sem follow-up";
const toInputDateTime = (value?: string | null) => {
  if (!value) return "";
  const data = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
};

const TEMP_BADGE: Record<string, string> = {
  frio: "bg-sky-100 text-sky-700 border-sky-200",
  morno: "bg-amber-100 text-amber-700 border-amber-200",
  quente: "bg-orange-100 text-orange-700 border-orange-200",
  urgente: "bg-red-100 text-red-700 border-red-200",
};

const ESCOPOS = [
  { value: "meus", label: "Meus leads" },
  { value: "sem_responsavel", label: "Sem responsável" },
  { value: "todos", label: "Todos visíveis" },
] as const;

const ESCOPOS_AGENTE: Array<(typeof ESCOPOS)[number]> = [{ value: "meus", label: "Meus leads" }];

export default function MeuCRM() {
  const { colaborador } = useAuth();
  const [scope, setScope] = useState<(typeof ESCOPOS)[number]["value"]>("meus");
  const [leads, setLeads] = useState<LeadResumo[]>([]);
  const [followupsHoje, setFollowupsHoje] = useState<LeadResumo[]>([]);
  const [followupsAtrasados, setFollowupsAtrasados] = useState<LeadResumo[]>([]);
  const [leadAbertoId, setLeadAbertoId] = useState<string | null>(null);
  const [editEtapa, setEditEtapa] = useState<EtapaFunil>(ETAPAS_FUNIL_VALIDAS[0]);
  const [editFollowup, setEditFollowup] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const podeVerTudo = Boolean(colaborador?.pode_ver_todos_leads || colaborador?.permissoes?.podeVerTudo);
  const escoposDisponiveis = podeVerTudo ? ESCOPOS : ESCOPOS_AGENTE;

  useEffect(() => {
    if (!podeVerTudo && scope !== "meus") {
      setScope("meus");
    }
  }, [podeVerTudo, scope]);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const scopeParam = scope === "todos" ? "" : `?scope=${scope}`;
      const [pipeline, hoje, atrasados] = await Promise.all([
        apiFetch(`/api/crm/pipeline${scopeParam}`),
        apiFetch(`/api/leads/hoje${scope === "todos" ? "" : `?scope=${scope}`}`),
        apiFetch(`/api/leads/atrasados${scope === "todos" ? "" : `?scope=${scope}`}`),
      ]);
      setLeads(Array.isArray(pipeline) ? pipeline : []);
      setFollowupsHoje(Array.isArray(hoje) ? hoje : []);
      setFollowupsAtrasados(Array.isArray(atrasados) ? atrasados : []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar a visão individual do agente.");
      setLeads([]);
      setFollowupsHoje([]);
      setFollowupsAtrasados([]);
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const metricas = useMemo(() => {
    const quentes = leads.filter((lead) => ["quente", "urgente"].includes(lead.temperatura || "")).length;
    const valorTotal = leads.reduce((acc, lead) => acc + (lead.valor_solicitado ?? 0), 0);
    const semResponsavel = leads.filter((lead) => !lead.responsavel_id).length;

    return {
      total: leads.length,
      quentes,
      valorTotal,
      followupHoje: followupsHoje.length,
      followupAtrasado: followupsAtrasados.length,
      semResponsavel,
    };
  }, [followupsAtrasados.length, followupsHoje.length, leads]);

  const leadsOrdenados = useMemo(() => {
    return [...leads].sort((a, b) => {
      const followupA = a.proximo_followup ? new Date(a.proximo_followup).getTime() : Number.MAX_SAFE_INTEGER;
      const followupB = b.proximo_followup ? new Date(b.proximo_followup).getTime() : Number.MAX_SAFE_INTEGER;
      return followupA - followupB;
    });
  }, [leads]);

  function abrirLead(lead: LeadResumo) {
    setLeadAbertoId(lead.id);
    setEditEtapa((lead.etapa_funil as EtapaFunil) || ETAPAS_FUNIL_VALIDAS[0]);
    setEditFollowup(toInputDateTime(lead.proximo_followup));
    setEditObservacoes(lead.observacoes || "");
  }

  async function assumirLead(lead: LeadResumo) {
    setSavingId(lead.id);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ responsavel_id: colaborador?.id }),
      });
      toast.success(`Lead ${lead.nome} assumido com sucesso.`);
      carregarDados();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível assumir o lead.");
    }
    setSavingId(null);
  }

  async function salvarLead(leadId: string) {
    setSavingId(leadId);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          etapa_funil: editEtapa,
          proximo_followup: editFollowup ? new Date(editFollowup).toISOString() : null,
          observacoes: editObservacoes || null,
          responsavel_id: scope === "sem_responsavel" ? (colaborador?.id || null) : undefined,
        }),
      });
      toast.success("Lead atualizado com sucesso.");
      setLeadAbertoId(null);
      carregarDados();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar lead.");
    }
    setSavingId(null);
  }

  return (
    <Layout title="Meu CRM">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meu CRM operacional</h1>
            <p className="text-sm text-gray-500 mt-1">
              Visão do agente autenticado com ações rápidas sobre carteira, prioridades e leads sem responsável.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
              <UserCheck className="h-4 w-4" />
              {colaborador?.nome || "Agente"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {podeVerTudo && (
              <Link href="/colaborador/crm">
                <a className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Kanban className="h-4 w-4" /> CRM completo
                </a>
              </Link>
            )}
            <Link href="/colaborador/fila">
              <a className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Briefcase className="h-4 w-4" /> Fila operacional
              </a>
            </Link>
            <Button variant="outline" onClick={carregarDados} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <Filter className="h-4 w-4" /> Escopo da visão
            </div>
            <Select value={scope} onValueChange={(value) => setScope(value as (typeof ESCOPOS)[number]["value"])}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {escoposDisponiveis.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              {podeVerTudo
                ? "Use esta visão para focar na sua carteira, nos itens sem responsável ou em toda a área visível para o seu perfil."
                : "Use esta visão para atuar exclusivamente sobre a sua própria carteira operacional."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1"><UserCheck className="h-4 w-4" /> Leads visíveis</div>
            <p className="text-2xl font-bold text-gray-900">{metricas.total}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4">
            <div className="flex items-center gap-2 text-green-700 text-xs font-medium mb-1"><Target className="h-4 w-4" /> Pipeline estimado</div>
            <p className="text-2xl font-bold text-green-700">{fmtBRL.format(metricas.valorTotal)}</p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
            <div className="flex items-center gap-2 text-orange-700 text-xs font-medium mb-1"><Thermometer className="h-4 w-4" /> Quentes / urgentes</div>
            <p className="text-2xl font-bold text-orange-700">{metricas.quentes}</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <div className="flex items-center gap-2 text-amber-700 text-xs font-medium mb-1"><Clock className="h-4 w-4" /> Hoje</div>
            <p className="text-2xl font-bold text-amber-700">{metricas.followupHoje}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <div className="flex items-center gap-2 text-red-700 text-xs font-medium mb-1"><AlertTriangle className="h-4 w-4" /> Atrasados</div>
            <p className="text-2xl font-bold text-red-700">{metricas.followupAtrasado}</p>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-700 text-xs font-medium mb-1"><Briefcase className="h-4 w-4" /> Sem responsável</div>
            <p className="text-2xl font-bold text-slate-700">{metricas.semResponsavel}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Minha operação</h2>
                <p className="text-xs text-gray-500">Abra um lead para atualizar etapa, follow-up e observações.</p>
              </div>
              <Badge variant="secondary">{leadsOrdenados.length}</Badge>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : leadsOrdenados.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Nenhum lead disponível no escopo atual.</p>
                <p className="text-sm text-gray-400 mt-1">Altere o escopo ou aguarde novas atribuições.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {leadsOrdenados.map((lead) => {
                  const atrasado = Boolean(lead.proximo_followup && new Date(lead.proximo_followup) < new Date());
                  const badgeTemp = TEMP_BADGE[lead.temperatura || ""] || "bg-gray-100 text-gray-700 border-gray-200";
                  const estaAberto = leadAbertoId === lead.id;
                  return (
                    <div key={lead.id} className="px-4 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-semibold text-gray-900">{lead.nome}</p>
                            <Badge variant="secondary">{ETAPAS_FUNIL_LABELS[lead.etapa_funil as EtapaFunil] || lead.etapa_funil}</Badge>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTemp}`}>
                              {lead.temperatura || "sem temperatura"}
                            </span>
                            {atrasado && <Badge variant="destructive">Atrasado</Badge>}
                            {!lead.responsavel_id && <Badge variant="outline">Sem responsável</Badge>}
                          </div>
                          <p className="text-sm text-gray-500">
                            {[lead.empresa, lead.produto_interesse, lead.telefone].filter(Boolean).join(" • ") || "Sem dados complementares"}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Follow-up: <span className={atrasado ? "font-semibold text-red-600" : "font-medium text-gray-700"}>{fmtDataHora(lead.proximo_followup)}</span>
                          </p>
                        </div>
                        <div className="text-right min-w-[220px]">
                          <p className="text-xs text-gray-500">Valor potencial</p>
                          <p className="text-lg font-bold text-gray-900">{lead.valor_solicitado ? fmtBRL.format(lead.valor_solicitado) : "Não informado"}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm text-gray-500">
                          Responsável: <span className="font-medium text-gray-700">{lead.responsavel_nome || "Não atribuído"}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!lead.responsavel_id && (
                            <Button size="sm" variant="outline" onClick={() => assumirLead(lead)} disabled={savingId === lead.id}>
                              <UserCheck className="h-4 w-4 mr-1" /> Assumir
                            </Button>
                          )}
                          <Link href={`/colaborador/crm?leadId=${encodeURIComponent(lead.id)}`}>
                            <a className="inline-flex">
                              <Button size="sm" variant="outline">
                                <Eye className="h-4 w-4 mr-1" /> Detalhar
                              </Button>
                            </a>
                          </Link>
                          <Link href={`/colaborador/crm?leadId=${encodeURIComponent(lead.id)}`}>
                            <a className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
                              Abrir no CRM
                              <ArrowRight className="h-4 w-4" />
                            </a>
                          </Link>
                        </div>
                      </div>

                      {estaAberto && (
                        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label>Etapa do funil</Label>
                              <Select value={editEtapa} onValueChange={(value) => setEditEtapa(value as EtapaFunil)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ETAPAS_FUNIL_VALIDAS.map((item) => (
                                    <SelectItem key={item} value={item}>{ETAPAS_FUNIL_LABELS[item]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Próximo follow-up</Label>
                              <div className="relative">
                                <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input type="datetime-local" className="pl-9" value={editFollowup} onChange={(e) => setEditFollowup(e.target.value)} />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Observações</Label>
                            <div className="relative">
                              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <textarea
                                className="min-h-[110px] w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={editObservacoes}
                                onChange={(e) => setEditObservacoes(e.target.value)}
                                placeholder="Registrar resumo do contato, objeções, próximos passos ou contexto relevante."
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className="text-xs text-gray-500">Ao salvar, a atualização usa o endpoint atual de leads e mantém compatibilidade com o CRM existente.</p>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setLeadAbertoId(null)}>Fechar</Button>
                              <Button size="sm" onClick={() => salvarLead(lead.id)} disabled={savingId === lead.id}>
                                <Save className="h-4 w-4 mr-1" /> {savingId === lead.id ? "Salvando..." : "Salvar alterações"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-red-800">Follow-ups atrasados</p>
                  <p className="text-xs text-red-600">Ação imediata.</p>
                </div>
                <Badge variant="destructive">{followupsAtrasados.length}</Badge>
              </div>
              <div className="divide-y divide-red-50 max-h-72 overflow-y-auto">
                {followupsAtrasados.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-gray-500">Nenhum atraso operacional no momento.</div>
                ) : followupsAtrasados.map((lead) => (
                  <button key={lead.id} className="w-full px-4 py-3 text-left hover:bg-red-50/40" onClick={() => abrirLead(lead)}>
                    <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                    <p className="text-xs text-red-600 mt-1">{fmtDataHora(lead.proximo_followup)}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-800">Follow-ups de hoje</p>
                  <p className="text-xs text-amber-600">Agenda operacional.</p>
                </div>
                <Badge variant="secondary">{followupsHoje.length}</Badge>
              </div>
              <div className="divide-y divide-amber-50 max-h-72 overflow-y-auto">
                {followupsHoje.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-gray-500">Nenhum follow-up agendado para hoje.</div>
                ) : followupsHoje.map((lead) => (
                  <button key={lead.id} className="w-full px-4 py-3 text-left hover:bg-amber-50/40" onClick={() => abrirLead(lead)}>
                    <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                    <p className="text-xs text-amber-700 mt-1">{fmtDataHora(lead.proximo_followup)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
