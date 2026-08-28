import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "@/lib/currency";
import {
  Users, Plus, Search, Phone, Mail, Building2, ChevronRight,
  Clock, Star, Calendar, RefreshCw, Loader2, Filter,
  MessageSquare, FileText, CheckCircle, XCircle, AlertCircle,
  TrendingUp, Zap, Target, Award, ArrowRight, Edit2, Trash2,
  MoreVertical, Eye, X, Save, Send, Upload, Download,
  ChevronDown, ChevronUp, Info, Flame, Snowflake, Thermometer,
  Activity, BarChart2, DollarSign, UserCheck, ClipboardList,
  PlusCircle, Check, Circle, AlertTriangle, Brain, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ETAPA_FUNIL_DEFAULT, ETAPAS_FUNIL_LABELS, ETAPAS_FUNIL_VALIDAS, normalizarEtapaFunil, type EtapaFunil } from "@shared/funnel";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/states";
import { RiscoBadge, ScoreIndicator, StatusCadastroBadge } from "@/components/ui/risco-badge";

// ─── Tipos ────────────────────────────────────────────────────
interface Lead {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  empresa?: string;
  tipo_pessoa?: "pf" | "pj";
  cpf_cnpj?: string;
  cargo?: string;
  cidade?: string;
  estado?: string;
  canal_origem?: string;
  produto_interesse?: string;
  valor_solicitado?: number;
  prazo_meses?: number;
  etapa_funil: string;
  temperatura?: string;
  score_ia?: number;
  score_manual?: number;
  score_efetivo?: number;
  tags?: string[];
  proximo_followup?: string;
  ultimo_contato_em?: string;
  resumo_ia?: string;
  observacoes_ia?: string;
  chatwoot_conv_id?: number;
  responsavel_id?: string | null;
  responsavel_nome?: string;
  total_docs?: number;
  docs_recebidos?: number;
  docs_pendentes_obrig?: number;
  ultima_atividade?: string;
  ultima_atividade_em?: string;
  dias_sem_contato?: number;
  created_at: string;
  updated_at?: string;
  status?: string;
  origem?: string;
}

interface Atividade {
  id: string;
  lead_id: string;
  colaborador_id?: string;
  tipo: string;
  titulo: string;
  descricao?: string;
  resultado?: string;
  origem_ia?: boolean;
  created_at: string;
}

interface Documento {
  id: string;
  lead_id: string;
  nome: string;
  tipo: string;
  status: string;
  obrigatorio: boolean;
  observacao?: string;
  recebido_em?: string;
  created_at: string;
}

interface QualificacaoIA {
  id: string;
  score: number;
  temperatura: string;
  etapa_sugerida: string;
  resumo: string;
  pontos_positivos?: string[];
  pontos_atencao?: string[];
  proxima_acao?: string;
  documentos_faltando?: string[];
  probabilidade_conv?: number;
  created_at: string;
}

interface Colaborador {
  id: string;
  nome: string;
  cargo?: string;
  perfil?: string;
  ativo?: boolean;
}

interface FollowupOperacional {
  id: string;
  lead_id: string;
  colaborador_id: string;
  colaborador_nome?: string;
  agendado_para: string;
  tipo: string;
  descricao?: string | null;
  status: "pendente" | "realizado" | "cancelado" | "reagendado";
  resultado?: string | null;
  observacoes?: string | null;
  reagendado_para?: string | null;
  created_at: string;
}

interface NotaInterna {
  id: string;
  lead_id: string;
  autor_id: string;
  autor_nome?: string;
  conteudo: string;
  privada: boolean;
  fixada: boolean;
  created_at: string;
}

interface DelegacaoOperacional {
  id: string;
  lead_id: string;
  delegado_por: string;
  delegado_para: string;
  delegado_por_nome?: string;
  delegado_para_nome?: string;
  motivo?: string | null;
  created_at: string;
}

interface HistoricoFunil {
  id: string;
  lead_id: string;
  etapa_de?: string | null;
  etapa_para: string;
  motivo?: string | null;
  origem_ia?: boolean;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  colaborador_cargo?: string | null;
  created_at: string;
}

// ─── Configurações ────────────────────────────────────────────
const ETAPA_FUNIL_STYLE: Record<string, { color: string; text: string; dot: string }> = {
  entrada:      { color: "bg-muted border-input",    text: "text-foreground",   dot: "bg-muted" },
  triagem:      { color: "bg-muted border-input",   text: "text-foreground",  dot: "bg-muted0" },
  contato:      { color: "bg-primary/10 border-primary/30",     text: "text-primary",   dot: "bg-primary" },
  qualificacao: { color: "bg-primary/10 border-primary/30",     text: "text-primary",   dot: "bg-primary/100" },
  documentos:   { color: "bg-warning/10 border-warning/30", text: "text-warning", dot: "bg-warning" },
  analise:      { color: "bg-success/10 border-success/30",     text: "text-success",   dot: "bg-success" },
  proposta:     { color: "bg-primary/10 border-primary/30", text: "text-primary", dot: "bg-primary/100" },
  negociacao:   { color: "bg-warning/10 border-warning/30", text: "text-warning", dot: "bg-warning" },
  ganho:        { color: "bg-success/10 border-success/30",   text: "text-success",  dot: "bg-success" },
  perdido:      { color: "bg-destructive/10 border-destructive/30",       text: "text-destructive",    dot: "bg-destructive" },
  reativacao:   { color: "bg-warning/10 border-warning/30",   text: "text-warning",  dot: "bg-warning/100" },
  carteira:     { color: "bg-success/10 border-success/30", text: "text-success", dot: "bg-success" },
};

const ETAPAS_FUNIL = ETAPAS_FUNIL_VALIDAS.map((id) => ({
  id,
  label: ETAPAS_FUNIL_LABELS[id],
  ...ETAPA_FUNIL_STYLE[id],
}));

const TEMPERATURA_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  frio:    { label: "Frio",    color: "text-primary",  bg: "bg-primary/10",   icon: Snowflake },
  morno:   { label: "Morno",   color: "text-warning",bg: "bg-warning/10", icon: Thermometer },
  quente:  { label: "Quente",  color: "text-warning",bg: "bg-warning/10", icon: Flame },
  urgente: { label: "Urgente", color: "text-destructive",   bg: "bg-destructive/10",    icon: Zap },
};

const TIPO_ATIVIDADE: Record<string, { label: string; icon: string }> = {
  nota:          { label: "Nota",        icon: "📝" },
  ligacao:       { label: "Ligação",     icon: "📞" },
  whatsapp:      { label: "WhatsApp",    icon: "💬" },
  email:         { label: "E-mail",      icon: "📧" },
  reuniao:       { label: "Reunião",     icon: "🤝" },
  proposta:      { label: "Proposta",    icon: "📄" },
  documento:     { label: "Documento",   icon: "📁" },
  status_change: { label: "Mudança",     icon: "🔄" },
  ia_acao:       { label: "IA",          icon: "🤖" },
  followup:      { label: "Follow-up",   icon: "🔔" },
  outro:         { label: "Outro",       icon: "💡" },
};

const DOCS_TIPOS: Record<string, string> = {
  rg:                    "RG",
  cpf:                   "CPF",
  cnh:                   "CNH",
  comprovante_renda:     "Comprovante de Renda",
  comprovante_residencia:"Comprovante de Residência",
  contrato_social:       "Contrato Social",
  balanco:               "Balanço Patrimonial",
  faturamento:           "Faturamento",
  certidao_negativa:     "Certidão Negativa",
  extrato_bancario:      "Extrato Bancário",
  declaracao_ir:         "Declaração IR",
  outro:                 "Outro",
};

const fmt = (v?: number) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtDateTime = (d?: string) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

// ─── Componente Score ─────────────────────────────────────────
function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 75 ? "text-success bg-success/10" :
                score >= 50 ? "text-warning bg-warning/10" :
                score >= 25 ? "text-warning bg-warning/10" :
                              "text-destructive bg-destructive/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      <Brain className="h-3 w-3" />
      {score}
    </span>
  );
}

