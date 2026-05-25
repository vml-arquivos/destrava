import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "@/lib/currency";
import { useCNPJLookup } from "../../hooks/useCNPJLookup";
import { formatCNPJ as fmtCNPJBrasil, cleanDigits, type CNPJSocio } from "../../utils/cnpj";
import {
  Building2, Plus, Search, Phone, Mail, Globe, MapPin,
  Edit2, Trash2, ChevronRight, Loader2, X, Save,
  User, DollarSign, CreditCard, Tag, RefreshCw,
  CheckCircle, XCircle, Clock, Star, TrendingUp,
  FileText, ChevronDown, ChevronUp,
  Calculator, AlertTriangle, ShieldCheck, ShieldAlert, ShieldOff,
  TrendingDown, Activity, BarChart2,
  Paperclip, Upload, MessageSquare, History, Bell, Send, PlusCircle,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Empresa {
  id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  email?: string;
  telefone?: string;
  whatsapp?: string;
  site?: string;
  segmento?: string;
  porte?: "mei" | "me" | "epp" | "medio" | "grande";
  faturamento_anual?: number;
  numero_funcionarios?: number;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  responsavel_nome?: string;
  responsavel_cpf?: string;
  responsavel_cargo?: string;
  responsavel_telefone?: string;
  responsavel_email?: string;
  banco_principal?: string;
  agencia?: string;
  conta?: string;
  limite_credito_atual?: number;
  score_serasa?: number;
  score_spc?: number;
  status: "ativo" | "inativo" | "prospecto" | "cliente" | "ex_cliente";
  origem?: string;
  tags?: string[];
  observacoes?: string;
  captador_id?: string;
  analista_id?: string;
  captador_nome?: string;
  analista_nome?: string;
  natureza_juridica?: string;
  cnae_principal?: string;
  cnae_descricao?: string;
  cnaes_secundarios?: Array<{ codigo?: number | string; descricao?: string }>;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  motivo_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  capital_social?: number;
  matriz_filial?: string;
  dados_receita?: Record<string, any>;
  qsa?: CNPJSocio[];
  created_at: string;
  updated_at: string;
}

type FormEmpresa = Omit<Empresa, "id" | "created_at" | "updated_at">;

const FORM_VAZIO: FormEmpresa = {
  razao_social: "",
  nome_fantasia: "",
  cnpj: "",
  inscricao_estadual: "",
  email: "",
  telefone: "",
  whatsapp: "",
  site: "",
  segmento: "",
  porte: "mei",
  faturamento_anual: undefined,
  numero_funcionarios: undefined,
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  responsavel_nome: "",
  responsavel_cpf: "",
  responsavel_cargo: "",
  responsavel_telefone: "",
  responsavel_email: "",
  banco_principal: "",
  agencia: "",
  conta: "",
  limite_credito_atual: undefined,
  score_serasa: undefined,
  score_spc: undefined,
  status: "ativo",
  origem: "manual",
  tags: [],
  observacoes: "",
  captador_id: undefined,
  analista_id: undefined,
  natureza_juridica: "",
  cnae_principal: "",
  cnae_descricao: "",
  cnaes_secundarios: [],
  descricao_situacao_cadastral: "",
  data_situacao_cadastral: "",
  motivo_situacao_cadastral: "",
  data_inicio_atividade: "",
  capital_social: undefined,
  matriz_filial: "",
  dados_receita: {},
  qsa: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v?: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const formatCNPJ = (v: string) => {
  const n = v.replace(/\D/g, "").slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
};

const formatTel = (v: string) => {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : "";
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ativo:      { label: "Ativo",      color: "bg-green-100 text-green-700",   icon: <CheckCircle className="w-3 h-3" /> },
  inativo:    { label: "Inativo",    color: "bg-gray-100 text-gray-500",     icon: <XCircle className="w-3 h-3" /> },
  prospecto:  { label: "Prospecto",  color: "bg-blue-100 text-blue-700",     icon: <Star className="w-3 h-3" /> },
  cliente:    { label: "Cliente",    color: "bg-purple-100 text-purple-700", icon: <TrendingUp className="w-3 h-3" /> },
  ex_cliente: { label: "Ex-cliente", color: "bg-orange-100 text-orange-700", icon: <Clock className="w-3 h-3" /> },
};

const PORTE_CONFIG: Record<string, string> = {
  mei:    "MEI",
  me:     "ME",
  epp:    "EPP",
  medio:  "Médio Porte",
  grande: "Grande Porte",
};

const SEGMENTOS = [
  "Comércio", "Serviços", "Indústria", "Tecnologia", "Saúde",
  "Educação", "Construção Civil", "Agronegócio", "Transporte",
  "Alimentação", "Varejo", "Atacado", "Outro",
];

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

// ─── Componente Secao (FORA do principal para evitar remount ao digitar) ──────

function Secao({ id, titulo, icon, children, secaoAberta, setSecaoAberta }: {
  id: string;
  titulo: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  secaoAberta: string;
  setSecaoAberta: (v: string) => void;
}) {
  const aberta = secaoAberta === id;
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setSecaoAberta(aberta ? "" : id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700"
      >
        <span className="flex items-center gap-2">{icon}{titulo}</span>
        {aberta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {aberta && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Função de Score/Risco (fora do componente para estabilidade) ─────────────

function calcularScore(e: Empresa): { score: number; risco: "baixo" | "medio" | "alto" | "critico"; indicadores: string[] } {
  let pontos = 0;
  const indicadores: string[] = [];

  if (e.faturamento_anual) {
    if (e.faturamento_anual >= 1_000_000) { pontos += 30; indicadores.push("Faturamento acima de R$ 1M"); }
    else if (e.faturamento_anual >= 360_000) { pontos += 20; indicadores.push("Faturamento acima de R$ 360k"); }
    else if (e.faturamento_anual >= 120_000) { pontos += 10; indicadores.push("Faturamento acima de R$ 120k"); }
    else { pontos -= 5; indicadores.push("Faturamento abaixo de R$ 120k"); }
  } else { indicadores.push("Faturamento não informado"); }

  if (e.score_serasa) {
    if (e.score_serasa >= 700) { pontos += 25; indicadores.push(`Serasa ${e.score_serasa} — Bom`); }
    else if (e.score_serasa >= 500) { pontos += 15; indicadores.push(`Serasa ${e.score_serasa} — Regular`); }
    else if (e.score_serasa >= 300) { pontos += 5; indicadores.push(`Serasa ${e.score_serasa} — Baixo`); }
    else { pontos -= 15; indicadores.push(`Serasa ${e.score_serasa} — Crítico`); }
  } else { indicadores.push("Score Serasa não informado"); }

  if (e.score_spc) {
    if (e.score_spc >= 700) { pontos += 15; indicadores.push(`SPC ${e.score_spc} — Bom`); }
    else if (e.score_spc >= 400) { pontos += 8; indicadores.push(`SPC ${e.score_spc} — Regular`); }
    else { pontos -= 10; indicadores.push(`SPC ${e.score_spc} — Baixo`); }
  }

  if (e.porte === "grande") { pontos += 10; }
  else if (e.porte === "medio") { pontos += 7; }
  else if (e.porte === "epp") { pontos += 5; }
  else if (e.porte === "me") { pontos += 3; }

  if (e.limite_credito_atual && e.limite_credito_atual > 0) {
    pontos += 10;
    indicadores.push("Possui limite de crédito ativo");
  }

  if (e.status === "cliente") { pontos += 10; indicadores.push("Já é cliente ativo"); }
  else if (e.status === "ex_cliente") { pontos -= 5; indicadores.push("Ex-cliente"); }

  const campos = [e.cnpj, e.email, e.telefone, e.responsavel_nome, e.cidade];
  const preenchidos = campos.filter(Boolean).length;
  pontos += preenchidos * 2;
  if (preenchidos < 3) indicadores.push("Cadastro incompleto");

  const scoreNorm = Math.max(0, Math.min(100, pontos));
  const risco: "baixo" | "medio" | "alto" | "critico" =
    scoreNorm >= 70 ? "baixo" :
    scoreNorm >= 50 ? "medio" :
    scoreNorm >= 30 ? "alto" : "critico";

  return { score: scoreNorm, risco, indicadores };
}

// ─── Tipos para Followup e Histórico ────────────────────────────────────────
interface EmpresaFollowup {
  id: string;
  empresa_id: string;
  tipo: string;
  titulo: string;
  descricao?: string;
  data_agendada?: string;
  concluido: boolean;
  created_at: string;
}
interface EmpresaHistorico {
  id: string;
  empresa_id: string;
  tipo: string;
  descricao: string;
  autor?: string;
  created_at: string;
}
interface EmpresaDocumento {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: string;
  tamanho?: number;
  url?: string;
  created_at: string;
}


function InfoReadOnly({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <input
        value={value === null || value === undefined ? "" : String(value)}
        readOnly
        className={`w-full border rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700 cursor-not-allowed ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function SocioCardReceita({ socio }: { socio: CNPJSocio }) {
  const initial = socio.nome_socio?.charAt(0) || "?";
  const qual = socio.descricao_qualificacao_socio || socio.qualificacao_socio || "Sócio";
  const cpf = socio.cnpj_cpf_do_socio || "";
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
      <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">{initial}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 truncate">{socio.nome_socio || "Sócio sem nome"}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">{qual}</span>
          {cpf && <span className="text-xs text-slate-500 font-mono">CPF/CNPJ: {cpf}</span>}
        </div>
        {socio.data_entrada_sociedade && (
          <p className="text-xs text-slate-400 mt-1">Entrada na sociedade: {new Date(socio.data_entrada_sociedade).toLocaleDateString("pt-BR")}</p>
        )}
      </div>
    </div>
  );
}

export default function Empresas() {
  const [, setLocation] = useLocation();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<"dados" | "documentos" | "followup" | "historico">("dados");
  const [followups, setFollowups] = useState<EmpresaFollowup[]>([]);
  const [historico, setHistorico] = useState<EmpresaHistorico[]>([]);
  const [documentos, setDocumentos] = useState<EmpresaDocumento[]>([]);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [novaObs, setNovaObs] = useState("");
  const [novoFollowup, setNovoFollowup] = useState({ titulo: "", tipo: "ligacao", data_agendada: "", descricao: "" });
  const [adicionandoFollowup, setAdicionandoFollowup] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [form, setForm] = useState<FormEmpresa>({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState("");
  const [secaoAberta, setSecaoAberta] = useState<string>("basico");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);
  const [captacao, setCaptacao] = useState<{ id: string; nome: string; cargo: string }[]>([]);
  const [atendimento, setAtendimento] = useState<{ id: string; nome: string; cargo: string }[]>([]);
  const captadores = captacao;
  const analistas = atendimento;

  const [etapaModal, setEtapaModal] = useState<"cnpj" | "form">("cnpj");
  const [cnpjInput, setCnpjInput] = useState("");
  const [sociosReceita, setSociosReceita] = useState<CNPJSocio[]>([]);
  const { lookup: cnpjLookup, status: cnpjStatus, error: cnpjError, reset: cnpjReset } = useCNPJLookup();

  // ── CORREÇÃO: fallback sem condições vazias no .filter() ──────────────────
  useEffect(() => {
    apiFetch("/api/colaboradores/para-empresa")
      .then((data: any) => {
        setCaptacao(data?.captacao || []);
        setAtendimento(data?.atendimento || []);
      })
      .catch(() => {
        // Fallback: usar rota geral — todos os ativos ficam disponíveis em ambas as listas
        apiFetch("/api/colaboradores")
          .then((data: any[]) => {
            const ativos = (data || []).filter((c: any) => c.ativo);
            setCaptacao(ativos);
            setAtendimento(ativos);
          })
          .catch(() => {});
      });
  }, []);

  // ─── Carregar empresas ────────────────────────────────────────────────────
  const carregarEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set("busca", busca.trim());
      if (filtroStatus !== "todos") params.set("status", filtroStatus);
      const data = await apiFetch(`/api/empresas?${params.toString()}`);
      setEmpresas(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erro ao carregar empresas.");
    }
    setLoading(false);
  }, [busca, filtroStatus]);

  useEffect(() => {
    const t = setTimeout(carregarEmpresas, busca ? 400 : 0);
    return () => clearTimeout(t);
  }, [carregarEmpresas]);

  useEffect(() => {
    if (!empresaSelecionada) return;
    setAbaAtiva("dados");
    setFollowups([]);
    setHistorico([]);
    setDocumentos([]);
    setLoadingDetalhe(true);
    Promise.all([
      apiFetch(`/api/empresas/${empresaSelecionada.id}/followups`).catch(() => []),
      apiFetch(`/api/empresas/${empresaSelecionada.id}/historico`).catch(() => []),
      apiFetch(`/api/empresas/${empresaSelecionada.id}/documentos`).catch(() => []),
    ]).then(([fups, hist, docs]) => {
      setFollowups(Array.isArray(fups) ? fups : []);
      setHistorico(Array.isArray(hist) ? hist : []);
      setDocumentos(Array.isArray(docs) ? docs : []);
    }).finally(() => setLoadingDetalhe(false));
  }, [empresaSelecionada?.id]);

  async function adicionarHistorico(descricao: string, tipo = "nota") {
    if (!empresaSelecionada || !descricao.trim()) return;
    try {
      await apiFetch(`/api/empresas/${empresaSelecionada.id}/historico`, {
        method: "POST", body: JSON.stringify({ tipo, descricao }),
      });
      const hist = await apiFetch(`/api/empresas/${empresaSelecionada.id}/historico`).catch(() => []);
      setHistorico(Array.isArray(hist) ? hist : []);
      setNovaObs("");
      toast.success("Nota adicionada.");
    } catch { toast.error("Erro ao adicionar nota."); }
  }

  async function salvarFollowup() {
    if (!empresaSelecionada || !novoFollowup.titulo.trim()) return;
    try {
      await apiFetch(`/api/empresas/${empresaSelecionada.id}/followups`, {
        method: "POST", body: JSON.stringify(novoFollowup),
      });
      const fups = await apiFetch(`/api/empresas/${empresaSelecionada.id}/followups`).catch(() => []);
      setFollowups(Array.isArray(fups) ? fups : []);
      setNovoFollowup({ titulo: "", tipo: "ligacao", data_agendada: "", descricao: "" });
      setAdicionandoFollowup(false);
      toast.success("Follow-up agendado.");
    } catch { toast.error("Erro ao salvar follow-up."); }
  }

  async function concluirFollowup(id: string) {
    if (!empresaSelecionada) return;
    try {
      await apiFetch(`/api/empresas/${empresaSelecionada.id}/followups/${id}/concluir`, { method: "PATCH" });
      setFollowups(prev => prev.map(f => f.id === id ? { ...f, concluido: true } : f));
      adicionarHistorico(`Follow-up concluído`, "followup");
    } catch { toast.error("Erro ao concluir follow-up."); }
  }

  // ─── Formulário ───────────────────────────────────────────────────────────

  function abrirNova() {
    setEditando(null);
    setForm({ ...FORM_VAZIO });
    setErros({});
    setSecaoAberta("basico");
    setTagInput("");
    setEtapaModal("cnpj");
    setCnpjInput("");
    setSociosReceita([]);
    cnpjReset();
    setModalAberto(true);
  }

  function abrirEditar(emp: Empresa) {
    setEditando(emp);
    setForm({
      razao_social: emp.razao_social,
      nome_fantasia: emp.nome_fantasia || "",
      cnpj: emp.cnpj || "",
      inscricao_estadual: emp.inscricao_estadual || "",
      email: emp.email || "",
      telefone: emp.telefone || "",
      whatsapp: emp.whatsapp || "",
      site: emp.site || "",
      segmento: emp.segmento || "",
      porte: emp.porte || "mei",
      faturamento_anual: emp.faturamento_anual,
      numero_funcionarios: emp.numero_funcionarios,
      cep: emp.cep || "",
      logradouro: emp.logradouro || "",
      numero: emp.numero || "",
      complemento: emp.complemento || "",
      bairro: emp.bairro || "",
      cidade: emp.cidade || "",
      estado: emp.estado || "",
      responsavel_nome: emp.responsavel_nome || "",
      responsavel_cpf: emp.responsavel_cpf || "",
      responsavel_cargo: emp.responsavel_cargo || "",
      responsavel_telefone: emp.responsavel_telefone || "",
      responsavel_email: emp.responsavel_email || "",
      banco_principal: emp.banco_principal || "",
      agencia: emp.agencia || "",
      conta: emp.conta || "",
      limite_credito_atual: emp.limite_credito_atual,
      score_serasa: emp.score_serasa,
      score_spc: emp.score_spc,
      status: emp.status,
      origem: emp.origem || "manual",
      tags: emp.tags || [],
      observacoes: emp.observacoes || "",
      captador_id: emp.captador_id || undefined,
      analista_id: emp.analista_id || undefined,
      natureza_juridica: emp.natureza_juridica || "",
      cnae_principal: emp.cnae_principal || "",
      cnae_descricao: emp.cnae_descricao || "",
      cnaes_secundarios: emp.cnaes_secundarios || [],
      descricao_situacao_cadastral: emp.descricao_situacao_cadastral || "",
      data_situacao_cadastral: emp.data_situacao_cadastral || "",
      motivo_situacao_cadastral: emp.motivo_situacao_cadastral || "",
      data_inicio_atividade: emp.data_inicio_atividade || "",
      capital_social: emp.capital_social,
      matriz_filial: emp.matriz_filial || "",
      dados_receita: emp.dados_receita || {},
      qsa: emp.qsa || [],
    });
    setErros({});
    setSecaoAberta("basico");
    setTagInput("");
    setEtapaModal("form");
    setCnpjInput(emp.cnpj || "");
    setSociosReceita(emp.qsa || []);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setForm({ ...FORM_VAZIO });
    setErros({});
    setEtapaModal("cnpj");
    setCnpjInput("");
    setSociosReceita([]);
    cnpjReset();
  }

  function set(k: keyof FormEmpresa, v: any) {
    setForm(prev => ({ ...prev, [k]: v }));
    setErros(prev => ({ ...prev, [k]: "" }));
  }

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.razao_social.trim()) e.razao_social = "Obrigatório";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function handleSalvar() {
    if (!validar()) return;
    setSalvando(true);
    try {
      const payload = {
        ...form,
        faturamento_anual: form.faturamento_anual || null,
        numero_funcionarios: form.numero_funcionarios || null,
        limite_credito_atual: form.limite_credito_atual || null,
        score_serasa: form.score_serasa || null,
        score_spc: form.score_spc || null,
        capital_social: form.capital_social || null,
        cnaes_secundarios: form.cnaes_secundarios || [],
        qsa: sociosReceita.length > 0 ? sociosReceita : (form.qsa || []),
        dados_receita: form.dados_receita || {},
      };
      if (editando) {
        await apiFetch(`/api/empresas/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Empresa atualizada com sucesso!");
      } else {
        await apiFetch("/api/empresas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Empresa cadastrada com sucesso!");
      }
      fecharModal();
      carregarEmpresas();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar empresa.");
    }
    setSalvando(false);
  }

  async function handleExcluir(id: string) {
    try {
      await apiFetch(`/api/empresas/${id}`, { method: "DELETE" });
      toast.success("Empresa excluída.");
      setConfirmandoExclusao(null);
      if (empresaSelecionada?.id === id) setEmpresaSelecionada(null);
      carregarEmpresas();
    } catch {
      toast.error("Erro ao excluir empresa.");
    }
  }

  function adicionarTag() {
    const t = tagInput.trim();
    if (!t || (form.tags || []).includes(t)) return;
    set("tags", [...(form.tags || []), t]);
    setTagInput("");
  }

  function removerTag(tag: string) {
    set("tags", (form.tags || []).filter(t => t !== tag));
  }

  // ─── Busca CEP ────────────────────────────────────────────────────────────

  async function buscarCEP(cep: string) {
    const n = cep.replace(/\D/g, "");
    if (n.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
      const d = await r.json();
      if (!d.erro) {
        set("logradouro", d.logradouro || "");
        set("bairro", d.bairro || "");
        set("cidade", d.localidade || "");
        set("estado", d.uf || "");
      }
    } catch { /* silencioso */ }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const empresasFiltradas = empresas;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Empresas
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? "Carregando..." : `${empresas.length} empresa${empresas.length !== 1 ? "s" : ""} cadastrada${empresas.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={abrirNova}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 font-medium text-sm"
          >
            <Plus className="w-4 h-4" /> Nova Empresa
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por razão social, CNPJ, responsável..."
              className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="todos">Todos os status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            onClick={carregarEmpresas}
            className="flex items-center gap-1.5 border rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>

        {/* Conteúdo principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Lista */}
          <div className="lg:col-span-1 space-y-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : empresasFiltradas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhuma empresa encontrada</p>
                <p className="text-xs mt-1">Cadastre a primeira empresa clicando em "Nova Empresa"</p>
              </div>
            ) : (
              empresasFiltradas.map(emp => {
                const st = STATUS_CONFIG[emp.status] || STATUS_CONFIG.ativo;
                const ativa = empresaSelecionada?.id === emp.id;
                return (
                  <div
                    key={emp.id}
                    onClick={() => setEmpresaSelecionada(ativa ? null : emp)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      ativa ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{emp.razao_social}</p>
                        {emp.nome_fantasia && (
                          <p className="text-xs text-gray-500 truncate">{emp.nome_fantasia}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                            {st.icon}{st.label}
                          </span>
                          {emp.porte && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {PORTE_CONFIG[emp.porte]}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 transition-transform ${ativa ? "rotate-90 text-blue-600" : "text-gray-400"}`} />
                    </div>
                    {(emp.cidade || emp.estado) && (
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {[emp.cidade, emp.estado].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Detalhe */}
          <div className="lg:col-span-2">
            {!empresaSelecionada ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed rounded-2xl">
                <Building2 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Selecione uma empresa para ver os detalhes</p>
              </div>
            ) : (
              <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
                {/* Header do detalhe */}
                <div className="p-5 border-b bg-gradient-to-r from-blue-50 to-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{empresaSelecionada.razao_social}</h2>
                      {empresaSelecionada.nome_fantasia && (
                        <p className="text-sm text-gray-500">{empresaSelecionada.nome_fantasia}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {(() => {
                          const st = STATUS_CONFIG[empresaSelecionada.status] || STATUS_CONFIG.ativo;
                          return (
                            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${st.color}`}>
                              {st.icon}{st.label}
                            </span>
                          );
                        })()}
                        {empresaSelecionada.porte && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            {PORTE_CONFIG[empresaSelecionada.porte]}
                          </span>
                        )}
                        {empresaSelecionada.segmento && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                            {empresaSelecionada.segmento}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEditar(empresaSelecionada)}
                        className="flex items-center gap-1.5 text-xs border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </button>
                      {confirmandoExclusao === empresaSelecionada.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleExcluir(empresaSelecionada.id)}
                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 font-medium"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmandoExclusao(null)}
                            className="text-xs border px-3 py-1.5 rounded-lg hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmandoExclusao(empresaSelecionada.id)}
                          className="flex items-center gap-1.5 text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ─── Card Score/Risco ─────────────────────────────────── */}
                {(() => {
                  const { score, risco, indicadores } = calcularScore(empresaSelecionada);
                  const RISCO_CONFIG = {
                    baixo:   { label: "Baixo Risco",   color: "bg-green-50 border-green-200",  badge: "bg-green-100 text-green-800",  bar: "bg-green-500",  Icon: ShieldCheck },
                    medio:   { label: "Risco Médio",   color: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-100 text-yellow-800", bar: "bg-yellow-500", Icon: ShieldAlert },
                    alto:    { label: "Alto Risco",    color: "bg-orange-50 border-orange-200", badge: "bg-orange-100 text-orange-800", bar: "bg-orange-500", Icon: AlertTriangle },
                    critico: { label: "Risco Crítico", color: "bg-red-50 border-red-200",       badge: "bg-red-100 text-red-800",       bar: "bg-red-500",   Icon: ShieldOff },
                  };
                  const cfg = RISCO_CONFIG[risco];
                  return (
                    <div className={`mx-5 mt-4 border rounded-xl p-4 ${cfg.color}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <cfg.Icon className="w-4 h-4" />
                          <span className="text-sm font-bold text-gray-800">Score Destrava</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                          <span className="text-2xl font-black text-gray-900">{score}<span className="text-sm font-normal text-gray-400">/100</span></span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                        <div className={`h-2 rounded-full transition-all ${cfg.bar}`} style={{ width: `${score}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {indicadores.map((ind, i) => (
                          <span key={i} className="text-xs bg-white/70 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{ind}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          sessionStorage.setItem("calculadora_empresa", JSON.stringify({
                            nome: empresaSelecionada.responsavel_nome || empresaSelecionada.razao_social,
                            empresa: empresaSelecionada.razao_social,
                            telefone: empresaSelecionada.telefone || empresaSelecionada.whatsapp || "",
                            cpf_cnpj: empresaSelecionada.cnpj || "",
                          }));
                          setLocation("/colaborador/calculadora");
                        }}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                      >
                        <Calculator className="w-4 h-4" />
                        Nova Simulação para {empresaSelecionada.nome_fantasia || empresaSelecionada.razao_social}
                      </button>
                    </div>
                  );
                })()}

                {/* ─── Abas de Navegação ─────────────────────────────── */}
                <div className="flex border-b border-gray-200 px-4 gap-1 bg-gray-50">
                  {([
                    { id: "dados",      label: "Dados",       icon: <Building2 className="w-3.5 h-3.5" /> },
                    { id: "documentos", label: "Documentos",  icon: <Paperclip className="w-3.5 h-3.5" />, badge: documentos.length },
                    { id: "followup",   label: "Follow-up",   icon: <Bell className="w-3.5 h-3.5" />, badge: followups.filter(f => !f.concluido).length },
                    { id: "historico",  label: "Histórico",   icon: <History className="w-3.5 h-3.5" />, badge: historico.length },
                  ] as const).map(aba => (
                    <button
                      key={aba.id}
                      onClick={() => setAbaAtiva(aba.id)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                        abaAtiva === aba.id
                          ? "border-blue-600 text-blue-700"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {aba.icon} {aba.label}
                      {(aba as any).badge > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                          abaAtiva === aba.id ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"
                        }`}>{(aba as any).badge}</span>
                      )}
                    </button>
                  ))}
                </div>

                {loadingDetalhe && (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                )}

                {/* ─── ABA: DADOS ───────────────────────────────────────── */}
                {!loadingDetalhe && abaAtiva === "dados" && (
                <div className="p-5 space-y-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    {empresaSelecionada.cnpj && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">CNPJ</p>
                        <p className="font-medium text-gray-800 mt-0.5">{empresaSelecionada.cnpj}</p>
                      </div>
                    )}
                    {empresaSelecionada.faturamento_anual && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Faturamento Anual</p>
                        <p className="font-semibold text-green-700 mt-0.5">{fmt(empresaSelecionada.faturamento_anual)}</p>
                      </div>
                    )}
                    {empresaSelecionada.limite_credito_atual && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Limite de Crédito</p>
                        <p className="font-semibold text-blue-700 mt-0.5">{fmt(empresaSelecionada.limite_credito_atual)}</p>
                      </div>
                    )}
                    {empresaSelecionada.numero_funcionarios && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Funcionários</p>
                        <p className="font-medium text-gray-800 mt-0.5">{empresaSelecionada.numero_funcionarios}</p>
                      </div>
                    )}
                    {(empresaSelecionada.score_serasa || empresaSelecionada.score_spc) && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Score</p>
                        <p className="font-medium text-gray-800 mt-0.5">
                          {empresaSelecionada.score_serasa ? `Serasa: ${empresaSelecionada.score_serasa}` : ""}
                          {empresaSelecionada.score_serasa && empresaSelecionada.score_spc ? " · " : ""}
                          {empresaSelecionada.score_spc ? `SPC: ${empresaSelecionada.score_spc}` : ""}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Cadastro</p>
                      <p className="font-medium text-gray-800 mt-0.5">{fmtDate(empresaSelecionada.created_at)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {empresaSelecionada.telefone && (
                      <a href={`tel:${empresaSelecionada.telefone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 bg-gray-50 rounded-lg px-3 py-2">
                        <Phone className="w-4 h-4 text-gray-400" /> {empresaSelecionada.telefone}
                      </a>
                    )}
                    {empresaSelecionada.whatsapp && (
                      <a href={`https://wa.me/55${empresaSelecionada.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 bg-green-50 rounded-lg px-3 py-2">
                        <Phone className="w-4 h-4 text-green-500" /> WhatsApp: {empresaSelecionada.whatsapp}
                      </a>
                    )}
                    {empresaSelecionada.email && (
                      <a href={`mailto:${empresaSelecionada.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 bg-gray-50 rounded-lg px-3 py-2">
                        <Mail className="w-4 h-4 text-gray-400" /> {empresaSelecionada.email}
                      </a>
                    )}
                    {empresaSelecionada.site && (
                      <a href={empresaSelecionada.site} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 bg-gray-50 rounded-lg px-3 py-2">
                        <Globe className="w-4 h-4 text-gray-400" /> {empresaSelecionada.site}
                      </a>
                    )}
                  </div>

                  {(empresaSelecionada.logradouro || empresaSelecionada.cidade) && (
                    <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span>
                        {[
                          empresaSelecionada.logradouro,
                          empresaSelecionada.numero,
                          empresaSelecionada.complemento,
                          empresaSelecionada.bairro,
                          empresaSelecionada.cidade,
                          empresaSelecionada.estado,
                          empresaSelecionada.cep,
                        ].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}

                  {empresaSelecionada.responsavel_nome && (
                    <div className="border rounded-xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Sócio / Responsável
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Nome</p>
                          <p className="font-medium">{empresaSelecionada.responsavel_nome}</p>
                        </div>
                        {empresaSelecionada.responsavel_cargo && (
                          <div>
                            <p className="text-xs text-gray-400">Cargo</p>
                            <p className="font-medium">{empresaSelecionada.responsavel_cargo}</p>
                          </div>
                        )}
                        {empresaSelecionada.responsavel_telefone && (
                          <div>
                            <p className="text-xs text-gray-400">Telefone</p>
                            <a href={`tel:${empresaSelecionada.responsavel_telefone}`} className="font-medium text-blue-600 hover:underline">
                              {empresaSelecionada.responsavel_telefone}
                            </a>
                          </div>
                        )}
                        {empresaSelecionada.responsavel_email && (
                          <div>
                            <p className="text-xs text-gray-400">E-mail</p>
                            <a href={`mailto:${empresaSelecionada.responsavel_email}`} className="font-medium text-blue-600 hover:underline truncate block">
                              {empresaSelecionada.responsavel_email}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(empresaSelecionada.captador_nome || empresaSelecionada.analista_nome) && (
                    <div className="border rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Equipe Responsável</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {empresaSelecionada.captador_nome && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></span>
                            <div>
                              <p className="text-xs text-gray-400">Resp. pela Captação</p>
                              <p className="font-medium text-gray-800">{empresaSelecionada.captador_nome}</p>
                            </div>
                          </div>
                        )}
                        {empresaSelecionada.analista_nome && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
                            <div>
                              <p className="text-xs text-gray-400">Resp. pelo Atendimento</p>
                              <p className="font-medium text-gray-800">{empresaSelecionada.analista_nome}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(empresaSelecionada.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(empresaSelecionada.tags || []).map(tag => (
                        <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Tag className="w-3 h-3" />{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {empresaSelecionada.observacoes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-yellow-700 mb-1 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Observações
                      </p>
                      <p className="text-sm text-yellow-900 whitespace-pre-wrap">{empresaSelecionada.observacoes}</p>
                    </div>
                  )}
                </div>
                )}

                {/* ─── ABA: DOCUMENTOS ──────────────────────────────────── */}
                {!loadingDetalhe && abaAtiva === "documentos" && (
                  <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">Documentos da Empresa</p>
                      <label className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                        <Upload className="w-3.5 h-3.5" /> Enviar Arquivo
                        <input type="file" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !empresaSelecionada) return;
                          const fd = new FormData();
                          fd.append("file", file);
                          try {
                            await apiFetch(`/api/empresas/${empresaSelecionada.id}/documentos`, {
                              method: "POST",
                              body: fd,
                              headers: {},
                            });
                            const docs = await apiFetch(`/api/empresas/${empresaSelecionada.id}/documentos`).catch(() => []);
                            setDocumentos(Array.isArray(docs) ? docs : []);
                            toast.success("Documento enviado.");
                          } catch { toast.error("Erro ao enviar documento."); }
                        }} />
                      </label>
                    </div>
                    {documentos.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <Paperclip className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Nenhum documento enviado</p>
                        <p className="text-xs mt-1">Envie balancetes, extratos, contratos e outros arquivos</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {documentos.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5 border">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{doc.nome}</p>
                                <p className="text-xs text-gray-400">{doc.tipo} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}</p>
                              </div>
                            </div>
                            {doc.url && (
                              <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-2">Baixar</a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── ABA: FOLLOW-UP ───────────────────────────────────── */}
                {!loadingDetalhe && abaAtiva === "followup" && (
                  <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">Follow-ups</p>
                      <button onClick={() => setAdicionandoFollowup(true)} className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                        <PlusCircle className="w-3.5 h-3.5" /> Novo
                      </button>
                    </div>
                    {adicionandoFollowup && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold text-blue-700">Novo Follow-up</p>
                        <input
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          placeholder="Título do follow-up..."
                          value={novoFollowup.titulo}
                          onChange={e => setNovoFollowup(p => ({ ...p, titulo: e.target.value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={novoFollowup.tipo}
                            onChange={e => setNovoFollowup(p => ({ ...p, tipo: e.target.value }))}
                          >
                            <option value="ligacao">Ligança</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="email">E-mail</option>
                            <option value="reuniao">Reunião</option>
                            <option value="visita">Visita</option>
                            <option value="outro">Outro</option>
                          </select>
                          <input
                            type="datetime-local"
                            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={novoFollowup.data_agendada}
                            onChange={e => setNovoFollowup(p => ({ ...p, data_agendada: e.target.value }))}
                          />
                        </div>
                        <textarea
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                          rows={2}
                          placeholder="Descrição (opcional)..."
                          value={novoFollowup.descricao}
                          onChange={e => setNovoFollowup(p => ({ ...p, descricao: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button onClick={salvarFollowup} className="flex-1 bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700">Salvar</button>
                          <button onClick={() => setAdicionandoFollowup(false)} className="flex-1 bg-gray-100 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                        </div>
                      </div>
                    )}
                    {followups.length === 0 && !adicionandoFollowup ? (
                      <div className="text-center py-12 text-gray-400">
                        <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Nenhum follow-up agendado</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {followups.map(f => (
                          <div key={f.id} className={`flex items-start gap-3 rounded-xl border p-3 ${
                            f.concluido ? "bg-gray-50 opacity-60" : "bg-white"
                          }`}>
                            <button
                              onClick={() => !f.concluido && concluirFollowup(f.id)}
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                f.concluido ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"
                              }`}
                            >
                              {f.concluido && <CheckCircle className="w-3 h-3 text-white" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${f.concluido ? "line-through text-gray-400" : "text-gray-800"}`}>{f.titulo}</p>
                              {f.descricao && <p className="text-xs text-gray-500 mt-0.5">{f.descricao}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-400">{f.tipo}</span>
                                {f.data_agendada && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    !f.concluido && new Date(f.data_agendada) < new Date()
                                      ? "bg-red-100 text-red-600"
                                      : "bg-gray-100 text-gray-500"
                                  }`}>
                                    {new Date(f.data_agendada).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── ABA: HISTÓRICO ──────────────────────────────────────── */}
                {!loadingDetalhe && abaAtiva === "historico" && (
                  <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
                    <div className="flex gap-2">
                      <textarea
                        className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                        rows={2}
                        placeholder="Adicionar nota, observação ou registro..."
                        value={novaObs}
                        onChange={e => setNovaObs(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) adicionarHistorico(novaObs); }}
                      />
                      <button
                        onClick={() => adicionarHistorico(novaObs)}
                        disabled={!novaObs.trim()}
                        className="self-end px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                    {historico.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Nenhum registro ainda</p>
                        <p className="text-xs mt-1">Adicione notas, registros de contato e observações</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {historico.map(h => (
                          <div key={h.id} className="flex gap-3">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                              <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 border">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-600">{h.autor || "Sistema"}</span>
                                <span className="text-xs text-gray-400">{new Date(h.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{h.descricao}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Modal de Cadastro/Edição ─────────────────────────────────────────── */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                {!editando && etapaModal === "form" && (
                  <button onClick={() => { setEtapaModal("cnpj"); cnpjReset(); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none" title="Voltar">←</button>
                )}
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  {editando ? "Editar Empresa" : etapaModal === "cnpj" ? "Nova Empresa" : "Dados da Empresa"}
                </h2>
              </div>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editando && etapaModal === "cnpj" && (
              <div className="p-8 flex flex-col items-center gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-3xl shadow-lg shadow-blue-200 mx-auto mb-4">🏛️</div>
                  <h3 className="text-base font-bold text-gray-900">Informe o CNPJ da empresa</h3>
                  <p className="text-sm text-gray-500 mt-1">Os dados públicos da Receita Federal serão carregados automaticamente.</p>
                </div>
                <div className="w-full max-w-md">
                  <div className="flex items-center gap-3 border-2 border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all bg-slate-50">
                    <span className="text-xl shrink-0">
                      {cnpjStatus === "loading" ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> : cnpjStatus === "found" ? "✅" : cnpjStatus === "error" ? "❌" : "🔍"}
                    </span>
                    <input
                      autoFocus
                      value={cnpjInput}
                      onChange={e => {
                        const formatted = fmtCNPJBrasil(e.target.value);
                        setCnpjInput(formatted);
                        const digits = cleanDigits(formatted);
                        if (digits.length < 14) { cnpjReset(); return; }
                        cnpjLookup(formatted, (data) => {
                          const socios = data.qsa || [];
                          const socio = socios[0];
                          const porteRaw = String(data.porte || data.descricao_porte || "").toLowerCase();
                          let porteMap: FormEmpresa["porte"] = "mei";
                          if (porteRaw.includes("micro") || porteRaw === "me") porteMap = "me";
                          if (porteRaw.includes("pequeno") || porteRaw.includes("epp")) porteMap = "epp";
                          if (porteRaw.includes("medio") || porteRaw.includes("médio")) porteMap = "medio";
                          if (porteRaw.includes("grande")) porteMap = "grande";
                          setSociosReceita(socios);
                          setForm(f => ({
                            ...f,
                            cnpj: formatted,
                            razao_social: data.razao_social || "",
                            nome_fantasia: data.nome_fantasia || "",
                            email: data.email || "",
                            telefone: data.ddd_telefone_1 ? data.ddd_telefone_1.replace(/\D/g, "").replace(/(\d{2})(\d{4,5})(\d{4})/, "($1) $2-$3") : "",
                            whatsapp: data.ddd_telefone_1 ? data.ddd_telefone_1.replace(/\D/g, "").replace(/(\d{2})(\d{4,5})(\d{4})/, "($1) $2-$3") : "",
                            cep: data.cep ? data.cep.replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2") : "",
                            logradouro: data.logradouro || "",
                            numero: data.numero || "",
                            complemento: data.complemento || "",
                            bairro: data.bairro || "",
                            cidade: data.municipio || "",
                            estado: data.uf || "",
                            responsavel_nome: socio?.nome_socio || "",
                            responsavel_cpf: socio?.cnpj_cpf_do_socio || "",
                            responsavel_cargo: socio?.descricao_qualificacao_socio || socio?.qualificacao_socio || "",
                            porte: porteMap,
                            segmento: data.cnae_fiscal_descricao || "",
                            natureza_juridica: data.natureza_juridica || "",
                            cnae_principal: data.cnae_fiscal ? String(data.cnae_fiscal) : "",
                            cnae_descricao: data.cnae_fiscal_descricao || "",
                            cnaes_secundarios: data.cnaes_secundarios || [],
                            descricao_situacao_cadastral: data.descricao_situacao_cadastral || "",
                            data_situacao_cadastral: data.data_situacao_cadastral || "",
                            motivo_situacao_cadastral: data.motivo_situacao_cadastral ? String(data.motivo_situacao_cadastral) : "",
                            data_inicio_atividade: data.data_inicio_atividade || "",
                            capital_social: data.capital_social ? Number(data.capital_social) : undefined,
                            matriz_filial: data.descricao_matriz_filial || (data.identificador_matriz_filial ? String(data.identificador_matriz_filial) : ""),
                            dados_receita: data,
                            qsa: socios,
                          }));
                          setTimeout(() => setEtapaModal("form"), 500);
                        });
                      }}
                      placeholder="00.000.000/0001-00"
                      maxLength={18}
                      inputMode="numeric"
                      className="flex-1 bg-transparent font-mono text-xl font-semibold tracking-widest text-slate-900 focus:outline-none placeholder:text-slate-300 placeholder:text-base placeholder:tracking-widest"
                    />
                  </div>
                  {cnpjStatus === "loading" && <p className="text-xs text-slate-400 mt-2 text-center">Consultando Receita Federal...</p>}
                  {cnpjError && <p className="text-xs text-red-500 font-medium mt-2 text-center">{cnpjError}</p>}
                </div>
                <button type="button" onClick={() => { setForm(f => ({ ...f, cnpj: cnpjInput })); setEtapaModal("form"); }} className="text-xs text-blue-600 hover:underline">Preencher manualmente</button>
              </div>
            )}

            {(editando || etapaModal === "form") && (
              <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">

              <Secao id="basico" titulo="Dados da Empresa" icon={<Building2 className="w-4 h-4 text-blue-600" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">
                      Razão Social <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.razao_social}
                      onChange={e => set("razao_social", e.target.value)}
                      placeholder="Razão Social Ltda."
                      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${erros.razao_social ? "border-red-400" : ""}`}
                    />
                    {erros.razao_social && <p className="text-xs text-red-500">{erros.razao_social}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Nome Fantasia</label>
                    <input
                      value={form.nome_fantasia || ""}
                      onChange={e => set("nome_fantasia", e.target.value)}
                      placeholder="Nome comercial"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">CNPJ</label>
                    <input
                      value={form.cnpj || ""}
                      onChange={e => set("cnpj", formatCNPJ(e.target.value))}
                      placeholder="00.000.000/0001-00"
                      inputMode="numeric"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Inscrição Estadual</label>
                    <input
                      value={form.inscricao_estadual || ""}
                      onChange={e => set("inscricao_estadual", e.target.value)}
                      placeholder="000.000.000.000"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Porte</label>
                    <select
                      value={form.porte || "mei"}
                      onChange={e => set("porte", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {Object.entries(PORTE_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Segmento</label>
                    <select
                      value={form.segmento || ""}
                      onChange={e => set("segmento", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Selecione...</option>
                      {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Faturamento Anual (R$)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.faturamento_anual ? formatBRLCurrency(form.faturamento_anual) : ""}
                      onChange={e => {
                        const formatted = maskCurrencyInput(e.target.value);
                        set("faturamento_anual", unmaskCurrencyInput(formatted) || undefined);
                      }}
                      placeholder="0,00"
                      autoComplete="off"
                      className="w-full border rounded-xl px-3 py-2 text-sm text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Nº de Funcionários</label>
                    <input
                      type="number"
                      value={form.numero_funcionarios || ""}
                      onChange={e => set("numero_funcionarios", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      min="0"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Status</label>
                    <select
                      value={form.status}
                      onChange={e => set("status", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </Secao>

              <Secao id="contato" titulo="Contato" icon={<Phone className="w-4 h-4 text-green-600" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Telefone</label>
                    <input
                      value={form.telefone || ""}
                      onChange={e => set("telefone", formatTel(e.target.value))}
                      placeholder="(61) 3333-4444"
                      inputMode="tel"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">WhatsApp</label>
                    <input
                      value={form.whatsapp || ""}
                      onChange={e => set("whatsapp", formatTel(e.target.value))}
                      placeholder="(61) 9 9999-9999"
                      inputMode="tel"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">E-mail</label>
                    <input
                      type="email"
                      value={form.email || ""}
                      onChange={e => set("email", e.target.value)}
                      placeholder="contato@empresa.com.br"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Site</label>
                    <input
                      value={form.site || ""}
                      onChange={e => set("site", e.target.value)}
                      placeholder="https://empresa.com.br"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </Secao>

              <Secao id="endereco" titulo="Endereço" icon={<MapPin className="w-4 h-4 text-orange-500" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">CEP</label>
                    <input
                      value={form.cep || ""}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                        const fmt = v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
                        set("cep", fmt);
                        if (v.length === 8) buscarCEP(v);
                      }}
                      placeholder="00000-000"
                      inputMode="numeric"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Logradouro</label>
                    <input
                      value={form.logradouro || ""}
                      onChange={e => set("logradouro", e.target.value)}
                      placeholder="Rua, Av., Quadra..."
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Número</label>
                    <input
                      value={form.numero || ""}
                      onChange={e => set("numero", e.target.value)}
                      placeholder="123"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Complemento</label>
                    <input
                      value={form.complemento || ""}
                      onChange={e => set("complemento", e.target.value)}
                      placeholder="Sala 10, Bloco B..."
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Bairro</label>
                    <input
                      value={form.bairro || ""}
                      onChange={e => set("bairro", e.target.value)}
                      placeholder="Bairro"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Cidade</label>
                    <input
                      value={form.cidade || ""}
                      onChange={e => set("cidade", e.target.value)}
                      placeholder="Brasília"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Estado</label>
                    <select
                      value={form.estado || ""}
                      onChange={e => set("estado", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">UF</option>
                      {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>
              </Secao>

              <Secao id="responsavel" titulo="Sócio / Responsável" icon={<User className="w-4 h-4 text-purple-600" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Nome</label>
                    <input
                      value={form.responsavel_nome || ""}
                      onChange={e => set("responsavel_nome", e.target.value)}
                      placeholder="Nome completo"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">CPF</label>
                    <input
                      value={form.responsavel_cpf || ""}
                      onChange={e => set("responsavel_cpf", e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Cargo</label>
                    <input
                      value={form.responsavel_cargo || ""}
                      onChange={e => set("responsavel_cargo", e.target.value)}
                      placeholder="Sócio, Diretor, Gerente..."
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Telefone</label>
                    <input
                      value={form.responsavel_telefone || ""}
                      onChange={e => set("responsavel_telefone", formatTel(e.target.value))}
                      placeholder="(61) 9 9999-9999"
                      inputMode="tel"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">E-mail</label>
                    <input
                      type="email"
                      value={form.responsavel_email || ""}
                      onChange={e => set("responsavel_email", e.target.value)}
                      placeholder="socio@empresa.com.br"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </Secao>

              <Secao id="financeiro" titulo="Dados Financeiros" icon={<DollarSign className="w-4 h-4 text-emerald-600" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Banco Principal</label>
                    <input
                      value={form.banco_principal || ""}
                      onChange={e => set("banco_principal", e.target.value)}
                      placeholder="Banco do Brasil, Caixa..."
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Agência</label>
                    <input
                      value={form.agencia || ""}
                      onChange={e => set("agencia", e.target.value)}
                      placeholder="0001"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Conta Corrente</label>
                    <input
                      value={form.conta || ""}
                      onChange={e => set("conta", e.target.value)}
                      placeholder="00000-0"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Limite de Crédito Atual (R$)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.limite_credito_atual ? formatBRLCurrency(form.limite_credito_atual) : ""}
                      onChange={e => {
                        const formatted = maskCurrencyInput(e.target.value);
                        set("limite_credito_atual", unmaskCurrencyInput(formatted) || undefined);
                      }}
                      placeholder="0,00"
                      autoComplete="off"
                      className="w-full border rounded-xl px-3 py-2 text-sm text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Score Serasa</label>
                    <input
                      type="number"
                      value={form.score_serasa || ""}
                      onChange={e => set("score_serasa", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0 a 1000"
                      min="0" max="1000"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Score SPC</label>
                    <input
                      type="number"
                      value={form.score_spc || ""}
                      onChange={e => set("score_spc", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0 a 1000"
                      min="0" max="1000"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </Secao>

              <Secao id="fiscal" titulo="Dados Fiscais / Receita Federal" icon={<ShieldCheck className="w-4 h-4 text-indigo-600" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoReadOnly label="Natureza Jurídica" value={form.natureza_juridica} />
                  <InfoReadOnly label="Situação Cadastral" value={form.descricao_situacao_cadastral} />
                  <InfoReadOnly label="Data da Situação" value={form.data_situacao_cadastral} />
                  <InfoReadOnly label="Motivo da Situação" value={form.motivo_situacao_cadastral} />
                  <InfoReadOnly label="Data de Início de Atividade" value={form.data_inicio_atividade} />
                  <InfoReadOnly label="Capital Social" value={form.capital_social ? formatBRLCurrency(form.capital_social) : ""} mono />
                  <InfoReadOnly label="Matriz / Filial" value={form.matriz_filial} />
                  <InfoReadOnly label="CNAE Principal" value={form.cnae_principal} mono />
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Descrição do CNAE Principal</label>
                    <input value={form.cnae_descricao || ""} readOnly className="w-full border rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700 cursor-not-allowed" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-semibold text-gray-600">CNAEs Secundários</label>
                    {Array.isArray(form.cnaes_secundarios) && form.cnaes_secundarios.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2">
                        {form.cnaes_secundarios.map((cnae: any, idx: number) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                            <span className="font-mono font-semibold">{cnae.codigo || cnae.code || ""}</span> — {cnae.descricao || cnae.description || ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Nenhum CNAE secundário retornado.</p>
                    )}
                  </div>
                </div>
              </Secao>

              <Secao id="extras" titulo="Tags e Observações" icon={<Tag className="w-4 h-4 text-yellow-600" />} secaoAberta={secaoAberta} setSecaoAberta={setSecaoAberta}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-600">Tags</label>
                    <div className="flex gap-2">
                      <input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); adicionarTag(); } }}
                        placeholder="Digite uma tag e pressione Enter"
                        className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={adicionarTag}
                        className="border rounded-xl px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {(form.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(form.tags || []).map(tag => (
                          <span key={tag} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                            {tag}
                            <button type="button" onClick={() => removerTag(tag)} className="hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">Observações</label>
                    <textarea
                      value={form.observacoes || ""}
                      onChange={e => set("observacoes", e.target.value)}
                      placeholder="Informações adicionais, histórico, restrições..."
                      rows={3}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
                        Responsável pela Captação <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400">Gerente, Diretor, Consultor ou Captador Externo</p>
                      <select
                        value={form.captador_id || ""}
                        onChange={e => set("captador_id", e.target.value || undefined)}
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                      >
                        <option value="">Nenhum responsável pela captação</option>
                        {captacao.map(c => (
                          <option key={c.id} value={c.id}>{c.nome} — {c.cargo}</option>
                        ))}
                      </select>
                      {captacao.length === 0 && (
                        <p className="text-xs text-amber-500">Nenhum colaborador elegível para captação. Crie em Usuários.</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                        Responsável pelo Atendimento <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400">Analista, Consultor, Gerente, Diretor ou Admin</p>
                      <select
                        value={form.analista_id || ""}
                        onChange={e => set("analista_id", e.target.value || undefined)}
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Nenhum responsável pelo atendimento</option>
                        {atendimento.map(a => (
                          <option key={a.id} value={a.id}>{a.nome} — {a.cargo}</option>
                        ))}
                      </select>
                      {atendimento.length === 0 && (
                        <p className="text-xs text-gray-400">Nenhum colaborador elegível. Crie em Usuários.</p>
                      )}
                    </div>
                  </div>
                </div>
              </Secao>
              </div>
            )}

            {(editando || etapaModal === "form") && (
              <div className="flex items-center justify-end gap-3 p-5 border-t bg-gray-50">
              <button
                type="button"
                onClick={fecharModal}
                className="border rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvar}
                disabled={salvando}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700 font-medium text-sm disabled:opacity-60"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editando ? "Salvar Alterações" : "Cadastrar Empresa"}
              </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
