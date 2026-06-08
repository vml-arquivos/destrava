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

// ─── Configurações ────────────────────────────────────────────
const ETAPA_FUNIL_STYLE: Record<string, { color: string; text: string; dot: string }> = {
  entrada:      { color: "bg-gray-100 border-gray-300",    text: "text-gray-700",   dot: "bg-gray-400" },
  triagem:      { color: "bg-slate-50 border-slate-300",   text: "text-slate-700",  dot: "bg-slate-500" },
  contato:      { color: "bg-blue-50 border-blue-300",     text: "text-blue-700",   dot: "bg-blue-500" },
  qualificacao: { color: "bg-cyan-50 border-cyan-300",     text: "text-cyan-700",   dot: "bg-cyan-500" },
  documentos:   { color: "bg-orange-50 border-orange-300", text: "text-orange-700", dot: "bg-orange-500" },
  analise:      { color: "bg-lime-50 border-lime-300",     text: "text-lime-700",   dot: "bg-lime-500" },
  proposta:     { color: "bg-violet-50 border-violet-300", text: "text-violet-700", dot: "bg-violet-500" },
  negociacao:   { color: "bg-yellow-50 border-yellow-300", text: "text-yellow-700", dot: "bg-yellow-500" },
  ganho:        { color: "bg-green-50 border-green-300",   text: "text-green-700",  dot: "bg-green-500" },
  perdido:      { color: "bg-red-50 border-red-300",       text: "text-red-700",    dot: "bg-red-400" },
  reativacao:   { color: "bg-amber-50 border-amber-300",   text: "text-amber-700",  dot: "bg-amber-500" },
  carteira:     { color: "bg-emerald-50 border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const ETAPAS_FUNIL = ETAPAS_FUNIL_VALIDAS.map((id) => ({
  id,
  label: ETAPAS_FUNIL_LABELS[id],
  ...ETAPA_FUNIL_STYLE[id],
}));

