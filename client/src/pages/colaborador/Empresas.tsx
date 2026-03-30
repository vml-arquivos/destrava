import { useState, useEffect, useCallback } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Building2, Plus, Search, Phone, Mail, Globe, MapPin,
  Edit2, Trash2, ChevronRight, Loader2, X, Save,
  User, DollarSign, CreditCard, Tag, RefreshCw,
  CheckCircle, XCircle, Clock, Star, TrendingUp,
  FileText, ChevronDown, ChevronUp,
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

// ─── Componente Secao (FORA do principal para evitar remount ao digitar) ─────────────────────────────────────────────────────────────────────────────────

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

// ─── Componente Principal ─────────────────────────────────────────────────────────────────────────────────

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [form, setForm] = useState<FormEmpresa>({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState("");
  const [secaoAberta, setSecaoAberta] = useState<string>("basico");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);

  // ─── Carregar empresas ──────────────────────────────────────────────────────

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

  // ─── Formulário ─────────────────────────────────────────────────────────────

  function abrirNova() {
    setEditando(null);
    setForm({ ...FORM_VAZIO });
    setErros({});
    setSecaoAberta("basico");
    setTagInput("");
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
    });
    setErros({});
    setSecaoAberta("basico");
    setTagInput("");
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setForm({ ...FORM_VAZIO });
    setErros({});
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

  // ─── Busca CEP ──────────────────────────────────────────────────────────────

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
  // ─── Render ─────────────────────────────────────────────────────────────────────────────────
  const empresasFiltradas = empresas; // filtro já vem do backend

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

                {/* Corpo do detalhe */}
                <div className="p-5 space-y-5">
                  {/* Dados básicos */}
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

                  {/* Contato */}
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

                  {/* Endereço */}
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

                  {/* Responsável */}
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

                  {/* Tags */}
                  {(empresaSelecionada.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(empresaSelecionada.tags || []).map(tag => (
                        <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Tag className="w-3 h-3" />{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Observações */}
                  {empresaSelecionada.observacoes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-yellow-700 mb-1 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Observações
                      </p>
                      <p className="text-sm text-yellow-900 whitespace-pre-wrap">{empresaSelecionada.observacoes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Modal de Cadastro/Edição ─────────────────────────────────────────── */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
            {/* Header do modal */}
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                {editando ? "Editar Empresa" : "Nova Empresa"}
              </h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo do modal */}
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">

              {/* Seção: Dados Básicos */}
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
                      type="number"
                      value={form.faturamento_anual || ""}
                      onChange={e => set("faturamento_anual", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0,00"
                      min="0"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              {/* Seção: Contato */}
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

              {/* Seção: Endereço */}
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

              {/* Seção: Sócio / Responsável */}
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

              {/* Seção: Dados Financeiros */}
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
                      type="number"
                      value={form.limite_credito_atual || ""}
                      onChange={e => set("limite_credito_atual", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0,00"
                      min="0"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              {/* Seção: Tags e Observações */}
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
                </div>
              </Secao>
            </div>

            {/* Footer do modal */}
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
          </div>
        </div>
      )}
    </Layout>
  );
}