// ─── Card do Lead no Kanban ───────────────────────────────────
function KanbanCard({
  lead, onClick, onDragStart
}: {
  lead: Lead;
  onClick: () => void;
  onDragStart: (lead: Lead) => void;
}) {
  const temp = lead.temperatura ? TEMPERATURA_CONFIG[lead.temperatura] : null;
  const TempIcon = temp?.icon;
  const hasFollowup = lead.proximo_followup && new Date(lead.proximo_followup) <= new Date();
  const docsAlert = (lead.docs_pendentes_obrig ?? 0) > 0;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(lead); }}
      className="bg-card rounded-lg border border-border p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/30 hover:shadow-md transition-all group select-none"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">{lead.nome}</p>
          {lead.empresa && (
            <p className="text-[11px] text-muted-foreground truncate">{lead.empresa}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {temp && TempIcon && (
            <span className={`${temp.color} ${temp.bg} p-0.5 rounded`}>
              <TempIcon className="h-2.5 w-2.5" />
            </span>
          )}
          <ScoreBadge score={lead.score_efetivo ?? lead.score_ia} />
        </div>
      </div>

      {/* Produto */}
      {lead.produto_interesse && (
        <span className="inline-block text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded truncate max-w-full mb-1.5">
          {lead.produto_interesse}
        </span>
      )}

      {/* Alertas + data */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {hasFollowup && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-destructive bg-destructive/10 px-1 py-0.5 rounded">
              <Clock className="h-2.5 w-2.5" />FU
            </span>
          )}
          {docsAlert && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-warning bg-warning/10 px-1 py-0.5 rounded">
              <AlertTriangle className="h-2.5 w-2.5" />Doc
            </span>
          )}
          {lead.dias_sem_contato != null && lead.dias_sem_contato > 7 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
              <Clock className="h-2.5 w-2.5" />{lead.dias_sem_contato}d
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmtDate(lead.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Coluna do Kanban ─────────────────────────────────────────
function KanbanColuna({
  etapa, leads, onCardClick, onAddLead, onDrop, onDragStart
}: {
  etapa: typeof ETAPAS_FUNIL[0];
  leads: Lead[];
  onCardClick: (l: Lead) => void;
  onAddLead: (etapa: string) => void;
  onDrop: (etapaId: string) => void;
  onDragStart: (lead: Lead) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const valor = leads.reduce((s, l) => s + (l.valor_solicitado ?? 0), 0);

  return (
    <div
      className={`flex-shrink-0 w-52 rounded-xl border-2 flex flex-col transition-all ${
        isDragOver ? "border-primary/30 bg-primary/10 scale-[1.01] shadow-lg" : etapa.color
      }`}
      style={{ minHeight: 160 }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { e.preventDefault(); setIsDragOver(false); onDrop(etapa.id); }}
    >
      {/* Header da coluna */}
      <div className="px-2.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${etapa.dot}`} />
          <span className={`text-[11px] font-bold uppercase tracking-wide ${etapa.text} truncate max-w-[90px]`}>{etapa.label}</span>
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-card/70 ${etapa.text}`}>
            {leads.length}
          </span>
        </div>
        <button
          onClick={() => onAddLead(etapa.id)}
          className={`p-0.5 rounded hover:bg-card/50 transition-colors ${etapa.text} opacity-60 hover:opacity-100`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {/* Valor total */}
      {valor > 0 && (
        <div className={`px-2.5 pb-1 text-[11px] font-medium ${etapa.text} opacity-70`}>
          {fmt(valor)}
        </div>
      )}
      {/* Drop zone hint */}
      {isDragOver && (
        <div className="mx-2 mb-1 border-2 border-dashed border-primary/30 rounded-lg py-2 text-center text-xs text-primary font-medium">
          Soltar aqui
        </div>
      )}
      {/* Cards */}
      <div className="flex-1 px-1.5 pb-1.5 space-y-1.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {leads.map(lead => (
          <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} onDragStart={onDragStart} />
        ))}
        {leads.length === 0 && (
          <EmptyState preset="leads" title="Nenhum lead" description="Arraste leads para esta etapa." className="py-4" />
        )}
      </div>
    </div>
  );
}

function fmtDataOperacional(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem data";
}

function PainelOperacionalCRM({
  leadId,
  colaboradores,
  podeGerenciarCarteira,
  onUpdated,
}: {
  leadId: string;
  colaboradores: Colaborador[];
  podeGerenciarCarteira: boolean;
  onUpdated: () => void;
}) {
  const [followups, setFollowups] = useState<FollowupOperacional[]>([]);
  const [notas, setNotas] = useState<NotaInterna[]>([]);
  const [delegacoes, setDelegacoes] = useState<DelegacaoOperacional[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novoFollowup, setNovoFollowup] = useState({ agendado_para: "", tipo: "ligacao", descricao: "" });
  const [novaNota, setNovaNota] = useState("");
  const [delegadoPara, setDelegadoPara] = useState("");
  const [motivoDelegacao, setMotivoDelegacao] = useState("");

  const carregarOperacao = async () => {
    setLoading(true);
    const [followupsResult, notasResult, delegacoesResult] = await Promise.all([
      apiFetch(`/api/crm/followups?lead_id=${encodeURIComponent(leadId)}`).catch(() => []),
      apiFetch(`/api/crm/notas-internas?lead_id=${encodeURIComponent(leadId)}`).catch(() => []),
      apiFetch(`/api/crm/delegacoes?lead_id=${encodeURIComponent(leadId)}`).catch(() => []),
    ]);
    setFollowups(Array.isArray(followupsResult) ? followupsResult : []);
    setNotas(Array.isArray(notasResult) ? notasResult : []);
    setDelegacoes(Array.isArray(delegacoesResult) ? delegacoesResult : []);
    setLoading(false);
  };

  useEffect(() => {
    carregarOperacao();
  }, [leadId]);

  async function criarFollowup() {
    if (!novoFollowup.agendado_para) {
      toast.error("Informe a data do follow-up.");
      return;
    }
    setSalvando(true);
    try {
      await apiFetch("/api/crm/followups", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId, ...novoFollowup }),
      });
      toast.success("Follow-up agendado.");
      setNovoFollowup({ agendado_para: "", tipo: "ligacao", descricao: "" });
      await carregarOperacao();
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível agendar o follow-up.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarFollowup(id: string, status: FollowupOperacional["status"]) {
    try {
      await apiFetch(`/api/crm/followups/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resultado: status === "realizado" ? "neutro" : undefined }),
      });
      await carregarOperacao();
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível atualizar o follow-up.");
    }
  }

  async function criarNota() {
    if (!novaNota.trim()) {
      toast.error("Escreva uma nota antes de salvar.");
      return;
    }
    setSalvando(true);
    try {
      await apiFetch("/api/crm/notas-internas", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId, conteudo: novaNota.trim(), privada: true }),
      });
      toast.success("Nota interna salva.");
      setNovaNota("");
      await carregarOperacao();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível salvar a nota interna.");
    } finally {
      setSalvando(false);
    }
  }

  async function delegarLead() {
    if (!delegadoPara) {
      toast.error("Selecione o colaborador de destino.");
      return;
    }
    setSalvando(true);
    try {
      await apiFetch("/api/crm/delegacoes", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId, delegado_para: delegadoPara, motivo: motivoDelegacao.trim() || null }),
      });
      toast.success("Lead delegado com sucesso.");
      setMotivoDelegacao("");
      await carregarOperacao();
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível delegar o lead.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <TabsContent value="operacao" className="mt-4 space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Follow-up operacional</h3>
            <p className="text-xs text-muted-foreground">O próximo item também mantém o campo legado proximo_followup sincronizado.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-2">
          <Input type="datetime-local" value={novoFollowup.agendado_para} onChange={(e) => setNovoFollowup((p) => ({ ...p, agendado_para: e.target.value }))} />
          <Select value={novoFollowup.tipo} onValueChange={(value) => setNovoFollowup((p) => ({ ...p, tipo: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ligacao">Ligação</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="reuniao">Reunião</SelectItem>
              <SelectItem value="visita">Visita</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea rows={2} placeholder="Contexto ou objetivo do follow-up" value={novoFollowup.descricao} onChange={(e) => setNovoFollowup((p) => ({ ...p, descricao: e.target.value }))} />
        <Button size="sm" onClick={criarFollowup} disabled={salvando}><PlusCircle className="h-4 w-4 mr-1" /> Agendar follow-up</Button>
        {!loading && followups.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-primary/15">
            {followups.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{fmtDataOperacional(item.agendado_para)}</span>
                    <Badge variant={item.status === "pendente" ? "secondary" : item.status === "realizado" ? "default" : "outline"}>{item.status}</Badge>
                    <span className="text-xs text-muted-foreground">{item.tipo}</span>
                  </div>
                  {item.descricao && <p className="text-xs text-muted-foreground mt-1">{item.descricao}</p>}
                </div>
                {item.status === "pendente" && (
                  <Button size="sm" variant="outline" onClick={() => atualizarFollowup(item.id, "realizado")}><CheckCircle className="h-3.5 w-3.5 mr-1" /> Concluir</Button>
                )}
              </div>
            ))}
          </div>
        )}
        {!loading && followups.length === 0 && <p className="text-xs text-muted-foreground">Nenhum follow-up operacional encontrado.</p>}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-semibold text-foreground">Notas internas</h3><p className="text-xs text-muted-foreground">Visíveis ao autor, responsável atual e gestores.</p></div></div>
        <Textarea rows={3} placeholder="Registrar contexto interno, objeções ou próximos passos" value={novaNota} onChange={(e) => setNovaNota(e.target.value)} />
        <Button size="sm" variant="outline" onClick={criarNota} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar nota privada</Button>
        {notas.map((nota) => (
          <div key={nota.id} className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm text-foreground whitespace-pre-wrap">{nota.conteudo}</p>
            <p className="text-[11px] text-muted-foreground mt-2">{nota.autor_nome || "Colaborador"} · {fmtDataOperacional(nota.created_at)}</p>
          </div>
        ))}
        {!loading && notas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma nota interna encontrada.</p>}
      </div>

      {podeGerenciarCarteira && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-warning" /><div><h3 className="text-sm font-semibold text-foreground">Delegar lead</h3><p className="text-xs text-muted-foreground">A delegação é auditada e atualiza o responsável atual.</p></div></div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-2">
            <Select value={delegadoPara} onValueChange={setDelegadoPara}>
              <SelectTrigger><SelectValue placeholder="Colaborador de destino" /></SelectTrigger>
              <SelectContent>{colaboradores.filter((item) => item.ativo !== false).map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Motivo (opcional)" value={motivoDelegacao} onChange={(e) => setMotivoDelegacao(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={delegarLead} disabled={salvando}><ArrowRight className="h-4 w-4 mr-1" /> Delegar</Button>
          {delegacoes.map((item) => <p key={item.id} className="text-xs text-muted-foreground">{item.delegado_por_nome || "Gestão"} → {item.delegado_para_nome || "colaborador"} · {fmtDataOperacional(item.created_at)}{item.motivo ? ` · ${item.motivo}` : ""}</p>)}
        </div>
      )}
    </TabsContent>
  );
}