const TEMPERATURA_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  frio:    { label: "Frio",    color: "text-blue-600",  bg: "bg-blue-50",   icon: Snowflake },
  morno:   { label: "Morno",   color: "text-yellow-600",bg: "bg-yellow-50", icon: Thermometer },
  quente:  { label: "Quente",  color: "text-orange-600",bg: "bg-orange-50", icon: Flame },
  urgente: { label: "Urgente", color: "text-red-600",   bg: "bg-red-50",    icon: Zap },
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
  if (score == null) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 75 ? "text-green-600 bg-green-50" :
                score >= 50 ? "text-yellow-600 bg-yellow-50" :
                score >= 25 ? "text-orange-600 bg-orange-50" :
                              "text-red-600 bg-red-50";
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
      className="bg-white rounded-lg border border-gray-200 p-2.5 cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md transition-all group select-none"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{lead.nome}</p>
          {lead.empresa && (
            <p className="text-[11px] text-gray-400 truncate">{lead.empresa}</p>
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
        <span className="inline-block text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded truncate max-w-full mb-1.5">
          {lead.produto_interesse}
        </span>
      )}

      {/* Alertas + data */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {hasFollowup && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-red-600 bg-red-50 px-1 py-0.5 rounded">
              <Clock className="h-2.5 w-2.5" />FU
            </span>
          )}
          {docsAlert && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-orange-600 bg-orange-50 px-1 py-0.5 rounded">
              <AlertTriangle className="h-2.5 w-2.5" />Doc
            </span>
          )}
          {lead.dias_sem_contato != null && lead.dias_sem_contato > 7 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded">
              <Clock className="h-2.5 w-2.5" />{lead.dias_sem_contato}d
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-300 flex-shrink-0">{fmtDate(lead.created_at)}</span>
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
        isDragOver ? "border-blue-400 bg-blue-50 scale-[1.01] shadow-lg" : etapa.color
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
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-white/70 ${etapa.text}`}>
            {leads.length}
          </span>
        </div>
        <button
          onClick={() => onAddLead(etapa.id)}
          className={`p-0.5 rounded hover:bg-white/50 transition-colors ${etapa.text} opacity-60 hover:opacity-100`}
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
        <div className="mx-2 mb-1 border-2 border-dashed border-blue-400 rounded-lg py-2 text-center text-xs text-blue-500 font-medium">
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
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novaAtiv, setNovaAtiv] = useState({ tipo: "nota", titulo: "", descricao: "", resultado: "" });
  const [editando, setEditando] = useState(false);
  const [dadosEdit, setDadosEdit] = useState<Partial<Lead>>({});
  const [novaEtapa, setNovaEtapa] = useState<string>(normalizarEtapaFunil(lead.etapa_funil));
  const [novaTemp, setNovaTemp] = useState(lead.temperatura ?? "frio");

  // IA state
  const [iaResumo, setIaResumo] = useState<{ resumo: string; pontos_atencao: string[]; gerado_em: string } | null>(null);
  const [iaRecomendacoes, setIaRecomendacoes] = useState<Array<{ titulo: string; descricao: string; prioridade: string; tipo: string }>>([]);
  const [iaFollowup, setIaFollowup] = useState<{ mensagem: string; link_whatsapp?: string; assunto?: string } | null>(null);
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
    const [ativs, docs, quals] = await Promise.all([
      apiFetch(`/api/crm/atividades?lead_id=${lead.id}`),
      apiFetch(`/api/crm/documentos?lead_id=${lead.id}`),
      apiFetch(`/api/crm/qualificacoes?lead_id=${lead.id}`),
    ]);
    setAtividades(ativs ?? []);
    setDocumentos(docs ?? []);
    setQualificacoes(quals ?? []);
    setLoading(false);
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
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-900 to-blue-700 text-white flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {etapaAtual && (
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
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
              {lead.empresa && <p className="text-blue-200 text-sm">{lead.empresa}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lead.chatwoot_conv_id && (
                <a
                  href={`https://chatwoot.permupay.com.br/app/accounts/1/conversations/${lead.chatwoot_conv_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  Chatwoot
                </a>
              )}
              <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Contatos rápidos */}
          <div className="flex items-center gap-4 mt-3 text-sm text-blue-100">
            <a href={`tel:${lead.telefone}`} className="flex items-center gap-1 hover:text-white">
              <Phone className="h-3.5 w-3.5" />
              {lead.telefone}
            </a>
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-white">
                <Mail className="h-3.5 w-3.5" />
                {lead.email}
              </a>
            )}
            {lead.telefone && (
              <a
                href={`https://wa.me/${lead.telefone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white"
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
                  <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">{atividades.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="documentos">
                Documentos
                {(lead.docs_pendentes_obrig ?? 0) > 0 && (
                  <span className="ml-1 text-xs bg-orange-100 text-orange-700 px-1.5 rounded-full">!</span>
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
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    Posição no Funil
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Etapa</label>
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
                      <label className="text-xs text-gray-500 mb-1 block">Temperatura</label>
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
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-blue-600" />
                      Dados do Lead
                    </h3>
                    <div className="flex items-center gap-2">
                      {podeGerenciarCarteira && (
                        <Button variant="ghost" size="sm" onClick={excluirLead} disabled={salvando} className="text-red-600 hover:text-red-700">
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
                          <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                          <Input
                            className="h-8 text-sm"
                            defaultValue={((lead as unknown) as Record<string, unknown>)[key] as string ?? ""}
                            onChange={e => setDadosEdit(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Valor Solicitado</label>
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
                        <label className="text-xs text-gray-500 mb-1 block">Prazo (meses)</label>
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          defaultValue={lead.prazo_meses ?? ""}
                          onChange={e => setDadosEdit(prev => ({ ...prev, prazo_meses: parseInt(e.target.value) }))}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Responsável</label>
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
                          <p className="text-[11px] text-amber-600 mt-1">Somente perfis de gestão podem reatribuir leads entre agentes.</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Follow-up</label>
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
                          <span className="text-gray-400 text-xs">{k}</span>
                          <p className="text-gray-800 font-medium text-xs mt-0.5">{v as string}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* IA Actions */}
                <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl border border-violet-200 p-4">
                  <h3 className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Assistente IA
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-start gap-2 bg-white border-violet-200 hover:bg-violet-50 text-violet-700"
                      onClick={gerarResumoIA}
                      disabled={iaLoading !== null}
                    >
                      {iaLoading === "resumo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                      Gerar Resumo do Lead
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-start gap-2 bg-white border-violet-200 hover:bg-violet-50 text-violet-700"
                      onClick={gerarRecomendacoesIA}
                      disabled={iaLoading !== null}
                    >
                      {iaLoading === "recomendacoes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                      Obter Recomendações
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-start gap-2 bg-white border-violet-200 hover:bg-violet-50 text-violet-700"
                      onClick={() => setShowIaModal("followup")}
                      disabled={iaLoading !== null}
                    >
                      {iaLoading === "followup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Gerar Mensagem Follow-up
                    </Button>
                  </div>
                  {lead.resumo_ia && (
                    <div className="mt-3 pt-3 border-t border-violet-200">
                      <p className="text-xs text-violet-600 font-medium mb-1">Análise anterior:</p>
                      <p className="text-xs text-violet-700">{lead.resumo_ia}</p>
                    </div>
                  )}
                </div>

                {/* Modal: Resumo IA */}
                <Dialog open={showIaModal === "resumo"} onOpenChange={o => !o && setShowIaModal(null)}>
                  <DialogContent className="max-w-lg w-[95vw]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-violet-600" />
                        Resumo do Lead — IA
                      </DialogTitle>
                    </DialogHeader>
                    {iaResumo && (
                      <div className="space-y-4">
                        <div className="bg-violet-50 rounded-lg p-4">
                          <p className="text-sm text-gray-800 leading-relaxed">{iaResumo.resumo}</p>
                        </div>
                        {iaResumo.pontos_atencao?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-orange-700 mb-2">Pontos de Atenção:</p>
                            <ul className="space-y-1">
                              {iaResumo.pontos_atencao.map((p, i) => (
                                <li key={i} className="text-xs text-orange-600 flex items-start gap-1.5">
                                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />{p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-gray-400">Gerado em {new Date(iaResumo.gerado_em).toLocaleString("pt-BR")}</p>
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
                        <Target className="h-5 w-5 text-violet-600" />
                        Recomendações — IA
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {iaRecomendacoes.map((r, i) => {
                        const prioColor = r.prioridade === "alta" ? "border-red-300 bg-red-50" : r.prioridade === "media" ? "border-yellow-300 bg-yellow-50" : "border-green-300 bg-green-50";
                        const prioText = r.prioridade === "alta" ? "text-red-700" : r.prioridade === "media" ? "text-yellow-700" : "text-green-700";
                        return (
                          <div key={i} className={`rounded-lg border p-3 ${prioColor}`}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-semibold text-gray-800">{r.titulo}</p>
                              <span className={`text-xs font-bold uppercase ${prioText}`}>{r.prioridade}</span>
                            </div>
                            <p className="text-xs text-gray-600">{r.descricao}</p>
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
                        <MessageSquare className="h-5 w-5 text-violet-600" />
                        Mensagem de Follow-up — IA
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
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
                          <label className="text-xs text-gray-500 mb-1 block">Canal</label>
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
                              <p className="text-xs text-gray-500 mb-1">Assunto:</p>
                              <p className="text-sm font-medium text-gray-800">{iaFollowup.assunto}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Mensagem:</p>
                            <Textarea
                              className="text-sm resize-none"
                              rows={6}
                              value={iaFollowup.mensagem}
                              onChange={e => setIaFollowup(p => p ? { ...p, mensagem: e.target.value } : null)}
                            />
                          </div>
                          <div className="flex gap-2">
                            {iaFollowup.link_whatsapp && (
                              <a
                                href={iaFollowup.link_whatsapp}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1"
                              >
                                <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 gap-2">
                                  <Phone className="h-4 w-4" /> Abrir WhatsApp
                                </Button>
                              </a>
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
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Registrar Atividade</h3>
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
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                ) : (
                  <div className="space-y-2">
                    {atividades.map(a => {
                      const tipoConf = TIPO_ATIVIDADE[a.tipo] ?? { label: a.tipo, icon: "💡" };
                      return (
                        <div key={a.id} className={`flex gap-3 p-3 rounded-lg border ${a.origem_ia ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}`}>
                          <span className="text-lg flex-shrink-0 mt-0.5">{tipoConf.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">{a.titulo}</p>
                              <span className="text-xs text-gray-400 flex-shrink-0">{fmtDateTime(a.created_at)}</span>
                            </div>
                            {a.descricao && <p className="text-xs text-gray-600 mt-0.5">{a.descricao}</p>}
                            {a.resultado && (
                              <span className={`text-xs mt-1 inline-block px-1.5 py-0.5 rounded ${
                                a.resultado === "positivo" ? "bg-green-100 text-green-700" :
                                a.resultado === "negativo" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-600"
                              }`}>
                                {a.resultado}
                              </span>
                            )}
                            {a.origem_ia && <span className="text-xs text-blue-600 ml-1">🤖 IA</span>}
                          </div>
                        </div>
                      );
                    })}
                    {atividades.length === 0 && (
                      <p className="text-center text-sm text-gray-400 py-8">Nenhuma atividade registrada.</p>
                    )}
                  </div>
                )}
              </TabsContent>

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
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                ) : (
                  <div className="space-y-2">
                    {documentos.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          doc.status === "aprovado" ? "bg-green-500" :
                          doc.status === "recebido" ? "bg-blue-500" :
                          doc.status === "solicitado" ? "bg-yellow-500" :
                          doc.status === "rejeitado" ? "bg-red-500" :
                          "bg-gray-300"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{doc.nome}</p>
                          <p className="text-xs text-gray-500 capitalize">{doc.status.replace("_", " ")}</p>
                        </div>
                        {doc.obrigatorio && (
                          <span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">Obrigatório</span>
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
                      <p className="text-center text-sm text-gray-400 py-8">Nenhum documento adicionado.</p>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── IA ── */}
              <TabsContent value="ia" className="mt-4 space-y-4">
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                ) : qualificacoes.length === 0 ? (
                  <div className="text-center py-12">
                    <Brain className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Nenhuma qualificação da IA ainda.</p>
                    <p className="text-gray-400 text-xs mt-1">O agente qualificará este lead automaticamente via WhatsApp.</p>
                  </div>
                ) : (
                  qualificacoes.map(q => (
                    <div key={q.id} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Brain className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-bold text-blue-900">Qualificação IA</span>
                        </div>
                        <span className="text-xs text-gray-500">{fmtDateTime(q.created_at)}</span>
                      </div>

                      {/* Score e probabilidade */}
                      <div className="flex items-center gap-4 mb-3">
                        <div className="text-center">
                          <div className={`text-3xl font-black ${q.score >= 75 ? "text-green-600" : q.score >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                            {q.score}
                          </div>
                          <div className="text-xs text-gray-500">Score</div>
                        </div>
                        {q.probabilidade_conv != null && (
                          <div className="text-center">
                            <div className="text-3xl font-black text-blue-600">{q.probabilidade_conv}%</div>
                            <div className="text-xs text-gray-500">Prob. conversão</div>
                          </div>
                        )}
                        <div className="flex-1">
                          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${TEMPERATURA_CONFIG[q.temperatura]?.bg} ${TEMPERATURA_CONFIG[q.temperatura]?.color}`}>
                            {TEMPERATURA_CONFIG[q.temperatura]?.label ?? q.temperatura}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">→ {q.etapa_sugerida.replace("_", " ")}</p>
                        </div>
                      </div>

                      <p className="text-sm text-gray-700 mb-3">{q.resumo}</p>

                      {q.pontos_positivos && q.pontos_positivos.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-green-700 mb-1">✅ Pontos positivos</p>
                          <ul className="space-y-0.5">
                            {q.pontos_positivos.map((p, i) => (
                              <li key={i} className="text-xs text-green-700 flex gap-1"><span>•</span>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {q.pontos_atencao && q.pontos_atencao.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-orange-700 mb-1">⚠️ Pontos de atenção</p>
                          <ul className="space-y-0.5">
                            {q.pontos_atencao.map((p, i) => (
                              <li key={i} className="text-xs text-orange-700 flex gap-1"><span>•</span>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {q.documentos_faltando && q.documentos_faltando.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-red-700 mb-1">📁 Documentos faltando</p>
                          <div className="flex flex-wrap gap-1">
                            {q.documentos_faltando.map((d, i) => (
                              <span key={i} className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.proxima_acao && (
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <p className="text-xs font-semibold text-blue-800">🎯 Próxima ação recomendada</p>
                          <p className="text-sm text-blue-700 mt-0.5">{q.proxima_acao}</p>
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
      <div className="flex flex-col h-full bg-gray-50">

        {/* ── Topo: métricas ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Cards de métricas */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Leads ativos</p>
                  <p className="text-lg font-bold text-gray-900">{totalLeads}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pipeline</p>
                  <p className="text-lg font-bold text-gray-900">{fmt(totalValor)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Flame className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Leads quentes</p>
                  <p className="text-lg font-bold text-gray-900">{leadQuentes}</p>
                </div>
              </div>
              {(followupHoje > 0 || followupAtrasado > 0) && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Atrasados</p>
                      <p className="text-lg font-bold text-red-600">{followupAtrasado}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Clock className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Hoje</p>
                      <p className="text-lg font-bold text-amber-600">{followupHoje}</p>
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
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setEtapaNovoLead(ETAPA_FUNIL_DEFAULT); setShowNovoLead(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Lead
              </Button>
            </div>
          </div>

          {/* Navegação e filtros */}
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/colaborador/fila">
                <a className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
                  <ClipboardList className="h-4 w-4" />
                  Fila operacional
                  {leadsSemResponsavel > 0 && <Badge variant="secondary">{leadsSemResponsavel}</Badge>}
                </a>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setFiltroEscopo("meus");
                  setFiltroResponsavel("todos");
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filtroEscopo === "meus" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                <UserCheck className="h-4 w-4" />
                Minha carteira
              </button>
              {podeVerTudo && (
                <button
                  type="button"
                  onClick={() => setFiltroEscopo("todos")}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filtroEscopo === "todos" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  <Users className="h-4 w-4" />
                  Visão do time
                </button>
              )}
              {podeVerTudo && (
                <button
                  type="button"
                  onClick={() => setFiltroEscopo("sem_responsavel")}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filtroEscopo === "sem_responsavel" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Sem responsável
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-red-800">Follow-ups atrasados</p>
                  <p className="text-xs text-red-600">Prioridade operacional imediata</p>
                </div>
                <Badge variant="destructive">{followupAtrasado}</Badge>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-red-50">
                {followupsAtrasados.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-gray-500">Nenhum follow-up atrasado.</div>
                ) : followupsAtrasados.slice(0, 8).map(lead => (
                  <button
                    key={lead.id}
                    className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors"
                    onClick={() => setLeadSelecionado(lead)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                        <p className="text-xs text-gray-500 truncate">{lead.responsavel_nome || "Sem responsável"}</p>
                      </div>
                      <span className="text-xs font-semibold text-red-600 whitespace-nowrap">{fmtDateTime(lead.proximo_followup)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-800">Follow-ups de hoje</p>
                  <p className="text-xs text-amber-600">Agenda do dia para o time</p>
                </div>
                <Badge variant="secondary">{followupHoje}</Badge>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-amber-50">
                {followupsHojeLista.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-gray-500">Nenhum follow-up agendado para hoje.</div>
                ) : followupsHojeLista.slice(0, 8).map(lead => (
                  <button
                    key={lead.id}
                    className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors"
                    onClick={() => setLeadSelecionado(lead)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                        <p className="text-xs text-gray-500 truncate">{lead.responsavel_nome || "Sem responsável"}</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">{fmtDateTime(lead.proximo_followup)}</span>
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
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Lead", "Contato", "Produto / Valor", "Etapa", "Score", "Follow-up", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leadsFiltrados.map(lead => {
                      const temp = lead.temperatura ? TEMPERATURA_CONFIG[lead.temperatura] : null;
                      const TempIcon = temp?.icon;
                      const etapa = ETAPAS_FUNIL.find(e => e.id === lead.etapa_funil);
                      return (
                        <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setLeadSelecionado(lead)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{lead.nome}</p>
                            {lead.empresa && <p className="text-xs text-gray-500">{lead.empresa}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-gray-700">{lead.telefone}</p>
                            {lead.email && <p className="text-xs text-gray-500">{lead.email}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {lead.produto_interesse && <p className="text-gray-700">{lead.produto_interesse}</p>}
                            {lead.valor_solicitado && <p className="text-xs text-gray-500">{fmt(lead.valor_solicitado)}</p>}
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
                              <span className={`text-xs ${new Date(lead.proximo_followup) <= new Date() ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                                {fmtDateTime(lead.proximo_followup)}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
              <Plus className="h-5 w-5 text-blue-600" />
              Novo Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Etapa inicial</label>
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
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
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
            <Button onClick={criarLead} disabled={salvando} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