// ─── Modal: Ficha do Lead ─────────────────────────────────────
function FichaLead({
  lead,
  colaboradores,
  onClose,
  onUpdate,
}: {
  lead: Lead;
  colaboradores: Colaborador[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { colaborador } = useAuth();
  const podeGerenciarCarteira = Boolean(colaborador?.pode_ver_todos_leads || colaborador?.permissoes?.podeVerTudo);
  const podeReatribuirLead = podeGerenciarCarteira || !lead.responsavel_id || lead.responsavel_id === colaborador?.id;
  const colaboradoresAtribuiveis = podeGerenciarCarteira
    ? colaboradores.filter(c => c.ativo !== false)
    : colaboradores.filter(c => c.ativo !== false && c.id === colaborador?.id);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [qualificacoes, setQualificacoes] = useState<QualificacaoIA[]>([]);
  const [historicoFunil, setHistoricoFunil] = useState<HistoricoFunil[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novaAtiv, setNovaAtiv] = useState({ tipo: "nota", titulo: "", descricao: "", resultado: "" });
  const [editando, setEditando] = useState(false);
  const [dadosEdit, setDadosEdit] = useState<Partial<Lead>>({});
  const [novaEtapa, setNovaEtapa] = useState<string>(normalizarEtapaFunil(lead.etapa_funil));
  const [novaTemp, setNovaTemp] = useState(lead.temperatura ?? "frio");

  // IA state
  const [iaResumo, setIaResumo] = useState<{ resumo: string; pontos_atencao: string[]; gerado_em: string; fallback_operacional?: boolean } | null>(null);
  const [iaRecomendacoes, setIaRecomendacoes] = useState<Array<{ titulo: string; descricao: string; prioridade: string; tipo: string }>>([]);
  const [iaRecomendacoesFallback, setIaRecomendacoesFallback] = useState(false);
  const [iaFollowup, setIaFollowup] = useState<{ mensagem: string; link_whatsapp?: string; assunto?: string; fallback_operacional?: boolean } | null>(null);
  const [iaLoading, setIaLoading] = useState<"resumo" | "recomendacoes" | "followup" | null>(null);
  const [showIaModal, setShowIaModal] = useState<"resumo" | "recomendacoes" | "followup" | null>(null);
  const [followupTipo, setFollowupTipo] = useState<"primeiro_contato" | "proposta_enviada" | "reativacao" | "pos_aprovacao">("primeiro_contato");
  const [followupCanal, setFollowupCanal] = useState<"whatsapp" | "email">("whatsapp");

  async function gerarResumoIA() {
    setIaLoading("resumo");
    try {
      const data = await apiFetch(`/api/ia/resumo/${lead.id}`);
      setIaResumo(data);
      setShowIaModal("resumo");
    } catch {
      toast.error("Erro ao gerar resumo. Tente novamente.");
    } finally {
      setIaLoading(null);
    }
  }

  async function gerarRecomendacoesIA() {
    setIaLoading("recomendacoes");
    try {
      const data = await apiFetch("/api/ia/recomendacoes", {
        method: "POST",
        body: JSON.stringify({ lead_id: lead.id }),
      });
      setIaRecomendacoes(data.recomendacoes || []);
      setIaRecomendacoesFallback(data.fallback_operacional === true);
      setShowIaModal("recomendacoes");
    } catch {
      toast.error("Erro ao gerar recomendações. Tente novamente.");
    } finally {
      setIaLoading(null);
    }
  }

  async function gerarMensagemFollowup() {
    setIaLoading("followup");
    try {
      const data = await apiFetch("/api/ia/mensagem-followup", {
        method: "POST",
        body: JSON.stringify({ lead_id: lead.id, tipo: followupTipo, canal: followupCanal }),
      });
      setIaFollowup(data);
      setShowIaModal("followup");
    } catch {
      toast.error("Erro ao gerar mensagem. Tente novamente.");
    } finally {
      setIaLoading(null);
    }
  }

  async function dispararFollowup() {
    if (!iaFollowup?.mensagem) return;
    try {
      await apiFetch("/api/ia/disparar-followup", {
        method: "POST",
        body: JSON.stringify({ lead_id: lead.id, mensagem: iaFollowup.mensagem, tipo: followupTipo, canal: followupCanal }),
      });
      toast.success("Follow-up disparado com sucesso!");
      setShowIaModal(null);
      onUpdate();
    } catch {
      toast.error("Erro ao disparar follow-up.");
    }
  }

  useEffect(() => {
    carregarDados();
  }, [lead.id]);

  useEffect(() => {
    setNovaEtapa(normalizarEtapaFunil(lead.etapa_funil));
  }, [lead.id, lead.etapa_funil]);

  async function carregarDados() {
    setLoading(true);
    try {
      // As rotas da camada operacional podem responder migration_pending durante
      // uma implantação gradual; isso não pode esconder as abas legadas.
      const [ativs, docs, quals, historico] = await Promise.all([
        apiFetch(`/api/crm/atividades?lead_id=${lead.id}`),
        apiFetch(`/api/crm/documentos?lead_id=${lead.id}`),
        apiFetch(`/api/crm/qualificacoes?lead_id=${lead.id}`),
        apiFetch(`/api/crm/historico-funil?lead_id=${lead.id}`).catch(() => []),
      ]);
      setAtividades(ativs ?? []);
      setDocumentos(docs ?? []);
      setQualificacoes(quals ?? []);
      setHistoricoFunil(Array.isArray(historico) ? historico : []);
    } finally {
      setLoading(false);
    }
  }

  async function salvarAtividade() {
    if (!novaAtiv.titulo.trim()) return toast.error("Informe o título da atividade.");
    setSalvando(true);
    try {
      await apiFetch("/api/crm/atividades", {
        method: "POST",
        body: JSON.stringify({
          lead_id: lead.id,
          tipo: novaAtiv.tipo,
          titulo: novaAtiv.titulo,
          descricao: novaAtiv.descricao || null,
          resultado: novaAtiv.resultado || null,
          origem_ia: false,
        }),
      });
      toast.success("Atividade registrada!");
      setNovaAtiv({ tipo: "nota", titulo: "", descricao: "", resultado: "" });
      carregarDados();
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar atividade.");
    }
    setSalvando(false);
  }

  async function moverFunil() {
    const etapaCanonica = normalizarEtapaFunil(novaEtapa);
    const etapaAtualCanonica = normalizarEtapaFunil(lead.etapa_funil);

    if (etapaCanonica === etapaAtualCanonica && novaTemp === lead.temperatura) return;
    setSalvando(true);
    try {
      const updates: Record<string, unknown> = { temperatura: novaTemp };
      if (etapaCanonica !== etapaAtualCanonica) {
        await apiFetch("/api/crm/mover-funil", {
          method: "POST",
          body: JSON.stringify({
            lead_id: lead.id,
            etapa_funil: etapaCanonica,
          }),
        });
      }
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      toast.success("Lead atualizado!");
      onUpdate();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao mover funil.");
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!dadosEdit || Object.keys(dadosEdit).length === 0) { setEditando(false); return; }
    setSalvando(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify(dadosEdit),
      });
      toast.success("Dados salvos!");
      setEditando(false);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar.");
    }
    setSalvando(false);
  }

  async function excluirLead() {
    if (!podeGerenciarCarteira) {
      toast.error("Apenas perfis de gestão podem excluir leads.");
      return;
    }

    if (!window.confirm(`Confirma a exclusão do lead ${lead.nome}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setSalvando(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
      });
      toast.success("Lead excluído com sucesso.");
      onClose();
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir lead.");
    }
    setSalvando(false);
  }

  async function atualizarDocumento(docId: string, status: string) {
    try {
      const updates: Record<string, unknown> = { status };
      if (status === "recebido") updates.recebido_em = new Date().toISOString();
      if (status === "aprovado") updates.aprovado_em = new Date().toISOString();
      await apiFetch(`/api/crm/documentos/${docId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      carregarDados();
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar documento.");
    }
  }

  async function adicionarDocumento(tipo: string) {
    try {
      const nome = DOCS_TIPOS[tipo] ?? tipo;
      await apiFetch("/api/crm/documentos", {
        method: "POST",
        body: JSON.stringify({
          lead_id: lead.id,
          nome,
          tipo,
          status: "pendente",
          obrigatorio: false,
        }),
      });
      carregarDados();
      toast.success("Documento adicionado.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao adicionar documento.");
    }
  }

  const temp = lead.temperatura ? TEMPERATURA_CONFIG[lead.temperatura] : null;
  const TempIcon = temp?.icon;
  const etapaAtual = ETAPAS_FUNIL.find(e => e.id === lead.etapa_funil);
  const houveMudancaPosicao = normalizarEtapaFunil(novaEtapa) !== normalizarEtapaFunil(lead.etapa_funil)
    || novaTemp !== lead.temperatura;

  return (
    <Sheet open modal={false} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[min(1100px,96vw)] sm:w-[min(1100px,96vw)] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-blue-900 to-blue-700 text-primary-foreground flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {etapaAtual && (
                  <span className="text-xs bg-card/20 px-2 py-0.5 rounded-full font-medium">
                    {etapaAtual.label}
                  </span>
                )}
                {temp && TempIcon && (
                  <span className={`text-xs ${temp.bg} ${temp.color} px-2 py-0.5 rounded-full font-medium flex items-center gap-1`}>
                    <TempIcon className="h-3 w-3" />
                    {temp.label}
                  </span>
                )}
                <ScoreBadge score={lead.score_efetivo ?? lead.score_ia} />
              </div>
              <h2 className="text-xl font-bold truncate">{lead.nome}</h2>
              {lead.empresa && <p className="text-primary text-sm">{lead.empresa}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lead.chatwoot_conv_id && (
                <a
                  href={`https://chatwoot.permupay.com.br/app/accounts/1/conversations/${lead.chatwoot_conv_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-card/20 hover:bg-card/30 px-2 py-1 rounded transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  Chatwoot
                </a>
              )}
              <button onClick={onClose} className="p-1 hover:bg-card/20 rounded transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Contatos rápidos */}
          <div className="flex items-center gap-4 mt-3 text-sm text-primary">
            <a href={`tel:${lead.telefone}`} className="flex items-center gap-1 hover:text-primary-foreground">
              <Phone className="h-3.5 w-3.5" />
              {lead.telefone}
            </a>
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-primary-foreground">
                <Mail className="h-3.5 w-3.5" />
                {lead.email}
              </a>
            )}
            {lead.telefone && (
              <a
                href={`https://wa.me/${lead.telefone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary-foreground"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Corpo com tabs */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="visao_geral" className="h-full flex flex-col">
            <TabsList className="mx-6 mt-3 flex-shrink-0">
              <TabsTrigger value="visao_geral">Visão Geral</TabsTrigger>
              <TabsTrigger value="atividades">
                Atividades
                {atividades.length > 0 && (
                  <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 rounded-full">{atividades.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="operacao">
                Operação
              </TabsTrigger>
              <TabsTrigger value="documentos">
                Documentos
                {(lead.docs_pendentes_obrig ?? 0) > 0 && (
                  <span className="ml-1 text-xs bg-warning/20 text-warning px-1.5 rounded-full">!</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="ia">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                IA
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 pb-6">

              {/* ── Visão Geral ── */}
              <TabsContent value="visao_geral" className="mt-4 space-y-4">
                {/* Mover funil */}
                <div className="bg-muted rounded-xl p-4 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Posição no Funil
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
                      <Select value={novaEtapa} onValueChange={setNovaEtapa}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ETAPAS_FUNIL.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Temperatura</label>
                      <Select value={novaTemp} onValueChange={setNovaTemp}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TEMPERATURA_CONFIG).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" className="mt-3 w-full" onClick={moverFunil} disabled={!houveMudancaPosicao || salvando}>
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    {salvando ? "Salvando..." : "Salvar Posição"}
                  </Button>
                </div>

                {/* Dados do lead */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-primary" />
                      Dados do Lead
                    </h3>
                    <div className="flex items-center gap-2">
                      {podeGerenciarCarteira && (
                        <Button variant="ghost" size="sm" onClick={excluirLead} disabled={salvando} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Excluir
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditando(!editando)}>
                        <Edit2 className="h-3.5 w-3.5 mr-1" />
                        {editando ? "Cancelar" : "Editar"}
                      </Button>
                    </div>
                  </div>

                  {editando ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "nome", label: "Nome" },
                        { key: "telefone", label: "Telefone" },
                        { key: "email", label: "E-mail" },
                        { key: "empresa", label: "Empresa" },
                        { key: "produto_interesse", label: "Produto" },
                        { key: "cidade", label: "Cidade" },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                          <Input
                            className="h-8 text-sm"
                            defaultValue={((lead as unknown) as Record<string, unknown>)[key] as string ?? ""}
                            onChange={e => setDadosEdit(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Valor Solicitado</label>
                        <Input
                          className="h-8 text-sm text-right font-mono tabular-nums"
                          type="text"
                          inputMode="numeric"
                          defaultValue={lead.valor_solicitado ? formatBRLCurrency(lead.valor_solicitado) : ""}
                          onChange={e => {
                            const formatted = maskCurrencyInput(e.target.value);
                            setDadosEdit(prev => ({ ...prev, valor_solicitado: unmaskCurrencyInput(formatted) || undefined }));
                          }}
                          placeholder="0,00"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Prazo (meses)</label>
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          defaultValue={lead.prazo_meses ?? ""}
                          onChange={e => setDadosEdit(prev => ({ ...prev, prazo_meses: parseInt(e.target.value) }))}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground mb-1 block">Responsável</label>
                        <Select
                          defaultValue={lead.responsavel_id || "__sem_responsavel__"}
                          disabled={!podeReatribuirLead}
                          onValueChange={value => setDadosEdit(prev => ({ ...prev, responsavel_id: value === "__sem_responsavel__" ? null : value }))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Selecione um responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            {podeGerenciarCarteira && <SelectItem value="__sem_responsavel__">Sem responsável</SelectItem>}
                            {colaboradoresAtribuiveis.map(col => (
                              <SelectItem key={col.id} value={col.id}>{col.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!podeReatribuirLead && (
                          <p className="text-[11px] text-warning mt-1">Somente perfis de gestão podem reatribuir leads entre agentes.</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground mb-1 block">Follow-up</label>
                        <Input
                          className="h-8 text-sm"
                          type="datetime-local"
                          defaultValue={lead.proximo_followup ? lead.proximo_followup.slice(0, 16) : ""}
                          onChange={e => setDadosEdit(prev => ({ ...prev, proximo_followup: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 flex gap-2">
                        <Button size="sm" className="flex-1" onClick={salvarEdicao} disabled={salvando}>
                          <Save className="h-3.5 w-3.5 mr-1" />
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                      {[
                        ["Tipo", lead.tipo_pessoa === "pj" ? "Pessoa Jurídica" : "Pessoa Física"],
                        ["Produto", lead.produto_interesse],
                        ["Valor", fmt(lead.valor_solicitado)],
                        ["Prazo", lead.prazo_meses ? `${lead.prazo_meses} meses` : undefined],
                        ["Origem", lead.canal_origem ?? lead.origem],
                        ["Cidade", lead.cidade ? `${lead.cidade}/${lead.estado ?? ""}` : undefined],
                        ["Responsável", lead.responsavel_nome],
                        ["Follow-up", fmtDateTime(lead.proximo_followup)],
                        ["Último contato", fmtDateTime(lead.ultimo_contato_em)],
                        ["Cadastrado em", fmtDate(lead.created_at)],
                      ].filter(([, v]) => v).map(([k, v]) => (
                        <div key={k as string}>
                          <span className="text-muted-foreground text-xs">{k}</span>
                          <p className="text-foreground font-medium text-xs mt-0.5">{v as string}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Histórico de mudanças do funil */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Histórico de mudanças
                    {historicoFunil.length > 0 && (
                      <span className="ml-auto text-[11px] font-bold text-muted-foreground">{historicoFunil.length} registro{historicoFunil.length !== 1 ? "s" : ""}</span>
                    )}
                  </h3>
                  {historicoFunil.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma mudança de etapa ou responsável registrada.</p>
                  ) : (
                    <div className="space-y-3">
                      {historicoFunil.map((evento) => {
                        const etapaDe = evento.etapa_de ? (ETAPAS_FUNIL_LABELS[evento.etapa_de as EtapaFunil] ?? evento.etapa_de) : "Sem etapa";
                        const etapaPara = ETAPAS_FUNIL_LABELS[evento.etapa_para as EtapaFunil] ?? evento.etapa_para;
                        return (
                          <div key={evento.id} className="border-l-2 border-primary/20 pl-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                              <span>{etapaDe}</span>
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{etapaPara}</span>
                              {evento.origem_ia && <Badge variant="outline" className="text-[10px]">IA</Badge>}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {fmtDateTime(evento.created_at)}
                              {evento.colaborador_nome ? ` · ${evento.colaborador_nome}` : " · Sistema"}
                              {evento.motivo ? ` · ${evento.motivo}` : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* IA Actions */}
                <div className="bg-gradient-to-br from-accent/10 to-primary/10 rounded-xl border border-primary/20 p-4">
                  <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Assistente IA
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-start gap-2 bg-card border-primary/20 hover:bg-primary/10 text-primary"
                      onClick={gerarResumoIA}
                      disabled={iaLoading !== null}
                    >
                      {iaLoading === "resumo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                      Gerar Resumo do Lead
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-start gap-2 bg-card border-primary/20 hover:bg-primary/10 text-primary"
                      onClick={gerarRecomendacoesIA}
                      disabled={iaLoading !== null}
                    >
                      {iaLoading === "recomendacoes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                      Obter Recomendações
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-start gap-2 bg-card border-primary/20 hover:bg-primary/10 text-primary"
                      onClick={() => setShowIaModal("followup")}
                      disabled={iaLoading !== null}
                    >
                      {iaLoading === "followup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Gerar Mensagem Follow-up
                    </Button>
                  </div>
                  {lead.resumo_ia && (
                    <div className="mt-3 pt-3 border-t border-primary/20">
                      <p className="text-xs text-primary font-medium mb-1">Análise anterior:</p>
                      <p className="text-xs text-primary">{lead.resumo_ia}</p>
                    </div>
                  )}
                </div>

                {/* Modal: Resumo IA */}
                <Dialog open={showIaModal === "resumo"} onOpenChange={o => !o && setShowIaModal(null)}>
                  <DialogContent className="max-w-lg w-[95vw]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Resumo do Lead — IA
                      </DialogTitle>
                    </DialogHeader>
                    {iaResumo?.fallback_operacional === true && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-warning">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-xs leading-relaxed"><span className="font-semibold">Fallback operacional utilizado.</span> Revise o conteúdo antes de tomar decisões ou registrar a informação como parecer de IA.</p>
                      </div>
                    )}
                    {iaResumo && (
                      <div className="space-y-4">
                        <div className="bg-primary/10 rounded-lg p-4">
                          <p className="text-sm text-foreground leading-relaxed">{iaResumo.resumo}</p>
                        </div>
                        {iaResumo.pontos_atencao?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-warning mb-2">Pontos de Atenção:</p>
                            <ul className="space-y-1">
                              {iaResumo.pontos_atencao.map((p, i) => (
                                <li key={i} className="text-xs text-warning flex items-start gap-1.5">
                                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />{p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">Gerado em {new Date(iaResumo.gerado_em).toLocaleString("pt-BR")}</p>
                      </div>
                    )}
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setShowIaModal(null)}>Fechar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Modal: Recomendações IA */}
                <Dialog open={showIaModal === "recomendacoes"} onOpenChange={o => !o && setShowIaModal(null)}>
                  <DialogContent className="max-w-lg w-[95vw]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Recomendações — IA
                      </DialogTitle>
                    </DialogHeader>
                    {iaRecomendacoesFallback && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-warning">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-xs leading-relaxed"><span className="font-semibold">Fallback operacional utilizado.</span> Revise as recomendações antes de executar qualquer ação.</p>
                      </div>
                    )}
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {iaRecomendacoes.map((r, i) => {
                        const prioColor = r.prioridade === "alta" ? "border-destructive/30 bg-destructive/10" : r.prioridade === "media" ? "border-warning/30 bg-warning/10" : "border-success/30 bg-success/10";
                        const prioText = r.prioridade === "alta" ? "text-destructive" : r.prioridade === "media" ? "text-warning" : "text-success";
                        return (
                          <div key={i} className={`rounded-lg border p-3 ${prioColor}`}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-semibold text-foreground">{r.titulo}</p>
                              <span className={`text-xs font-bold uppercase ${prioText}`}>{r.prioridade}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{r.descricao}</p>
                          </div>
                        );
                      })}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setShowIaModal(null)}>Fechar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Modal: Follow-up IA */}
                <Dialog open={showIaModal === "followup"} onOpenChange={o => !o && setShowIaModal(null)}>
                  <DialogContent className="max-w-lg w-[95vw]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Mensagem de Follow-up — IA
                      </DialogTitle>
                    </DialogHeader>
                    {iaFollowup?.fallback_operacional === true && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-warning">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-xs leading-relaxed"><span className="font-semibold">Fallback operacional utilizado.</span> Revise e ajuste a mensagem antes de enviar ou disparar o follow-up.</p>
                      </div>
                    )}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                          <Select value={followupTipo} onValueChange={v => setFollowupTipo(v as any)}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="primeiro_contato">Primeiro Contato</SelectItem>
                              <SelectItem value="proposta_enviada">Proposta Enviada</SelectItem>
                              <SelectItem value="reativacao">Reativação</SelectItem>
                              <SelectItem value="pos_aprovacao">Pós-Aprovação</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Canal</label>
                          <Select value={followupCanal} onValueChange={v => setFollowupCanal(v as any)}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              <SelectItem value="email">E-mail</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {!iaFollowup ? (
                        <Button className="w-full" size="sm" onClick={gerarMensagemFollowup} disabled={iaLoading === "followup"}>
                          {iaLoading === "followup" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                          Gerar Mensagem
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          {iaFollowup.assunto && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Assunto:</p>
                              <p className="text-sm font-medium text-foreground">{iaFollowup.assunto}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Mensagem:</p>
                            <Textarea
                              className="text-sm resize-none"
                              rows={6}
                              value={iaFollowup.mensagem}
                              onChange={e => setIaFollowup(p => p ? { ...p, mensagem: e.target.value } : null)}
                            />
                          </div>
                          <div className="flex gap-2">
                            {iaFollowup.link_whatsapp && (
                              <Button asChild size="sm" className="w-full bg-success hover:bg-success gap-2">
                                <a
                                href={iaFollowup.link_whatsapp}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1"
                              >
                                  <Phone className="h-4 w-4" /> Abrir WhatsApp
                                </a>
                              </Button>
                            )}
                            <Button size="sm" className="flex-1 gap-2" onClick={dispararFollowup}>
                              <Send className="h-4 w-4" /> Disparar via n8n
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setIaFollowup(null)}>Regerar</Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => { setShowIaModal(null); setIaFollowup(null); }}>Fechar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

              </TabsContent>

              {/* ── Atividades ── */}
              <TabsContent value="atividades" className="mt-4 space-y-4">
                {/* Nova atividade */}
                <div className="bg-muted rounded-xl p-4 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Registrar Atividade</h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Select value={novaAtiv.tipo} onValueChange={v => setNovaAtiv(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_ATIVIDADE).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={novaAtiv.resultado} onValueChange={v => setNovaAtiv(p => ({ ...p, resultado: v }))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Resultado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="positivo">✅ Positivo</SelectItem>
                        <SelectItem value="neutro">➖ Neutro</SelectItem>
                        <SelectItem value="negativo">❌ Negativo</SelectItem>
                        <SelectItem value="sem_resposta">📵 Sem resposta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    className="mb-2 text-sm"
                    placeholder="Título da atividade *"
                    value={novaAtiv.titulo}
                    onChange={e => setNovaAtiv(p => ({ ...p, titulo: e.target.value }))}
                  />
                  <Textarea
                    className="text-sm resize-none"
                    placeholder="Descrição (opcional)"
                    rows={2}
                    value={novaAtiv.descricao}
                    onChange={e => setNovaAtiv(p => ({ ...p, descricao: e.target.value }))}
                  />
                  <Button size="sm" className="mt-2 w-full" onClick={salvarAtividade} disabled={salvando}>
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PlusCircle className="h-4 w-4 mr-1" />}
                    Registrar
                  </Button>
                </div>

                {/* Timeline */}
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-2">
                    {atividades.map(a => {
                      const tipoConf = TIPO_ATIVIDADE[a.tipo] ?? { label: a.tipo, icon: "💡" };
                      return (
                        <div key={a.id} className={`flex gap-3 p-3 rounded-lg border ${a.origem_ia ? "bg-primary/10 border-primary/20" : "bg-card border-border"}`}>
                          <span className="text-lg flex-shrink-0 mt-0.5">{tipoConf.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-foreground truncate">{a.titulo}</p>
                              <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDateTime(a.created_at)}</span>
                            </div>
                            {a.descricao && <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>}
                            {a.resultado && (
                              <span className={`text-xs mt-1 inline-block px-1.5 py-0.5 rounded ${
                                a.resultado === "positivo" ? "bg-success/20 text-success" :
                                a.resultado === "negativo" ? "bg-destructive/20 text-destructive" :
                                "bg-muted text-muted-foreground"
                              }`}>
                                {a.resultado}
                              </span>
                            )}
                            {a.origem_ia && <span className="text-xs text-primary ml-1">🤖 IA</span>}
                          </div>
                        </div>
                      );
                    })}
                    {atividades.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-8">Nenhuma atividade registrada.</p>
                    )}
                  </div>
                )}
              </TabsContent>

              <PainelOperacionalCRM
                leadId={lead.id}
                colaboradores={colaboradores}
                podeGerenciarCarteira={podeGerenciarCarteira}
                onUpdated={onUpdate}
              />

              {/* ── Documentos ── */}
              <TabsContent value="documentos" className="mt-4 space-y-4">
                {/* Adicionar documento */}
                <div className="flex gap-2">
                  <Select onValueChange={adicionarDocumento}>
                    <SelectTrigger className="flex-1 text-sm">
                      <SelectValue placeholder="Adicionar documento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCS_TIPOS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lista de documentos */}
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-2">
                    {documentos.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          doc.status === "aprovado" ? "bg-success" :
                          doc.status === "recebido" ? "bg-primary" :
                          doc.status === "solicitado" ? "bg-warning" :
                          doc.status === "rejeitado" ? "bg-destructive" :
                          "bg-border"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{doc.nome}</p>
                          <p className="text-xs text-muted-foreground capitalize">{doc.status.replace("_", " ")}</p>
                        </div>
                        {doc.obrigatorio && (
                          <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">Obrigatório</span>
                        )}
                        <Select value={doc.status} onValueChange={v => atualizarDocumento(doc.id, v)}>
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="solicitado">Solicitado</SelectItem>
                            <SelectItem value="recebido">Recebido</SelectItem>
                            <SelectItem value="aprovado">Aprovado</SelectItem>
                            <SelectItem value="rejeitado">Rejeitado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    {documentos.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-8">Nenhum documento adicionado.</p>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── IA ── */}
              <TabsContent value="ia" className="mt-4 space-y-4">
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : qualificacoes.length === 0 ? (
                  <div className="text-center py-12">
                    <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhuma qualificação da IA ainda.</p>
                    <p className="text-muted-foreground text-xs mt-1">O agente qualificará este lead automaticamente via WhatsApp.</p>
                  </div>
                ) : (
                  qualificacoes.map(q => (
                    <div key={q.id} className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl border border-primary/20 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Brain className="h-5 w-5 text-primary" />
                          <span className="text-sm font-bold text-primary">Qualificação IA</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(q.created_at)}</span>
                      </div>

                      {/* Score e probabilidade */}
                      <div className="flex items-center gap-4 mb-3">
                        <div className="text-center">
                          <div className={`text-3xl font-black ${q.score >= 75 ? "text-success" : q.score >= 50 ? "text-warning" : "text-destructive"}`}>
                            {q.score}
                          </div>
                          <div className="text-xs text-muted-foreground">Score</div>
                        </div>
                        {q.probabilidade_conv != null && (
                          <div className="text-center">
                            <div className="text-3xl font-black text-primary">{q.probabilidade_conv}%</div>
                            <div className="text-xs text-muted-foreground">Prob. conversão</div>
                          </div>
                        )}
                        <div className="flex-1">
                          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${TEMPERATURA_CONFIG[q.temperatura]?.bg} ${TEMPERATURA_CONFIG[q.temperatura]?.color}`}>
                            {TEMPERATURA_CONFIG[q.temperatura]?.label ?? q.temperatura}
                          </span>
                          <p className="text-xs text-muted-foreground mt-1">→ {q.etapa_sugerida.replace("_", " ")}</p>
                        </div>
                      </div>

                      <p className="text-sm text-foreground mb-3">{q.resumo}</p>

                      {q.pontos_positivos && q.pontos_positivos.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-success mb-1">✅ Pontos positivos</p>
                          <ul className="space-y-0.5">
                            {q.pontos_positivos.map((p, i) => (
                              <li key={i} className="text-xs text-success flex gap-1"><span>•</span>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {q.pontos_atencao && q.pontos_atencao.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-warning mb-1">⚠️ Pontos de atenção</p>
                          <ul className="space-y-0.5">
                            {q.pontos_atencao.map((p, i) => (
                              <li key={i} className="text-xs text-warning flex gap-1"><span>•</span>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {q.documentos_faltando && q.documentos_faltando.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-destructive mb-1">📁 Documentos faltando</p>
                          <div className="flex flex-wrap gap-1">
                            {q.documentos_faltando.map((d, i) => (
                              <span key={i} className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.proxima_acao && (
                        <div className="mt-3 pt-3 border-t border-primary/20">
                          <p className="text-xs font-semibold text-primary">🎯 Próxima ação recomendada</p>
                          <p className="text-sm text-primary mt-0.5">{q.proxima_acao}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Página principal do CRM ──────────────────────────────────
export default function CRM() {
  const { colaborador } = useAuth();
  const [location] = useLocation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [followupsAtrasados, setFollowupsAtrasados] = useState<Lead[]>([]);
  const [followupsHojeLista, setFollowupsHojeLista] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTemp, setFiltroTemp] = useState("todos");
  const [filtroEscopo, setFiltroEscopo] = useState("meus");
  const [filtroResponsavel, setFiltroResponsavel] = useState("todos");
  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);
  const [visuKanban, setVisuKanban] = useState(true);
  const [showNovoLead, setShowNovoLead] = useState(false);
  const [etapaNovoLead, setEtapaNovoLead] = useState(ETAPA_FUNIL_DEFAULT);
  const [novoLead, setNovoLead] = useState({ nome: "", telefone: "", email: "", empresa: "", cpf_cnpj: "", produto_interesse: "", valor_solicitado: "" });
  const [salvando, setSalvando] = useState(false);
  const [metricas, setMetricas] = useState<Record<string, { total: number; valor: number }>>({});

  const podeVerTudo = Boolean(colaborador?.pode_ver_todos_leads || colaborador?.permissoes?.podeVerTudo);

  useEffect(() => {
    if (!podeVerTudo && filtroEscopo === "todos") {
      setFiltroEscopo("meus");
    }
    if (!podeVerTudo && filtroResponsavel !== "todos") {
      setFiltroResponsavel("todos");
    }
  }, [podeVerTudo, filtroEscopo, filtroResponsavel]);

  const carregarLeads = useCallback(async () => {
    setLoading(true);
    try {
      const scope = podeVerTudo ? filtroEscopo : "meus";
      const responsavelQuery = podeVerTudo && filtroResponsavel !== "todos"
        ? `&responsavel_id=${encodeURIComponent(filtroResponsavel)}`
        : "";
      const pipelineQuery = `?scope=${encodeURIComponent(scope)}${responsavelQuery}`;
      const [data, colaboradoresData, atrasadosData, hojeData] = await Promise.all([
        apiFetch(`/api/crm/pipeline${pipelineQuery}`),
        apiFetch("/api/colaboradores"),
        apiFetch(`/api/leads/atrasados${pipelineQuery}`),
        apiFetch(`/api/leads/hoje${pipelineQuery}`),
      ]);
      setLeads(data ?? []);
      setColaboradores(colaboradoresData ?? []);
      setFollowupsAtrasados(atrasadosData ?? []);
      setFollowupsHojeLista(hojeData ?? []);

      // Calcular métricas por etapa
      const m: Record<string, { total: number; valor: number }> = {};
      (data ?? []).forEach((l: { etapa_funil: string; valor_solicitado?: number }) => {
        if (!m[l.etapa_funil]) m[l.etapa_funil] = { total: 0, valor: 0 };
        m[l.etapa_funil].total++;
        m[l.etapa_funil].valor += l.valor_solicitado ?? 0;
      });
      setMetricas(m);
    } catch (err) {
      console.error(err);
      setLeads([]);
    }
    setLoading(false);
  }, [filtroEscopo, filtroResponsavel, podeVerTudo]);

  useEffect(() => { carregarLeads(); }, [carregarLeads]);

  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search).get("leadId");
    if (!leadId) return;

    const leadNaLista = leads.find((item) => item.id === leadId);
    if (leadNaLista) {
      setLeadSelecionado(leadNaLista);
      return;
    }

    apiFetch(`/api/crm/contexto/${encodeURIComponent(leadId)}`)
      .then((contexto) => {
        if (contexto?.lead?.id) {
          setLeadSelecionado(contexto.lead);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, [leads, location]);

  async function criarLead() {
    if (!novoLead.nome.trim() || !novoLead.telefone.trim()) {
      toast.error("Nome e telefone são obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      await apiFetch("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          nome: novoLead.nome,
          telefone: novoLead.telefone,
          email: novoLead.email || null,
          empresa: novoLead.empresa || null,
          cpf_cnpj: novoLead.cpf_cnpj || null,
          produto_interesse: novoLead.produto_interesse || null,
          valor_solicitado: novoLead.valor_solicitado ? parseFloat(novoLead.valor_solicitado) : null,
          etapa_funil: etapaNovoLead,
          canal_origem: "manual",
          status: etapaNovoLead,
          origem: "manual",
        }),
      });
      toast.success("Lead criado com sucesso!");
      setShowNovoLead(false);
      setNovoLead({ nome: "", telefone: "", email: "", empresa: "", cpf_cnpj: "", produto_interesse: "", valor_solicitado: "" });
      carregarLeads();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar lead.");
    }
    setSalvando(false);
  }

  // Filtrar leads
  const leadsFiltrados = leads.filter(l => {
    const matchBusca = !busca || [l.nome, l.telefone, l.empresa, l.email].some(
      v => v?.toLowerCase().includes(busca.toLowerCase())
    );
    const matchTemp = filtroTemp === "todos" || l.temperatura === filtroTemp;
    const matchResp = filtroResponsavel === "todos" || l.responsavel_id === filtroResponsavel;
    return matchBusca && matchTemp && matchResp;
  });

  // Agrupar por etapa para o Kanban
  const leadsPorEtapa = ETAPAS_FUNIL.reduce<Record<string, Lead[]>>((acc, e) => {
    acc[e.id] = leadsFiltrados.filter(l => l.etapa_funil === e.id);
    return acc;
  }, {});

  // Drag-and-drop
  const [leadArrastando, setLeadArrastando] = useState<Lead | null>(null);

  async function moverViaArrastar(novaEtapaId: string) {
    if (!leadArrastando || leadArrastando.etapa_funil === novaEtapaId) return;
    // Atualização otimista
    setLeads(prev => prev.map(l =>
      l.id === leadArrastando.id ? { ...l, etapa_funil: novaEtapaId } : l
    ));
    try {
      await apiFetch("/api/crm/mover-funil", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadArrastando.id, etapa_funil: novaEtapaId }),
      });
      toast.success(`Lead movido para ${ETAPAS_FUNIL.find(e => e.id === novaEtapaId)?.label ?? novaEtapaId}`);
    } catch {
      toast.error("Erro ao mover lead.");
      carregarLeads(); // reverter
    }
    setLeadArrastando(null);
  }

  // Métricas do topo
  const totalLeads = leadsFiltrados.length;
  const totalValor = leadsFiltrados.reduce((s, l) => s + (l.valor_solicitado ?? 0), 0);
  const leadQuentes = leadsFiltrados.filter(l => l.temperatura === "quente" || l.temperatura === "urgente").length;
  const leadsSemResponsavel = leads.filter(l => !l.responsavel_id).length;
  const followupHoje = followupsHojeLista.length;
  const followupAtrasado = followupsAtrasados.length;

  return (
    <Layout title="CRM — Pipeline de Leads">
      <div className="flex flex-col h-full bg-muted">

        {/* ── Topo: métricas ── */}
        <div className="bg-card border-b border-border px-6 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Cards de métricas */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Leads ativos</p>
                  <p className="text-lg font-bold text-foreground">{totalLeads}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-success/20 rounded-lg flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pipeline</p>
                  <p className="text-lg font-bold text-foreground">{fmt(totalValor)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-warning/20 rounded-lg flex items-center justify-center">
                  <Flame className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Leads quentes</p>
                  <p className="text-lg font-bold text-foreground">{leadQuentes}</p>
                </div>
              </div>
              {(followupHoje > 0 || followupAtrasado > 0) && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-destructive/20 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Atrasados</p>
                      <p className="text-lg font-bold text-destructive">{followupAtrasado}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-warning/20 rounded-lg flex items-center justify-center">
                      <Clock className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hoje</p>
                      <p className="text-lg font-bold text-warning">{followupHoje}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={carregarLeads} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setVisuKanban(!visuKanban)}>
                {visuKanban ? <BarChart2 className="h-4 w-4 mr-1" /> : <Target className="h-4 w-4 mr-1" />}
                {visuKanban ? "Lista" : "Kanban"}
              </Button>
              <Button size="sm" className="bg-primary hover:bg-primary" onClick={() => { setEtapaNovoLead(ETAPA_FUNIL_DEFAULT); setShowNovoLead(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Lead
              </Button>
            </div>
          </div>

          {/* Navegação e filtros */}
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/colaborador/fila" className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                  <ClipboardList className="h-4 w-4" />
                  Fila operacional
                  {leadsSemResponsavel > 0 && <Badge variant="secondary">{leadsSemResponsavel}</Badge>}
                </Link>
              <button
                type="button"
                onClick={() => {
                  setFiltroEscopo("meus");
                  setFiltroResponsavel("todos");
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filtroEscopo === "meus" ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}
              >
                <UserCheck className="h-4 w-4" />
                Minha carteira
              </button>
              {podeVerTudo && (
                <button
                  type="button"
                  onClick={() => setFiltroEscopo("todos")}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filtroEscopo === "todos" ? "border-success/20 bg-success/10 text-success" : "border-border bg-card text-foreground hover:bg-muted"}`}
                >
                  <Users className="h-4 w-4" />
                  Visão do time
                </button>
              )}
              {podeVerTudo && (
                <button
                  type="button"
                  onClick={() => setFiltroEscopo("sem_responsavel")}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filtroEscopo === "sem_responsavel" ? "border-warning/20 bg-warning/10 text-warning" : "border-border bg-card text-foreground hover:bg-muted"}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Sem responsável
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Buscar por nome, telefone, empresa..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <Select value={filtroTemp} onValueChange={setFiltroTemp}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="Temperatura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {Object.entries(TEMPERATURA_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {podeVerTudo && (
              <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
                <SelectTrigger className="w-52 h-8 text-sm">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os responsáveis</SelectItem>
                  {colaboradores.filter(c => c.ativo !== false).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

        {(followupAtrasado > 0 || followupHoje > 0) && (
          <div className="px-6 pt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-destructive/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-destructive/20 bg-destructive/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-destructive">Follow-ups atrasados</p>
                  <p className="text-xs text-destructive">Prioridade operacional imediata</p>
                </div>
                <Badge variant="destructive">{followupAtrasado}</Badge>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-red-50">
                {followupsAtrasados.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-muted-foreground">Nenhum follow-up atrasado.</div>
                ) : followupsAtrasados.slice(0, 8).map(lead => (
                  <button
                    key={lead.id}
                    className="w-full text-left px-4 py-3 hover:bg-destructive/10 transition-colors"
                    onClick={() => setLeadSelecionado(lead)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.responsavel_nome || "Sem responsável"}</p>
                      </div>
                      <span className="text-xs font-semibold text-destructive whitespace-nowrap">{fmtDateTime(lead.proximo_followup)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-warning/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-warning/20 bg-warning/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-warning">Follow-ups de hoje</p>
                  <p className="text-xs text-warning">Agenda do dia para o time</p>
                </div>
                <Badge variant="secondary">{followupHoje}</Badge>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-amber-50">
                {followupsHojeLista.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-muted-foreground">Nenhum follow-up agendado para hoje.</div>
                ) : followupsHojeLista.slice(0, 8).map(lead => (
                  <button
                    key={lead.id}
                    className="w-full text-left px-4 py-3 hover:bg-warning/10 transition-colors"
                    onClick={() => setLeadSelecionado(lead)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.responsavel_nome || "Sem responsável"}</p>
                      </div>
                      <span className="text-xs font-semibold text-warning whitespace-nowrap">{fmtDateTime(lead.proximo_followup)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Kanban ── */}
        {visuKanban ? (
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 min-w-max pb-4">
              {ETAPAS_FUNIL.map(etapa => (
                <KanbanColuna
                  key={etapa.id}
                  etapa={etapa}
                  leads={leadsPorEtapa[etapa.id] ?? []}
                  onCardClick={lead => setLeadSelecionado(lead)}
                  onAddLead={e => { setEtapaNovoLead(e as EtapaFunil); setShowNovoLead(true); }}
                  onDrop={novaEtapaId => moverViaArrastar(novaEtapaId)}
                  onDragStart={lead => setLeadArrastando(lead)}
                />
              ))}
            </div>
          </div>
        ) : (
          /* ── Lista ── */
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <LoadingState message="Carregando leads…" size="lg" className="py-16" />
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      {["Lead", "Contato", "Produto / Valor", "Etapa", "Score", "Follow-up", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leadsFiltrados.map(lead => {
                      const temp = lead.temperatura ? TEMPERATURA_CONFIG[lead.temperatura] : null;
                      const TempIcon = temp?.icon;
                      const etapa = ETAPAS_FUNIL.find(e => e.id === lead.etapa_funil);
                      return (
                        <tr key={lead.id} className="hover:bg-muted cursor-pointer" onClick={() => setLeadSelecionado(lead)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{lead.nome}</p>
                            {lead.empresa && <p className="text-xs text-muted-foreground">{lead.empresa}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-foreground">{lead.telefone}</p>
                            {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {lead.produto_interesse && <p className="text-foreground">{lead.produto_interesse}</p>}
                            {lead.valor_solicitado && <p className="text-xs text-muted-foreground">{fmt(lead.valor_solicitado)}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {etapa && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${etapa.color} ${etapa.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${etapa.dot}`} />
                                {etapa.label}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <ScoreBadge score={lead.score_efetivo ?? lead.score_ia} />
                              {temp && TempIcon && (
                                <span className={`${temp.color}`}><TempIcon className="h-3.5 w-3.5" /></span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {lead.proximo_followup ? (
                              <span className={`text-xs ${new Date(lead.proximo_followup) <= new Date() ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                                {fmtDateTime(lead.proximo_followup)}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {leadsFiltrados.length === 0 && (
                  <EmptyState preset="busca" title="Nenhum lead encontrado" description="Tente ajustar os filtros ou adicione um novo lead." className="py-12" />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Ficha do Lead ── */}
      {leadSelecionado && (
        <FichaLead
          lead={leadSelecionado}
          colaboradores={colaboradores}
          onClose={() => setLeadSelecionado(null)}
          onUpdate={() => { carregarLeads(); }}
        />
      )}

      {/* ── Modal Novo Lead ── */}
      <Dialog open={showNovoLead} onOpenChange={setShowNovoLead}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full mx-auto max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Novo Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etapa inicial</label>
              <Select value={etapaNovoLead} onValueChange={(value) => setEtapaNovoLead(value as EtapaFunil)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ETAPAS_FUNIL.filter(e => !["ganho","perdido"].includes(e.id)).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[
              { key: "nome", label: "Nome *", placeholder: "Nome completo" },
              { key: "telefone", label: "Telefone *", placeholder: "+55 61 9..." },
              { key: "email", label: "E-mail", placeholder: "email@exemplo.com" },
              { key: "empresa", label: "Empresa", placeholder: "Nome da empresa (PJ)" },
              { key: "cpf_cnpj", label: "CPF / CNPJ", placeholder: "000.000.000-00 ou 00.000.000/0001-00" },
              { key: "produto_interesse", label: "Produto de interesse", placeholder: "Capital de Giro, PRONAMPE..." },
              { key: "valor_solicitado", label: "Valor solicitado", placeholder: "0,00" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <Input
                  className="text-sm"
                  placeholder={placeholder}
                  value={(novoLead as Record<string, string>)[key]}
                  onChange={e => setNovoLead(p => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex-shrink-0 flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowNovoLead(false)}>Cancelar</Button>
            <Button onClick={criarLead} disabled={salvando} className="w-full sm:w-auto bg-primary hover:bg-primary">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
