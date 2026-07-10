import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "./Layout";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "@/lib/currency";
import { useCNPJLookup } from "../../hooks/useCNPJLookup";
import { formatCNPJ as fmtCNPJBrasil, cleanDigits } from "../../utils/cnpj";
import type { CNPJSocio } from "../../utils/cnpj";
import {
  Building2, Plus, Search, Phone, Mail, Globe, MapPin,
  Edit2, Trash2, ChevronRight, Loader2, X, Save,
  User, DollarSign, Tag, RefreshCw, CheckCircle,
  XCircle, Clock, Star, TrendingUp, FileText,
  ChevronDown, ChevronUp, Calculator, AlertTriangle,
  ShieldCheck, ShieldAlert, ShieldOff, Upload,
  MessageSquare, History, Bell, Send, PlusCircle,
  Building, CreditCard, Hash, Calendar, Users, Briefcase,
  ArrowLeft, MoreVertical, ExternalLink, Copy, CheckCheck,
  BarChart3, Banknote, AlertCircle, Info, RotateCw, Zap, FileDown, Download,
} from "lucide-react";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/states";
import { RiscoBadge, ScoreIndicator, StatusCadastroBadge } from "@/components/ui/risco-badge";
import DocumentosEntidade from "@/components/documentos/DocumentosEntidade";
import DossieCreditoEmpresa from "@/components/documentacao/DossieCreditoEmpresa";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Empresa {
  id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  natureza_juridica?: string;
  capital_social?: number;
  cnae_principal?: string;
  cnaes_secundarios?: string[];
  data_abertura?: string;
  situacao_cadastral?: string;
  matriz_filial?: string;
  ultima_sincronizacao_receita?: string;
  data_situacao_cadastral?: string;
  motivo_situacao_cadastral?: string;
  regime_tributario?: string;
  dados_extra_receita?: any;
  email?: string;
  telefone?: string;
  telefone_2?: string;
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
  score_interno?: number;
  risco_classificacao?: "critico" | "alto" | "medio" | "baixo";
  status_cadastro?: "incompleto" | "basico" | "completo" | "verificado";
  status: "ativo" | "inativo" | "prospecto" | "cliente" | "ex_cliente";
  origem?: string;
  tags?: string[];
  observacoes?: string;
  captador_id?: string;
  analista_id?: string;
  captador_nome?: string;
  analista_nome?: string;
  created_at: string;
  updated_at: string;
}

type FormEmpresa = Omit<Empresa, "id" | "created_at" | "updated_at">;

const FORM_VAZIO: FormEmpresa = {
  razao_social: "", nome_fantasia: "", cnpj: "", inscricao_estadual: "",
  natureza_juridica: "", capital_social: undefined, cnae_principal: "", cnaes_secundarios: [],
  data_abertura: "", situacao_cadastral: "", matriz_filial: "", ultima_sincronizacao_receita: "", data_situacao_cadastral: "", motivo_situacao_cadastral: "", regime_tributario: "", dados_extra_receita: undefined,
  email: "", telefone: "", telefone_2: "", whatsapp: "", site: "", segmento: "", porte: "mei",
  faturamento_anual: undefined, numero_funcionarios: undefined,
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  responsavel_nome: "", responsavel_cpf: "", responsavel_cargo: "",
  responsavel_telefone: "", responsavel_email: "",
  banco_principal: "", agencia: "", conta: "",
  limite_credito_atual: undefined, score_serasa: undefined, score_spc: undefined,
  status: "ativo", origem: "manual", tags: [], observacoes: "",
  captador_id: undefined, analista_id: undefined,
};

interface EmpresaFollowup {
  id: string; empresa_id: string; tipo: string; titulo: string;
  descricao?: string; data_agendada?: string; concluido: boolean; created_at: string;
}
interface EmpresaHistorico {
  id: string; empresa_id: string; tipo: string;
  descricao: string; autor?: string; created_at: string;
}
interface EmpresaDocumento {
  id: string; empresa_id: string; nome: string; tipo: string;
  tamanho?: number; url?: string; created_at: string;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; badge: string }> = {
  ativo:      { label: "Ativo",       dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  inativo:    { label: "Inativo",     dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
  prospecto:  { label: "Prospecto",   dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  cliente:    { label: "Cliente",     dot: "bg-violet-500",  badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  ex_cliente: { label: "Ex-cliente",  dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
};

const PORTE_CFG: Record<string, { label: string; color: string }> = {
  mei:    { label: "MEI",         color: "text-slate-600 bg-slate-100" },
  me:     { label: "Micro (ME)",  color: "text-sky-700 bg-sky-50" },
  epp:    { label: "EPP",         color: "text-indigo-700 bg-indigo-50" },
  medio:  { label: "Médio Porte", color: "text-violet-700 bg-violet-50" },
  grande: { label: "Grande",      color: "text-rose-700 bg-rose-50" },
};

const SEGMENTOS = [
  "Comércio","Serviços","Indústria","Tecnologia","Saúde","Educação",
  "Construção Civil","Agronegócio","Transporte","Alimentação","Varejo","Atacado","Outro",
];
const ESTADOS_BR = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const ABAS_EMPRESA = [
  "visao_geral",
  "socios",
  "dossie_credito",
  "followup",
  "historico",
  "documentos",
  "simulacoes",
  "contratos",
] as const;
type AbaEmpresa = typeof ABAS_EMPRESA[number];

function isAbaEmpresa(value: string | null): value is AbaEmpresa {
  return Boolean(value && (ABAS_EMPRESA as readonly string[]).includes(value));
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const fmt = (v?: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const formatCNPJ = (v: string) => {
  const n = v.replace(/\D/g, "").slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0,2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`;
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
};
const formatTel = (v: string) => {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : "";
  if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
};

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}


function boolReceita(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  const v = String(value || "").trim().toLowerCase();
  return ["true", "sim", "s", "representante", "representante legal"].includes(v);
}

function normalizarSociosReceita(qsa: any[] | undefined | null) {
  if (!Array.isArray(qsa)) return [];
  const vistos = new Set<string>();
  return qsa
    .map((s) => {
      const nome = String(s?.nome || s?.nome_socio || s?.nome_do_socio || "").trim();
      const cpf_cnpj = s?.cpf_cnpj || s?.cpf || s?.documento || s?.cnpj_cpf_do_socio || s?.cnpj_cpf || null;
      const qualificacao_socio = s?.qualificacao_socio || s?.descricao_qualificacao_socio || s?.qualificacao || s?.cargo || "Sócio";
      const key = `${nome.toLowerCase()}|${String(cpf_cnpj || "").replace(/\D/g, "")}`;
      if (!nome || vistos.has(key)) return null;
      vistos.add(key);
      return {
        nome,
        cpf_cnpj,
        qualificacao_socio,
        representante_legal: boolReceita(s?.representante_legal),
        nome_representante: s?.nome_representante || s?.nome_do_representante || null,
        qualificacao_representante: s?.qualificacao_representante || s?.qualificacao_representante_legal || null,
        data_entrada_sociedade: s?.data_entrada_sociedade || s?.data_entrada || null,
        pais: s?.pais || null,
        rg: s?.rg || null,
        data_nascimento: s?.data_nascimento || null,
        nacionalidade: s?.nacionalidade || null,
        estado_civil: s?.estado_civil || null,
        profissao: s?.profissao || null,
        email: s?.email || null,
        telefone: s?.telefone || null,
        whatsapp: s?.whatsapp || null,
        cep: s?.cep || null,
        logradouro: s?.logradouro || null,
        numero: s?.numero || null,
        complemento: s?.complemento || null,
        bairro: s?.bairro || null,
        cidade: s?.cidade || null,
        uf: s?.uf || null,
        conjuge_nome: s?.conjuge_nome || null,
        conjuge_cpf: s?.conjuge_cpf || null,
        regime_bens: s?.regime_bens || null,
        fonte_dados: s?.fonte_dados || s?.fonte || s?.provedor || 'api_publica_cnpj',
        dados_extra: s,
      };
    })
    .filter(Boolean) as any[];
}


function primeiraInscricaoEstadualReceita(data: any): string {
  const inscricoes = Array.isArray(data?.inscricoes_estaduais) ? data.inscricoes_estaduais : [];
  const ativa = inscricoes.find((ie: any) => String(ie?.situacao || ie?.status || '').toLowerCase().includes('ativ') || String(ie?.situacao || ie?.status || '').toLowerCase().includes('habilit'));
  const item = ativa || inscricoes[0] || {};
  return String(data?.inscricao_estadual || item.numero || item.number || item.inscricao_estadual || '').trim();
}

function telefoneReceita(numero?: string | null): string {
  const digits = String(numero || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
}

function regimeTributarioReceita(data: any): string {
  const simples = data?.opcao_pelo_simples === true || data?.opcao_pelo_simples === 'true';
  const mei = data?.opcao_pelo_mei === true || data?.opcao_pelo_mei === 'true';
  if (mei) return 'MEI';
  if (simples) return 'Simples Nacional';
  return '';
}

function parseCapitalSocial(valor?: number | string | null): number | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const raw = String(valor).replace(/R\$/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep === -1) {
    const n = Number(raw.replace(/[^0-9-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const dec = raw.slice(lastSep + 1).replace(/\D/g, '');
  const int = raw.slice(0, lastSep).replace(/[^0-9-]/g, '');
  const n = dec.length > 0 && dec.length <= 2
    ? Number(`${int}.${dec}`)
    : Number(raw.replace(/[.,]/g, '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function calcularScore(e: Empresa) {
  let pontos = 0;
  const tags: { text: string; ok: boolean }[] = [];
  if (e.faturamento_anual) {
    if (e.faturamento_anual >= 1_000_000) { pontos += 30; tags.push({ text: "Faturamento +R$1M", ok: true }); }
    else if (e.faturamento_anual >= 360_000) { pontos += 20; tags.push({ text: "Faturamento +R$360k", ok: true }); }
    else if (e.faturamento_anual >= 120_000) { pontos += 10; tags.push({ text: "Faturamento +R$120k", ok: true }); }
    else { pontos -= 5; tags.push({ text: "Faturamento baixo", ok: false }); }
  } else { tags.push({ text: "Faturamento não informado", ok: false }); }
  if (e.score_serasa) {
    if (e.score_serasa >= 700) { pontos += 25; tags.push({ text: `Serasa ${e.score_serasa} ✓`, ok: true }); }
    else if (e.score_serasa >= 500) { pontos += 15; tags.push({ text: `Serasa ${e.score_serasa}`, ok: true }); }
    else { pontos -= 5; tags.push({ text: `Serasa ${e.score_serasa} ↓`, ok: false }); }
  } else { tags.push({ text: "Score não informado", ok: false }); }
  if (e.score_spc) {
    if (e.score_spc >= 700) { pontos += 15; tags.push({ text: `SPC ${e.score_spc} ✓`, ok: true }); }
    else if (e.score_spc >= 400) { pontos += 8; }
    else { pontos -= 10; tags.push({ text: `SPC ${e.score_spc} ↓`, ok: false }); }
  }
  if (e.porte === "grande") pontos += 10;
  else if (e.porte === "medio") pontos += 7;
  else if (e.porte === "epp") pontos += 5;
  else if (e.porte === "me") pontos += 3;
  if (e.limite_credito_atual && e.limite_credito_atual > 0) { pontos += 10; tags.push({ text: "Limite ativo", ok: true }); }
  if (e.status === "cliente") { pontos += 10; tags.push({ text: "Cliente ativo", ok: true }); }
  else if (e.status === "ex_cliente") { pontos -= 5; }
  const preenchidos = [e.cnpj, e.email, e.telefone, e.responsavel_nome, e.cidade].filter(Boolean).length;
  pontos += preenchidos * 2;
  if (preenchidos < 3) tags.push({ text: "Cadastro incompleto", ok: false });
  const score = Math.max(0, Math.min(100, pontos));
  const risco = score >= 70 ? "baixo" : score >= 50 ? "medio" : score >= 30 ? "alto" : "critico";
  return { score, risco, tags };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.ativo;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function FieldRow({ label, value, icon, mono }: { label: string; value?: string | null; icon?: React.ReactNode; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-0">
      {icon && <span className="mt-0.5 text-slate-400 shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-sm font-medium text-slate-800 break-words ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

function InfoTile({ label, value, icon, tone = "slate", mono = false }: { label: string; value?: string | number | null; icon?: React.ReactNode; tone?: "slate" | "blue" | "emerald" | "amber" | "violet"; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  const palette = {
    slate: "bg-white border-slate-200 text-slate-700",
    blue: "bg-blue-50 border-blue-100 text-blue-800",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-800",
    amber: "bg-amber-50 border-amber-100 text-amber-800",
    violet: "bg-violet-50 border-violet-100 text-violet-800",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${palette}`}>
      <div className="flex items-center gap-2 mb-2 text-slate-400">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-sm font-black leading-snug break-words ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function normalizarCapitalSocial(valor?: number | string | null) {
  const n = parseCapitalSocial(valor);
  return n !== null ? fmt(n) : "—";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      title="Copiar"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function SectionCard({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className="text-slate-500">{icon}</span>
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-1">{children}</div>}
    </div>
  );
}

function ScoreBar({ score, risco }: { score: number; risco: string }) {
  const colors = { baixo: "bg-emerald-500", medio: "bg-amber-500", alto: "bg-orange-500", critico: "bg-red-500" };
  const labels = { baixo: "Baixo Risco", medio: "Risco Médio", alto: "Alto Risco", critico: "Crítico" };
  const barColor = colors[risco as keyof typeof colors] || colors.critico;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${score}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-lg font-black text-slate-800">{score}</span>
        <span className="text-xs text-slate-400 font-medium">/100</span>
      </div>
    </div>
  );
}


function DetailChip({ label, value, tone = "slate" }: { label: string; value?: string | number | null; tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "violet" }) {
  const palette = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${palette}`}>
      <span className="text-slate-400 font-black uppercase tracking-wide">{label}</span>
      <span>{value || "—"}</span>
    </span>
  );
}

function DataCell({ label, value, icon, mono = false, muted = false }: { label: string; value?: string | number | null; icon?: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 min-h-[72px]">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-sm font-bold break-words ${mono ? "font-mono" : ""} ${muted || !value ? "text-slate-500" : "text-slate-800"}`}>
        {value || "Não informado"}
      </p>
    </div>
  );
}

function EmpresaDadosWorkspace({
  empresa,
  socios,
  documentosTotal,
  simulacoesTotal,
  contratosTotal,
  sincronizando,
  onSincronizar,
  onEditar,
  onNovaSimulacao,
  onNovoContrato,
  onIniciarConversa,
  onAbrirAcervo,
}: {
  empresa: Empresa;
  socios: any[];
  documentosTotal: number;
  simulacoesTotal: number;
  contratosTotal: number;
  sincronizando: boolean;
  onSincronizar: () => void;
  onEditar: () => void;
  onNovaSimulacao: () => void;
  onNovoContrato: () => void;
  onIniciarConversa: () => void;
  onAbrirAcervo: () => void;
}) {
  const [painelAtivo, setPainelAtivo] = useState<"resumo" | "receita" | "cadastro" | "contato" | "endereco" | "socios" | "documentos">("resumo");
  const { score, risco, tags } = calcularScore(empresa);
  const enderecoCompleto = [empresa.logradouro, empresa.numero, empresa.complemento, empresa.bairro, empresa.cidade, empresa.estado]
    .filter(Boolean)
    .join(", ");
  const cnaesSecundarios = Array.isArray(empresa.cnaes_secundarios) ? empresa.cnaes_secundarios.filter(Boolean) : [];
  const pendenciasSocios = socios.reduce((acc: number, s: any) => acc + pendenciasSocioContrato(s).length, 0);

  const paineis = [
    { id: "resumo" as const, label: "Resumo", description: "Visão executiva", icon: <Building2 className="w-4 h-4" />, badge: empresa.status },
    { id: "receita" as const, label: "Receita Federal", description: "Dados oficiais", icon: <Briefcase className="w-4 h-4" />, badge: empresa.situacao_cadastral },
    { id: "cadastro" as const, label: "Cadastro interno", description: "Controle operacional", icon: <Building className="w-4 h-4" />, badge: fmtDate(empresa.created_at) },
    { id: "contato" as const, label: "Contato", description: "Telefone, e-mail e site", icon: <Phone className="w-4 h-4" />, badge: empresa.telefone || empresa.email ? "OK" : "Pendente" },
    { id: "endereco" as const, label: "Endereço", description: "Localização completa", icon: <MapPin className="w-4 h-4" />, badge: empresa.cidade || "Pendente" },
    { id: "socios" as const, label: "Sócios / QSA", description: "Administradores e pendências", icon: <Users className="w-4 h-4" />, badge: socios.length ? `${socios.length}` : "0" },
    { id: "documentos" as const, label: "Documentos", description: "Atalho para o acervo", icon: <FileText className="w-4 h-4" />, badge: `${documentosTotal}` },
  ];

  const painelSelecionado = paineis.find((p) => p.id === painelAtivo) || paineis[0];

  const renderPainel = () => {
    if (painelAtivo === "receita") {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Atualização cadastral</p>
                <p className="text-sm text-blue-900 mt-1">Dados oficiais vindos das fontes confiáveis. Atualize somente quando precisar sincronizar com a Receita Federal.</p>
                <p className="text-xs text-blue-700 mt-1">Última atualização: {empresa.ultima_sincronizacao_receita ? new Date(empresa.ultima_sincronizacao_receita).toLocaleString("pt-BR") : "Não registrada"}</p>
              </div>
              {empresa.cnpj && (
                <button onClick={onSincronizar} disabled={sincronizando} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                  <RotateCw className={`w-4 h-4 ${sincronizando ? "animate-spin" : ""}`} />
                  Atualizar Receita
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DataCell label="Razão Social" value={empresa.razao_social} icon={<Building2 className="w-3.5 h-3.5" />} />
            <DataCell label="Nome Fantasia" value={empresa.nome_fantasia} icon={<Star className="w-3.5 h-3.5" />} muted={!empresa.nome_fantasia} />
            <DataCell label="Situação Cadastral" value={empresa.situacao_cadastral} icon={<CheckCircle className="w-3.5 h-3.5" />} />
            <DataCell label="Matriz / Filial" value={empresa.matriz_filial} icon={<Building className="w-3.5 h-3.5" />} />
            <DataCell label="Natureza Jurídica" value={empresa.natureza_juridica} icon={<Briefcase className="w-3.5 h-3.5" />} />
            <DataCell label="Data de Abertura" value={fmtDate(empresa.data_abertura || "")} icon={<Calendar className="w-3.5 h-3.5" />} />
            <DataCell label="Capital Social" value={normalizarCapitalSocial(empresa.capital_social)} icon={<Banknote className="w-3.5 h-3.5" />} />
            <DataCell label="Regime Tributário" value={empresa.regime_tributario} icon={<FileText className="w-3.5 h-3.5" />} muted={!empresa.regime_tributario} />
          </div>
          <DataCell label="CNAE Principal" value={empresa.cnae_principal} icon={<Tag className="w-3.5 h-3.5" />} />
          {cnaesSecundarios.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">CNAEs secundários</p>
              <div className="flex flex-wrap gap-1.5">
                {cnaesSecundarios.map((cnae, i) => <span key={`${cnae}-${i}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{cnae}</span>)}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (painelAtivo === "cadastro") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <DataCell label="CNPJ" value={empresa.cnpj} icon={<Hash className="w-3.5 h-3.5" />} mono />
            <DataCell label="Cadastrado em" value={fmtDate(empresa.created_at)} icon={<Calendar className="w-3.5 h-3.5" />} />
            <DataCell label="Origem" value={empresa.origem || "Manual"} icon={<Info className="w-3.5 h-3.5" />} />
            <DataCell label="Porte" value={empresa.porte ? PORTE_CFG[empresa.porte]?.label : undefined} icon={<Building className="w-3.5 h-3.5" />} />
            <DataCell label="Segmento" value={empresa.segmento} icon={<Tag className="w-3.5 h-3.5" />} muted={!empresa.segmento} />
            <DataCell label="Funcionários" value={empresa.numero_funcionarios ? `${empresa.numero_funcionarios} colaboradores` : undefined} icon={<Users className="w-3.5 h-3.5" />} muted={!empresa.numero_funcionarios} />
            <DataCell label="Captador" value={empresa.captador_nome} icon={<User className="w-3.5 h-3.5" />} muted={!empresa.captador_nome} />
            <DataCell label="Analista" value={empresa.analista_nome} icon={<User className="w-3.5 h-3.5" />} muted={!empresa.analista_nome} />
            <DataCell label="Status" value={STATUS_CFG[empresa.status]?.label || empresa.status} icon={<CheckCircle className="w-3.5 h-3.5" />} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onEditar} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Edit2 className="w-4 h-4" /> Editar cadastro
            </button>
            {empresa.cnpj && (
              <button onClick={onSincronizar} disabled={sincronizando} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                <RotateCw className={`w-4 h-4 ${sincronizando ? "animate-spin" : ""}`} /> Atualizar cadastro
              </button>
            )}
          </div>
        </div>
      );
    }

    if (painelAtivo === "contato") {
      const contatos = [
        { label: "Telefone", value: empresa.telefone, href: empresa.telefone ? `tel:${empresa.telefone}` : undefined, icon: <Phone className="w-4 h-4" /> },
        { label: "WhatsApp", value: empresa.whatsapp, href: empresa.whatsapp ? `https://wa.me/55${empresa.whatsapp.replace(/\D/g, "")}` : undefined, icon: <Phone className="w-4 h-4" /> },
        { label: "E-mail", value: empresa.email, href: empresa.email ? `mailto:${empresa.email}` : undefined, icon: <Mail className="w-4 h-4" /> },
        { label: "Site", value: empresa.site, href: empresa.site, icon: <Globe className="w-4 h-4" /> },
      ];
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contatos.map((c) => (
            c.value ? (
              <a key={c.label} href={c.href} target={c.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="rounded-2xl border border-slate-100 bg-slate-50 p-4 hover:border-blue-200 hover:bg-blue-50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500">{c.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{c.label}</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{c.value}</p>
                  </div>
                </div>
              </a>
            ) : (
              <div key={c.label} className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-slate-400">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center">{c.icon}</div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest">{c.label}</p><p className="text-sm font-bold">Não informado</p></div>
                </div>
              </div>
            )
          ))}
        </div>
      );
    }

    if (painelAtivo === "endereco") {
      return (
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0"><MapPin className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endereço principal</p>
                <p className="text-lg font-black text-slate-900 mt-1">{enderecoCompleto || "Não informado"}</p>
                <p className="text-sm text-slate-500 mt-1">{empresa.cep ? `CEP ${empresa.cep}` : "CEP não informado"}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DataCell label="Logradouro" value={empresa.logradouro} icon={<MapPin className="w-3.5 h-3.5" />} />
            <DataCell label="Número / complemento" value={[empresa.numero, empresa.complemento].filter(Boolean).join(" · ")} icon={<Hash className="w-3.5 h-3.5" />} />
            <DataCell label="Bairro" value={empresa.bairro} icon={<Building className="w-3.5 h-3.5" />} />
            <DataCell label="Cidade" value={empresa.cidade} icon={<MapPin className="w-3.5 h-3.5" />} />
            <DataCell label="UF" value={empresa.estado} icon={<MapPin className="w-3.5 h-3.5" />} />
            <DataCell label="CEP" value={empresa.cep} icon={<Hash className="w-3.5 h-3.5" />} />
          </div>
        </div>
      );
    }

    if (painelAtivo === "socios") {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-slate-800">Quadro societário e administradores</p>
              <p className="text-xs text-slate-500">Visualização compacta para análise cadastral, crédito, contrato e laudo.</p>
            </div>
            <DetailChip label="Pendências" value={pendenciasSocios} tone={pendenciasSocios ? "amber" : "emerald"} />
          </div>
          {socios.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">Nenhum sócio retornado para esta empresa.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {socios.map((s: any) => {
                const pendencias = Array.isArray(s.pendencias_contrato) ? s.pendencias_contrato : pendenciasSocioContrato(s);
                return (
                  <div key={s.id || s.nome} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm font-black shrink-0">{String(s.nome || "?").slice(0, 1).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-900 truncate">{s.nome || "Nome não informado"}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pendencias.length ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{pendencias.length ? `${pendencias.length} pendência(s)` : "Completo"}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {s.qualificacao_socio && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">{s.qualificacao_socio}</span>}
                          {s.representante_legal && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Administrador</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                          <DataCell label="CPF/CNPJ" value={s.cpf_cnpj} mono />
                          <DataCell label="Contato" value={s.whatsapp || s.telefone || s.email} />
                          <DataCell label="Estado civil" value={s.estado_civil} />
                          <DataCell label="Endereço" value={[s.logradouro, s.numero, s.bairro, s.cidade, s.uf].filter(Boolean).join(", ")} />
                        </div>
                        {pendencias.length > 0 && (
                          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-2">
                            <p className="text-[11px] font-black text-amber-700 mb-1">Pendências para contrato/análise</p>
                            <div className="flex flex-wrap gap-1">{pendencias.slice(0, 8).map((p: string) => <span key={p} className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">{p}</span>)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (painelAtivo === "documentos") {
      return (
        <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm"><FileText className="w-7 h-7" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Central documental</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">Anexos e documentos da empresa</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-2xl">Todos os arquivos são visualizados na página exclusiva do acervo para preservar o cadastro limpo e oferecer mais espaço ao PDF.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <DetailChip label="Arquivos" value={documentosTotal} tone="blue" />
                  <DetailChip label="Simulações" value={simulacoesTotal} />
                  <DetailChip label="Contratos" value={contratosTotal} />
                </div>
              </div>
            </div>
            <button onClick={onAbrirAcervo} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm shadow-blue-100 hover:bg-blue-700">
              <ExternalLink className="w-4 h-4" /> Abrir acervo documental
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DataCell label="Capital Social" value={normalizarCapitalSocial(empresa.capital_social)} icon={<Banknote className="w-3.5 h-3.5" />} />
          <DataCell label="Faturamento anual" value={empresa.faturamento_anual ? fmt(empresa.faturamento_anual) : undefined} icon={<DollarSign className="w-3.5 h-3.5" />} muted={!empresa.faturamento_anual} />
          <DataCell label="Limite atual" value={fmt(empresa.limite_credito_atual || 0)} icon={<CreditCard className="w-3.5 h-3.5" />} />
          <DataCell label="Abertura" value={fmtDate(empresa.data_abertura || "")} icon={<Calendar className="w-3.5 h-3.5" />} />
        </div>
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex items-center gap-3 min-w-[220px]">
              <div className="h-11 w-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500"><ShieldCheck className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Score Destrava</p>
                <div className="flex items-end gap-1"><span className="text-3xl font-black text-slate-900">{score}</span><span className="text-sm font-bold text-slate-400 pb-1">/100</span></div>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]"><ScoreBar score={score} risco={risco} /></div>
            <div className="flex flex-wrap gap-1.5 xl:max-w-[360px]">{tags.slice(0, 4).map((t, i) => <span key={i} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ok ? "bg-white text-slate-600 border-slate-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>{t.text}</span>)}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DataCell label="CNPJ" value={empresa.cnpj} icon={<Hash className="w-3.5 h-3.5" />} mono />
          <DataCell label="Localização" value={[empresa.cidade, empresa.estado].filter(Boolean).join(" / ")} icon={<MapPin className="w-3.5 h-3.5" />} />
          <DataCell label="Contato principal" value={empresa.responsavel_nome || empresa.telefone || empresa.whatsapp || empresa.email} icon={<Phone className="w-3.5 h-3.5" />} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onNovaSimulacao} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"><Calculator className="w-4 h-4" /> Nova simulação</button>
          <button onClick={onNovoContrato} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"><FileText className="w-4 h-4" /> Novo contrato</button>
          <button onClick={onIniciarConversa} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100"><Bell className="w-4 h-4" /> Iniciar conversa</button>
          <button onClick={onAbrirAcervo} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><ExternalLink className="w-4 h-4" /> Acervo documental</button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-3 fade-in">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-600">Central de informações</p>
              <h3 className="mt-0.5 text-base font-black text-slate-900 truncate">Dados da empresa</h3>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <DetailChip label="Docs" value={documentosTotal} tone="blue" />
                <DetailChip label="Sócios" value={socios.length} tone="emerald" />
                <DetailChip label="Score" value={score} tone={risco === "baixo" ? "emerald" : risco === "medio" ? "amber" : "rose"} />
              </div>
            </div>
            <div className="p-2.5">
              <div className="space-y-1">
                {paineis.map((painel) => (
                  <button
                    key={painel.id}
                    type="button"
                    onClick={() => setPainelAtivo(painel.id)}
                    className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all ${painelAtivo === painel.id ? "border-blue-300 bg-blue-50 shadow-sm" : "border-transparent bg-white hover:border-slate-200 hover:bg-white"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${painelAtivo === painel.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{painel.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-black text-slate-900 truncate">{painel.label}</p>
                          {painel.badge && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 max-w-[86px] truncate">{painel.badge}</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-400 truncate">{painel.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0 bg-white">
            <div className="border-b border-slate-200 px-3 sm:px-4 py-2.5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Visualização</p>
                  <h3 className="text-lg font-black text-slate-900 truncate">{painelSelecionado.label}</h3>
                  <p className="text-sm text-slate-500 truncate">{painelSelecionado.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={onEditar} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Edit2 className="w-3.5 h-3.5" /> Editar</button>
                  {empresa.cnpj && <button onClick={onSincronizar} disabled={sincronizando} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><RotateCw className={`w-3.5 h-3.5 ${sincronizando ? "animate-spin" : ""}`} /> Atualizar</button>}
                </div>
              </div>
            </div>
            <div className="p-3 sm:p-4">
              {renderPainel()}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Field ──────────────────────────────────────────────────────────────

function MField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

const inputCls = "h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-300 w-full";
const selectCls = inputCls + " cursor-pointer";


const ESTADOS_CIVIS_SOCIO = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável", "Separado(a)"];
const REGIMES_BENS = ["Comunhão parcial de bens", "Comunhão universal de bens", "Separação total de bens", "Participação final nos aquestos", "Não se aplica"];
const SOCIO_FORM_VAZIO: any = {
  nome: "", cpf_cnpj: "", qualificacao_socio: "", percentual_capital: "", representante_legal: false,
  data_entrada_sociedade: "", pais: "", rg: "", rg_orgao_emissor: "", rg_uf_emissao: "",
  rg_data_emissao: "", data_nascimento: "", nacionalidade: "Brasileiro(a)", estado_civil: "", profissao: "",
  email: "", telefone: "", whatsapp: "", cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", conjuge_nome: "", conjuge_cpf: "", conjuge_rg: "",
  conjuge_data_nasc: "", conjuge_profissao: "", conjuge_email: "", conjuge_telefone: "", regime_bens: "",
  pep: false, observacoes: "", fonte_dados: "manual",
};

function pendenciasSocioContrato(s: any): string[] {
  const pendencias: string[] = [];
  const doc = String(s?.cpf_cnpj || "").replace(/\D/g, "");
  if (!s?.nome) pendencias.push("Nome");
  if (doc.length !== 11 && doc.length !== 14) pendencias.push("CPF/CNPJ completo");
  if (!s?.qualificacao_socio) pendencias.push("Qualificação");
  if (!s?.rg) pendencias.push("RG/documento");
  if (!s?.estado_civil) pendencias.push("Estado civil");
  if (!s?.profissao) pendencias.push("Profissão");
  if (!s?.nacionalidade) pendencias.push("Nacionalidade");
  if (!s?.email) pendencias.push("E-mail");
  if (!s?.telefone && !s?.whatsapp) pendencias.push("Telefone/WhatsApp");
  if (!s?.cep || !s?.logradouro || !s?.cidade || !s?.uf) pendencias.push("Endereço residencial");
  const civil = String(s?.estado_civil || "").toLowerCase();
  if (civil.includes("casad") || civil.includes("união") || civil.includes("uniao")) {
    if (!s?.conjuge_nome) pendencias.push("Cônjuge");
    if (String(s?.conjuge_cpf || "").replace(/\D/g, "").length !== 11) pendencias.push("CPF do cônjuge");
    if (!s?.regime_bens) pendencias.push("Regime de bens");
  }
  return pendencias;
}

function pickSocioForm(s: any) {
  return { ...SOCIO_FORM_VAZIO, ...(s || {}) };
}

function montarSocioAdministradorPadrao(empresa: Empresa | null): any | null {
  if (!empresa) return null;
  const nome = String(empresa.responsavel_nome || empresa.razao_social || "").trim();
  if (!nome) return null;
  const natureza = String(empresa.natureza_juridica || empresa.porte || "").toLowerCase();
  const qualificacao = empresa.responsavel_cargo
    || (natureza.includes("individual") || natureza.includes("mei") ? "Sócio-administrador" : "Sócio-administrador");
  return {
    id: `socio-admin-${empresa.id}`,
    empresa_id: empresa.id,
    nome,
    cpf_cnpj: empresa.responsavel_cpf || "",
    qualificacao_socio: qualificacao,
    representante_legal: true,
    nome_representante: nome,
    qualificacao_representante: qualificacao,
    email: empresa.responsavel_email || empresa.email || "",
    telefone: empresa.responsavel_telefone || empresa.telefone || "",
    whatsapp: empresa.whatsapp || "",
    cep: empresa.cep || "",
    logradouro: empresa.logradouro || "",
    numero: empresa.numero || "",
    complemento: empresa.complemento || "",
    bairro: empresa.bairro || "",
    cidade: empresa.cidade || "",
    uf: empresa.estado || "",
    fonte_dados: "cadastro_empresa",
    inferido_empresa: true,
  };
}


// ─── Componente Principal ─────────────────────────────────────────────────────

function formatarCnaeCodigoTela(value: any): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 7) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}-${digits.slice(4, 5)}-${digits.slice(5)}`;
  return String(value || "").trim();
}

function montarCnaeTela(codigo: any, descricao: any): string {
  const c = formatarCnaeCodigoTela(codigo);
  const d = String(descricao || "").trim();
  if (c && d) return `${c} — ${d}`;
  return d || c;
}

function mensagemErroApi(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err?.message === "string") return err.message;
  if (typeof err?.error === "string") return err.error;
  if (typeof err?.details?.message === "string") return err.details.message;
  try {
    const json = JSON.stringify(err);
    return json && json !== "{}" ? json : fallback;
  } catch {
    return fallback;
  }
}

// Mapeia o retorno de GET /api/cnpj/:cnpj (formato "cru" das fontes — BrasilAPI/CNPJá/OpenCNPJ)
// para o formato de colunas usado pela tabela `empresas` / PATCH /api/empresas/:id.
// Extraído do fluxo de "Nova empresa" para ser reaproveitado também por "Atualizar cadastro",
// garantindo que os dois caminhos preencham os campos exatamente da mesma forma.
function mapCnpjDataParaEmpresa(data: any, prev: Record<string, any> = {}): Record<string, unknown> {
  const sociosList = data.qsa ?? [];
  const socio = sociosList[0];
  const porteRaw = (data.porte || data.descricao_porte || "").toLowerCase();
  let porteMap: FormEmpresa["porte"] = "mei";
  if (porteRaw.includes("mei")) porteMap = "mei";
  else if (porteRaw.includes("micro") || porteRaw === "me") porteMap = "me";
  else if (porteRaw.includes("pequeno") || porteRaw.includes("epp")) porteMap = "epp";
  else if (porteRaw.includes("medio") || porteRaw.includes("médio")) porteMap = "medio";
  else if (porteRaw.includes("grande")) porteMap = "grande";

  return {
    razao_social: data.razao_social ?? "",
    nome_fantasia: data.nome_fantasia ?? "",
    email: data.email ?? "",
    telefone: telefoneReceita(data.ddd_telefone_1),
    telefone_2: telefoneReceita((data as any).ddd_telefone_2) || (prev as any).telefone_2,
    cep: data.cep?.replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2") ?? "",
    logradouro: data.logradouro ?? "", numero: data.numero ?? "",
    complemento: data.complemento ?? "", bairro: data.bairro ?? "",
    cidade: data.municipio ?? "", estado: data.uf ?? "",
    responsavel_nome: socio?.nome_socio ?? "",
    responsavel_cpf: socio?.cnpj_cpf_do_socio ?? "",
    responsavel_cargo: socio?.descricao_qualificacao_socio ?? "",
    porte: porteMap,
    segmento: data.cnae_fiscal_descricao ?? prev.segmento,
    inscricao_estadual: primeiraInscricaoEstadualReceita(data) || prev.inscricao_estadual,
    natureza_juridica: data.natureza_juridica ?? prev.natureza_juridica,
    capital_social: parseCapitalSocial(data.capital_social) ?? prev.capital_social,
    cnae_principal: data.cnae_fiscal_descricao
      ? montarCnaeTela(data.cnae_fiscal, data.cnae_fiscal_descricao)
      : prev.cnae_principal,
    cnaes_secundarios: Array.isArray((data as any).cnaes_secundarios)
      ? (data as any).cnaes_secundarios.map((c: any) => c?.descricao ? montarCnaeTela(c?.codigo, c?.descricao) : String(c)).filter(Boolean)
      : prev.cnaes_secundarios,
    data_abertura: data.data_inicio_atividade ?? prev.data_abertura,
    situacao_cadastral: data.descricao_situacao_cadastral ?? prev.situacao_cadastral,
    data_situacao_cadastral: (data as any).data_situacao_cadastral ?? (prev as any).data_situacao_cadastral,
    motivo_situacao_cadastral: (data as any).motivo_situacao_cadastral ?? (prev as any).motivo_situacao_cadastral,
    regime_tributario: regimeTributarioReceita(data) || (prev as any).regime_tributario,
    matriz_filial: (data as any).identificador_matriz_filial === 1 ? "Matriz" : (data as any).identificador_matriz_filial === 2 ? "Filial" : prev.matriz_filial,
    ultima_sincronizacao_receita: new Date().toISOString(),
    dados_extra_receita: {
      provedor_principal: (data as any).provedor_principal || null,
      fontes_consulta: (data as any).fontes_consulta || [],
      dados_fontes: (data as any).dados_fontes || {},
      inscricoes_estaduais: (data as any).inscricoes_estaduais || [],
      suframa: (data as any).suframa || [],
      payload_normalizado: data,
    },
  };
}

export default function Empresas() {
  const [location, setLocation] = useLocation();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selecionada, setSelecionada] = useState<Empresa | null>(null);
  const [showDetail, setShowDetail] = useState(false); // mobile toggle
  const [comboAberto, setComboAberto] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<AbaEmpresa>("visao_geral");
  const [followups, setFollowups] = useState<EmpresaFollowup[]>([]);
  const [historico, setHistorico] = useState<EmpresaHistorico[]>([]);
  const [documentos, setDocumentos] = useState<EmpresaDocumento[]>([]);
  const [contratosSociais, setContratosSociais] = useState<any[]>([]);
  const [enviandoContratoSocial, setEnviandoContratoSocial] = useState(false);
  const [sociosEmpresa, setSociosEmpresa] = useState<any[]>([]);
  const [sociosExpandidos, setSociosExpandidos] = useState<Record<string, boolean>>({});
  const [consultandoCpfSocioId, setConsultandoCpfSocioId] = useState<string | null>(null);
  const [simulacoesEmpresa, setSimulacoesEmpresa] = useState<any[]>([]);
  const [contratosEmpresa, setContratosEmpresa] = useState<any[]>([]);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [novaObs, setNovaObs] = useState("");
  const [novoFollowup, setNovoFollowup] = useState({ titulo: "", tipo: "ligacao", data_agendada: "", descricao: "" });
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [form, setForm] = useState<FormEmpresa>({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState("");
  const [secaoAberta, setSecaoAberta] = useState("basico");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [captacao, setCaptacao] = useState<any[]>([]);
  const [atendimento, setAtendimento] = useState<any[]>([]);
  const [socios, setSocios] = useState<CNPJSocio[]>([]);
  const [etapaModal, setEtapaModal] = useState<"cnpj" | "form">("cnpj");
  const [cnpjInput, setCnpjInput] = useState("");
  const { lookup: cnpjLookup, status: cnpjStatus, error: cnpjError, reset: cnpjReset } = useCNPJLookup();
  const searchRef = useRef<HTMLInputElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboAberto(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);
  const [sincronizando, setSincronizando] = useState(false);
  const [socioEditando, setSocioEditando] = useState<any | null>(null);
  const [socioForm, setSocioForm] = useState<any>({ ...SOCIO_FORM_VAZIO });
  const [salvandoSocio, setSalvandoSocio] = useState(false);

  const socioAdministradorPadrao = montarSocioAdministradorPadrao(selecionada);
  const sociosExibicao = sociosEmpresa.length > 0
    ? sociosEmpresa
    : (socioAdministradorPadrao ? [socioAdministradorPadrao] : []);


  const abrirEdicaoSocio = (socio: any) => {
    setSocioEditando(socio);
    setSocioForm(pickSocioForm(socio));
  };

  const setSocioCampo = (campo: string, valor: any) => {
    setSocioForm((prev: any) => ({ ...prev, [campo]: valor }));
  };

  const salvarSocio = async () => {
    if (!selecionada?.id || !socioEditando?.id) return;
    if (!String(socioForm.nome || '').trim()) {
      toast.error('Nome do sócio é obrigatório');
      return;
    }
    try {
      setSalvandoSocio(true);
      const atualizado = await apiFetch(`/api/empresas/${selecionada.id}/socios/${socioEditando.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...socioForm, fonte_dados: 'manual_validado' }),
      });
      setSociosEmpresa(prev => prev.map((s: any) => s.id === atualizado.id ? atualizado : s));
      setSocioEditando(null);
      toast.success('Dados do sócio/representante salvos');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar dados do sócio');
    } finally {
      setSalvandoSocio(false);
    }
  };

  const atualizarCpfManualSocio = async (socio: any, cpfCompleto: string) => {
    if (!selecionada?.id || !socio?.id) return;
    try {
      const atualizado = await apiFetch(`/api/empresas/${selecionada.id}/socios/${socio.id}/cpf-manual`, {
        method: 'PUT',
        body: JSON.stringify({ cpf_completo: cpfCompleto, validado: true }),
      });
      setSociosEmpresa(prev => prev.map((s: any) => s.id === atualizado.id ? atualizado : s));
      toast.success('CPF completo salvo.');
    } catch (err: any) {
      toast.error(err?.message || 'CPF inválido ou erro ao salvar');
    }
  };




  const consultarCpfHubSocio = async (socio: any) => {
    if (!selecionada?.id || !socio?.id) return;
    const atual = String(socio.cpf_completo_manual || socio.cpf_cnpj || '').replace(/\D/g, '');
    let cpf = atual.length === 11 ? atual : '';
    if (!cpf) {
      const informado = prompt('Informe o CPF completo do sócio');
      cpf = String(informado || '').replace(/\D/g, '');
    }
    if (cpf.length !== 11) {
      toast.error('Informe um CPF completo com 11 dígitos.');
      return;
    }
    try {
      setConsultandoCpfSocioId(socio.id);
      const res = await apiFetch(`/api/empresas/${selecionada.id}/socios/${socio.id}/enriquecer-cpf`, {
        method: 'POST',
        body: JSON.stringify({ cpf }),
      });
      const atualizado = res?.socio || res;
      if (atualizado?.id) {
        setSociosEmpresa(prev => prev.map((s: any) => s.id === atualizado.id ? atualizado : s));
      }
      toast.success('Dados do sócio atualizados.');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar dados deste sócio');
    } finally {
      setConsultandoCpfSocioId(null);
    }
  };

  const atualizarSocioIndividual = async (socio: any) => {
    if (!selecionada?.id || !socio?.id || !selecionada.cnpj || sincronizando) return;
    try {
      setSincronizando(true);
      const clean = selecionada.cnpj.replace(/\D/g, "");
      const res = await apiFetch(`/api/cnpj/${clean}`);
      const sociosReceita = normalizarSociosReceita(res?.qsa);
      const match = sociosReceita.find((item: any) => {
        const mesmoDoc = item.cpf_cnpj && socio.cpf_cnpj && String(item.cpf_cnpj).replace(/\D/g, '') === String(socio.cpf_cnpj).replace(/\D/g, '');
        const mesmoNome = String(item.nome || '').trim().toLowerCase() === String(socio.nome || '').trim().toLowerCase();
        return mesmoDoc || mesmoNome;
      });
      if (!match) {
        toast.warning('Não encontramos atualização para este sócio na Receita Federal.');
        return;
      }
      const bulk = await apiFetch(`/api/empresas/${selecionada.id}/socios/bulk`, {
        method: 'POST',
        body: JSON.stringify({ socios: [match] }),
      });
      const atualizado = Array.isArray(bulk?.socios) ? bulk.socios[0] : null;
      if (atualizado) setSociosEmpresa(prev => prev.map((s: any) => s.id === atualizado.id ? atualizado : s));
      const reload = await apiFetch(`/api/empresas/${selecionada.id}/socios`).catch(() => null);
      if (Array.isArray(reload)) setSociosEmpresa(reload);
      toast.success('Sócio atualizado sem apagar dados manuais.');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar sócio');
    } finally {
      setSincronizando(false);
    }
  };

  const apagarSocio = async (socio: any) => {
    if (!selecionada?.id || !socio?.id) return;
    if (!confirm(`Apagar o sócio ${socio.nome}?`)) return;
    try {
      await apiFetch(`/api/empresas/${selecionada.id}/socios/${socio.id}`, { method: 'DELETE' });
      setSociosEmpresa(prev => prev.filter((s: any) => s.id !== socio.id));
      toast.success('Sócio apagado.');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao apagar sócio');
    }
  };

  const enviarContratoSocial = async (file: File) => {
    if (!selecionada?.id) return;
    if (file.type !== 'application/pdf') { toast.error('Envie apenas PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('PDF acima de 10MB.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      setEnviandoContratoSocial(true);
      await apiFetch(`/api/empresas/${selecionada.id}/contrato-social/upload`, { method: 'POST', body: fd, headers: {} });
      const lista = await apiFetch(`/api/empresas/${selecionada.id}/contrato-social`).catch(() => []);
      setContratosSociais(Array.isArray(lista) ? lista : []);
      toast.success('Contrato social enviado.');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar contrato social.');
    } finally {
      setEnviandoContratoSocial(false);
    }
  };

  const removerContratoSocial = async (id: string) => {
    if (!selecionada?.id || !confirm('Apagar este contrato social?')) return;
    try {
      await apiFetch(`/api/empresas/${selecionada.id}/contrato-social/${id}`, { method: 'DELETE' });
      setContratosSociais(prev => prev.filter((c: any) => c.id !== id));
      toast.success('Contrato social removido.');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover contrato social.');
    }
  };

  // ── Colaboradores ──────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/colaboradores/para-empresa")
      .then((d: any) => { setCaptacao(d?.captacao || []); setAtendimento(d?.atendimento || []); })
      .catch(() => {
        apiFetch("/api/colaboradores").then((d: any[]) => {
          const a = (d || []).filter((c: any) => c.ativo);
          setCaptacao(a); setAtendimento(a);
        }).catch(() => {});
      });
  }, []);

  // ── Carregar empresas ──────────────────────────────────────────────────────
  const [filtroOrigem, setFiltroOrigem] = useState("todos");
  const [filtroPorte, setFiltroPorte] = useState("todos");

  // ── Funções para abrir/baixar contratos com autenticação Bearer ──────────
  async function handleVerContrato(contratoId: string) {
    try {
      const { blob, contentType } = await apiFetchBlob(`/api/contratos/${contratoId}/visualizar`);
      const url = URL.createObjectURL(new Blob([blob], { type: contentType || "application/pdf" }));
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
      else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao visualizar contrato");
    }
  }

  async function handleBaixarContrato(contratoId: string, numero?: string) {
    try {
      const { blob, filename, contentType } = await apiFetchBlob(`/api/contratos/${contratoId}/download`);
      const url = URL.createObjectURL(new Blob([blob], { type: contentType || "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${numero || `contrato-${contratoId.slice(0, 8)}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar contrato");
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const carregarEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (busca.trim()) p.set("busca", busca.trim());
      if (filtroStatus !== "todos") p.set("status", filtroStatus);
      if (filtroOrigem !== "todos") p.set("origem", filtroOrigem);
      if (filtroPorte !== "todos") p.set("porte", filtroPorte);
      const data = await apiFetch(`/api/empresas?${p.toString()}`);
      setEmpresas(Array.isArray(data) ? data : []);
    } catch { toast.error("Erro ao carregar empresas."); }
    setLoading(false);
  }, [busca, filtroStatus, filtroOrigem, filtroPorte]);

  useEffect(() => {
    const t = setTimeout(carregarEmpresas, busca ? 400 : 0);
    return () => clearTimeout(t);
  }, [carregarEmpresas]);

  // ── Reabrir detalhe da empresa via URL/retorno do acervo ─────────────────────
  // Garante que o botão "Voltar para a empresa" do acervo reabra a empresa correta,
  // mesmo se o roteador perder a query string durante a navegação. Não altera dados.
  useEffect(() => {
    const queryString = location.split("?")[1] || "";
    const params = new URLSearchParams(queryString);
    let empresaIdParam = params.get("empresa") || params.get("empresa_id") || params.get("id");
    let abaParam = params.get("aba");

    if (!empresaIdParam) {
      try {
        const raw = sessionStorage.getItem("destrava_empresa_retorno_acervo");
        const retorno = raw ? JSON.parse(raw) : null;
        const recente = retorno?.ts && Date.now() - Number(retorno.ts) < 10 * 60 * 1000;
        if (retorno?.empresaId && recente) {
          empresaIdParam = retorno.empresaId;
          abaParam = retorno.aba || "documentos";
          sessionStorage.removeItem("destrava_empresa_retorno_acervo");
          setLocation(`/colaborador/empresas?empresa=${empresaIdParam}&aba=${abaParam}`);
        }
      } catch {}
    }

    if (!empresaIdParam) return;

    if (selecionada?.id === empresaIdParam) {
      setShowDetail(true);
      if (isAbaEmpresa(abaParam)) setAbaAtiva(abaParam);
      return;
    }

    const encontrada = empresas.find((emp) => emp.id === empresaIdParam);
    if (encontrada) {
      setSelecionada(encontrada);
      setShowDetail(true);
      if (isAbaEmpresa(abaParam)) setAbaAtiva(abaParam);
      return;
    }

    let cancelado = false;
    apiFetch(`/api/empresas/${empresaIdParam}`)
      .then((empresa) => {
        if (cancelado || !empresa?.id) return;
        setSelecionada(empresa);
        setShowDetail(true);
        if (isAbaEmpresa(abaParam)) setAbaAtiva(abaParam);
      })
      .catch(() => {
        if (!cancelado) toast.error("Não foi possível reabrir a empresa selecionada.");
      });

    return () => { cancelado = true; };
  }, [location, empresas, selecionada?.id]);

  // ── Carregar detalhe ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selecionada) return;
    const queryString = location.split("?")[1] || "";
    const abaParam = new URLSearchParams(queryString).get("aba");
    setAbaAtiva(isAbaEmpresa(abaParam) ? abaParam : "visao_geral");
    setFollowups([]); setHistorico([]); setDocumentos([]); setContratosSociais([]); setSociosEmpresa([]);
    setSimulacoesEmpresa([]); setContratosEmpresa([]);
    setLoadingDetalhe(true);
    Promise.all([
      apiFetch(`/api/empresas/${selecionada.id}/followups`).catch(() => []),
      apiFetch(`/api/empresas/${selecionada.id}/historico`).catch(() => []),
      apiFetch(`/api/empresas/${selecionada.id}/documentos`).catch(() => []),
      apiFetch(`/api/empresas/${selecionada.id}/contrato-social`).catch(() => []),
      apiFetch(`/api/empresas/${selecionada.id}/socios`).catch(() => []),
      apiFetch(`/api/empresas/${selecionada.id}/simulacoes`).catch(() => []),
      apiFetch(`/api/empresas/${selecionada.id}/contratos`).catch(() => []),
    ]).then(([f, h, d, cs, s, sim, cont]) => {
      setFollowups(Array.isArray(f) ? f : []);
      setHistorico(Array.isArray(h) ? h : []);
      setDocumentos(Array.isArray(d) ? d : []);
      setContratosSociais(Array.isArray(cs) ? cs : []);
      setSociosEmpresa(Array.isArray(s) ? s : []);
      setSimulacoesEmpresa(Array.isArray(sim) ? sim : []);
      setContratosEmpresa(Array.isArray(cont) ? cont : []);
    }).finally(() => setLoadingDetalhe(false));
  }, [selecionada?.id, location]);

  // ── Selecionar empresa ──────────────────────────────────────────────────────
  function selecionar(emp: Empresa) {
    setSelecionada(emp);
    setShowDetail(true);
    setLocation(`/colaborador/empresas?empresa=${emp.id}`);
  }

  // ── Histórico ──────────────────────────────────────────────────────────────
  async function adicionarHistorico(descricao: string, tipo = "nota") {
    if (!selecionada || !descricao.trim()) return;
    try {
      await apiFetch(`/api/empresas/${selecionada.id}/historico`, { method: "POST", body: JSON.stringify({ tipo, descricao }) });
      const h = await apiFetch(`/api/empresas/${selecionada.id}/historico`).catch(() => []);
      setHistorico(Array.isArray(h) ? h : []);
      setNovaObs(""); toast.success("Nota adicionada.");
    } catch { toast.error("Erro ao adicionar nota."); }
  }

  async function salvarFollowup() {
    if (!selecionada || !novoFollowup.titulo.trim()) return;
    try {
      await apiFetch(`/api/empresas/${selecionada.id}/followups`, { method: "POST", body: JSON.stringify(novoFollowup) });
      const f = await apiFetch(`/api/empresas/${selecionada.id}/followups`).catch(() => []);
      setFollowups(Array.isArray(f) ? f : []);
      setNovoFollowup({ titulo: "", tipo: "ligacao", data_agendada: "", descricao: "" });
      setShowFollowupForm(false); toast.success("Conversa salva.");
    } catch { toast.error("Erro ao salvar conversa."); }
  }

  async function concluirFollowup(id: string) {
    if (!selecionada) return;
    try {
      await apiFetch(`/api/empresas/${selecionada.id}/followups/${id}/concluir`, { method: "PATCH" });
      setFollowups(prev => prev.map(f => f.id === id ? { ...f, concluido: true } : f));
      adicionarHistorico("Conversa concluída", "followup");
    } catch { toast.error("Erro."); }
  }

  // ── Atualizar cadastro via CNPJ/Receita (busca, decide fonte confiável, salva no banco e atualiza a tela) ──
  async function sincronizarDados(empresa: Empresa, opts: { silencioso?: boolean } = {}) {
    if (!empresa.cnpj || sincronizando) return;
    setSincronizando(true);
    if (!opts.silencioso) toast.loading("Atualizando cadastro com dados da Receita e salvando no banco...", { id: "sync" });
    try {
      const cnpjDigits = empresa.cnpj.replace(/\D/g, "");
      const dadosReceita = await apiFetch(`/api/cnpj/${cnpjDigits}`);
      const camposAtualizados = mapCnpjDataParaEmpresa(dadosReceita, empresa);
      const atualizada = await apiFetch(`/api/empresas/${empresa.id}`, {
        method: "PATCH",
        body: JSON.stringify(camposAtualizados),
      });

      setSelecionada(atualizada);
      setEmpresas(prev => prev.map(e => e.id === empresa.id ? atualizada : e));
      await carregarEmpresas();

      // Sócios/QSA não podem travar a atualização cadastral. Se falhar, a empresa continua sincronizada.
      const sociosReload = await apiFetch(`/api/empresas/${empresa.id}/socios`).catch(() => []);
      if (Array.isArray(sociosReload)) setSociosEmpresa(sociosReload);

      if (!opts.silencioso) {
        const cidadeUf = [atualizada?.cidade, atualizada?.estado].filter(Boolean).join(" / ");
        toast.success(
          cidadeUf
            ? `Cadastro atualizado e salvo: ${cidadeUf}.`
            : "Cadastro atualizado e salvo com dados da Receita.",
          { id: "sync" }
        );
      }
    } catch (err: any) {
      const msg = mensagemErroApi(err, "Erro ao atualizar e salvar cadastro pela Receita Federal.");
      if (!opts.silencioso) toast.error(msg, { id: "sync" });
      else console.error('[auto-sync empresa]', msg, err);
    } finally {
      setSincronizando(false);
    }
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function abrirNova() {
    setEditando(null); setForm({ ...FORM_VAZIO }); setErros({});
    setSecaoAberta("basico"); setTagInput("");
    setEtapaModal("cnpj"); setCnpjInput(""); cnpjReset(); setSocios([]);
    setModalAberto(true);
  }

  function abrirEditar(emp: Empresa) {
    setEditando(emp);
    setForm({
      razao_social: emp.razao_social, nome_fantasia: emp.nome_fantasia || "", cnpj: emp.cnpj || "",
      inscricao_estadual: emp.inscricao_estadual || "", natureza_juridica: emp.natureza_juridica || "",
      capital_social: emp.capital_social, cnae_principal: emp.cnae_principal || "", cnaes_secundarios: emp.cnaes_secundarios || [],
      data_abertura: emp.data_abertura || "", situacao_cadastral: emp.situacao_cadastral || "", matriz_filial: emp.matriz_filial || "",
      ultima_sincronizacao_receita: emp.ultima_sincronizacao_receita || "", data_situacao_cadastral: emp.data_situacao_cadastral || "", motivo_situacao_cadastral: emp.motivo_situacao_cadastral || "", regime_tributario: emp.regime_tributario || "", email: emp.email || "", telefone: emp.telefone || "", telefone_2: emp.telefone_2 || "",
      whatsapp: emp.whatsapp || "", site: emp.site || "", segmento: emp.segmento || "",
      porte: emp.porte || "mei", faturamento_anual: emp.faturamento_anual,
      numero_funcionarios: emp.numero_funcionarios, cep: emp.cep || "", logradouro: emp.logradouro || "",
      numero: emp.numero || "", complemento: emp.complemento || "", bairro: emp.bairro || "",
      cidade: emp.cidade || "", estado: emp.estado || "", responsavel_nome: emp.responsavel_nome || "",
      responsavel_cpf: emp.responsavel_cpf || "", responsavel_cargo: emp.responsavel_cargo || "",
      responsavel_telefone: emp.responsavel_telefone || "", responsavel_email: emp.responsavel_email || "",
      banco_principal: emp.banco_principal || "", agencia: emp.agencia || "", conta: emp.conta || "",
      limite_credito_atual: emp.limite_credito_atual, score_serasa: emp.score_serasa,
      score_spc: emp.score_spc, status: emp.status, origem: emp.origem || "manual",
      tags: emp.tags || [], observacoes: emp.observacoes || "",
      captador_id: emp.captador_id || undefined, analista_id: emp.analista_id || undefined,
    });
    setErros({}); setSecaoAberta("basico"); setTagInput(""); setSocios([]);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false); setEditando(null); setForm({ ...FORM_VAZIO }); setErros({});
    setEtapaModal("cnpj"); setCnpjInput(""); cnpjReset(); setSocios([]);
  }

  function set(k: keyof FormEmpresa, v: any) {
    setForm(prev => ({ ...prev, [k]: v }));
    setErros(prev => ({ ...prev, [k]: "" }));
  }

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.razao_social.trim()) e.razao_social = "Campo obrigatório";
    if (!String(form.cnpj || "").replace(/\D/g, "").match(/^\d{14}$/)) e.cnpj = "CNPJ obrigatório";
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
        capital_social: form.capital_social || null,
        cnaes_secundarios: Array.isArray(form.cnaes_secundarios) ? form.cnaes_secundarios : [],
        numero_funcionarios: form.numero_funcionarios || null,
        limite_credito_atual: form.limite_credito_atual || null,
        score_serasa: form.score_serasa || null,
        score_spc: form.score_spc || null,
      };
      if (editando) {
        await apiFetch(`/api/empresas/${editando.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (socios.length > 0) {
          await apiFetch(`/api/empresas/${editando.id}/socios/bulk`, {
            method: "POST",
            body: JSON.stringify({ socios: normalizarSociosReceita(socios as any[]), replace: true }),
          }).catch(() => null);
        }
        toast.success("Empresa atualizada!");
      } else {
        const criada = await apiFetch("/api/empresas", { method: "POST", body: JSON.stringify(payload) });
        // Não é preciso um segundo round-trip de sincronização aqui: os dados da Receita
        // (endereço, CNAE, sócios etc.) já vieram no passo de consulta do CNPJ, antes do
        // formulário abrir, e já estão no `payload` que acabou de ser salvo em POST /api/empresas.
        if (criada?.id && socios.length > 0) {
          await apiFetch(`/api/empresas/${criada.id}/socios/bulk`, {
            method: "POST",
            body: JSON.stringify({ socios: normalizarSociosReceita(socios as any[]), replace: true }),
          }).catch(() => null);
        }
        toast.success("Empresa cadastrada e cadastro atualizado pela Receita.");
      }
      fecharModal(); carregarEmpresas();
    } catch (err: any) { toast.error(err?.message || "Erro ao salvar."); }
    setSalvando(false);
  }

  async function handleExcluir(id: string) {
    try {
      const result = await apiFetch(`/api/empresas/${id}`, { method: "DELETE" });
      toast.success(result?.message || "Empresa arquivada. Documentos preservados.");
      setConfirmDelete(null);
      if (selecionada?.id === id) { setSelecionada(null); setShowDetail(false); }
      setEmpresas(prev => prev.filter(e => e.id !== id));
      await carregarEmpresas();
    } catch (err: any) {
      toast.error(mensagemErroApi(err, "Erro ao arquivar empresa."));
    }
  }

  async function exportarRelatorio(formato: 'csv' | 'json' = 'csv') {
    try {
      const params = new URLSearchParams({ formato });
      if (filtroStatus && filtroStatus !== 'todos') params.set('status', filtroStatus);
      if (filtroPorte && filtroPorte !== 'todos') params.set('porte', filtroPorte);
      if (busca && busca.trim()) params.set('busca', busca.trim());
      const url = `/api/empresas/relatorio?${params.toString()}`;
      if (formato === 'csv') {
        const token = localStorage.getItem('destrava_token') || localStorage.getItem('token') || '';
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Erro ao gerar relatório');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `relatorio-empresas-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success('Relatório exportado com sucesso!');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao exportar relatório.');
    }
  }
  async function buscarCEP(cep: string) {
    const n = cep.replace(/\D/g, "");
    if (n.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
      const d = await r.json();
      if (!d.erro) {
        set("logradouro", d.logradouro || ""); set("bairro", d.bairro || "");
        set("cidade", d.localidade || ""); set("estado", d.uf || "");
      }
    } catch { /* silencioso */ }
  }

  // ── Stats header ───────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        .emp-page { font-family: 'DM Sans', sans-serif; }
        .emp-page * { box-sizing: border-box; }
        .scroll-area::-webkit-scrollbar { width: 4px; }
        .scroll-area::-webkit-scrollbar-track { background: transparent; }
        .scroll-area::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .list-item:hover .arrow-icon { opacity: 1; transform: translateX(2px); }
        .arrow-icon { opacity: 0; transition: all 0.2s; }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .slide-up { animation: slideUp 0.25s ease forwards; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .fade-in { animation: fadeIn 0.2s ease forwards; }
        /* ── Responsividade mobile ── */
        @media (max-width: 639px) {
          .emp-detail-header { flex-direction: column; gap: 8px; }
          .emp-action-btns { flex-wrap: wrap; gap: 4px; }
          .emp-action-btns button { font-size: 10px; padding: 4px 8px; }
          .emp-tiles-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .emp-info-grid { grid-template-columns: 1fr !important; }
        }
        /* ── Desktop wide ── */
        @media (min-width: 1280px) {
          .emp-tiles-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
        /* ── Tablet ── */
        @media (min-width: 640px) and (max-width: 1023px) {
          .emp-tiles-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        /* ── Melhorias gerais ── */
        .emp-list-item { transition: background-color 0.15s ease, transform 0.1s ease; }
        .emp-list-item:hover { transform: translateX(1px); }
        .emp-badge { white-space: nowrap; }
        .emp-tab-btn { transition: all 0.15s ease; }
      `}</style>

      <div className="emp-page min-h-screen overflow-x-hidden bg-[#f8f9fc]">

        {/* ── Layout principal em tela cheia útil ── */}
        <div className="max-w-none w-full px-3 sm:px-4 py-2">
          <div className="flex flex-col gap-3 min-h-0">

            {/* ── BARRA SUPERIOR: seletor de empresa com busca ── */}
            <div className={`shrink-0 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm ${showDetail ? "hidden sm:block" : ""}`}>
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                  <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">Empresas</h1>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    {loading ? "Carregando..." : `${empresas.length} encontrada${empresas.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => exportarRelatorio('csv')}
                    className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-2 rounded-xl font-bold text-xs transition-colors shrink-0"
                    title="Exportar relatório CSV"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    onClick={abrirNova}
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl font-bold text-xs transition-colors shadow-sm shadow-blue-200 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova
                  </button>
                </div>
              </div>

              {/* Select com busca */}
              <div ref={comboRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setComboAberto(v => !v); setTimeout(() => searchRef.current?.focus(), 0); }}
                  className="w-full flex items-center gap-2.5 h-11 px-3 border border-slate-200 rounded-xl bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-left"
                >
                  {selecionada ? (
                    <>
                      <Search className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="flex-1 min-w-0 text-sm font-semibold text-slate-500 truncate">Trocar empresa ou buscar outra...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="flex-1 text-sm text-slate-400">Selecione ou busque uma empresa...</span>
                    </>
                  )}
                  <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${comboAberto ? "rotate-90" : ""}`} />
                </button>

                {comboAberto && (
                  <div className="absolute z-30 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden fade-in">
                    <div className="p-2 border-b border-slate-100 space-y-1.5">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          ref={searchRef}
                          value={busca}
                          onChange={e => setBusca(e.target.value)}
                          placeholder="Buscar empresa, CNPJ..."
                          className="w-full pl-9 pr-8 h-9 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {busca && (
                          <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            <X className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="flex-1 h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="todos">Todos os status</option>
                          {Object.entries(STATUS_CFG).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                        </select>
                        <select value={filtroPorte} onChange={e => setFiltroPorte(e.target.value)} className="h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="todos">Todos os portes</option>
                          <option value="MEI">MEI</option><option value="ME">ME</option><option value="EPP">EPP</option>
                          <option value="Médio">Médio</option><option value="Grande">Grande</option>
                        </select>
                        <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} className="h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="todos">Todas as origens</option>
                          <option value="simulador">Simulador</option><option value="indicacao">Indicação</option>
                          <option value="campanha">Campanha</option><option value="site">Site</option><option value="manual">Manual</option>
                        </select>
                        <button onClick={carregarEmpresas} className="h-8 px-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-500 transition-colors" title="Atualizar">
                          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        </button>
                      </div>
                    </div>
                    <div className="scroll-area overflow-y-auto max-h-[360px] p-1.5 space-y-1">
                      {loading ? (
                        <LoadingState message="Carregando empresas…" className="py-10" />
                      ) : empresas.length === 0 ? (
                        <EmptyState
                          preset="empresas"
                          title="Nenhuma empresa encontrada"
                          description="Cadastre a primeira empresa para começar."
                          action={<button onClick={abrirNova} className="text-xs text-blue-600 hover:underline">+ Cadastrar primeira empresa</button>}
                          className="py-10"
                        />
                      ) : empresas.map(emp => {
                        const sc = STATUS_CFG[emp.status] || STATUS_CFG.ativo;
                        const ativa = selecionada?.id === emp.id;
                        return (
                          <button
                            key={emp.id}
                            onClick={() => { selecionar(emp); setComboAberto(false); }}
                            className={`list-item w-full text-left p-2.5 rounded-lg border transition-all ${
                              ativa ? "border-blue-200 bg-blue-50" : "border-transparent hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0 ${ativa ? "bg-blue-600" : "bg-slate-700"}`}>
                                {getInitials(emp.razao_social)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{emp.razao_social}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sc.badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                                  </span>
                                  {(emp.cidade || emp.estado) && (
                                    <span className="text-[10px] text-slate-400 truncate">{[emp.cidade, emp.estado].filter(Boolean).join(", ")}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>


            {/* ── Detalhe ── */}
            <div className="flex-1 min-w-0">
              {!selecionada ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[420px] gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-500">Selecione uma empresa</p>
                    <p className="text-xs text-slate-400 mt-1">Use o campo de busca acima para encontrar e abrir os detalhes</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden slide-up flex flex-col min-w-0">

                  {/* ── Header detalhe ── */}
                  <div className="px-3 sm:px-4 py-2 border-b border-slate-100 shrink-0 bg-white">
                    <div className="flex items-start gap-3">
                      {/* Botão voltar mobile */}
                      <button
                        onClick={() => { setSelecionada(null); setShowDetail(false); setLocation("/colaborador/empresas"); }}
                        className="sm:hidden mt-0.5 shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      {/* Avatar grande */}
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm shadow-blue-100">
                        {getInitials(selecionada.razao_social)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-900 leading-tight truncate">{selecionada.razao_social}</h2>
                            {selecionada.nome_fantasia && (
                              <p className="text-xs text-slate-500 mt-0.5 truncate">{selecionada.nome_fantasia}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <StatusBadge status={selecionada.status} />
                              {selecionada.porte && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PORTE_CFG[selecionada.porte]?.color || "bg-slate-100 text-slate-500"}`}>
                                  {PORTE_CFG[selecionada.porte]?.label}
                                </span>
                              )}
                              {selecionada.natureza_juridica && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                                  {selecionada.natureza_juridica}
                                </span>
                              )}
                              {selecionada.situacao_cadastral && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                  Receita: {selecionada.situacao_cadastral}
                                </span>
                              )}
                              {selecionada.segmento && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {selecionada.segmento}
                                </span>
                              )}
                            </div>
                            <div className="emp-info-grid mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5 max-w-[760px]">
                              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">CNPJ</p>
                                <p className="text-xs font-bold text-slate-700 mt-0.5 truncate">{selecionada.cnpj || "Não informado"}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Localização</p>
                                <p className="text-xs font-bold text-slate-700 mt-0.5 truncate">{[selecionada.cidade, selecionada.estado].filter(Boolean).join(" / ") || "Não informado"}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Contato principal</p>
                                <p className="text-xs font-bold text-slate-700 mt-0.5 truncate">{selecionada.responsavel_nome || selecionada.telefone || selecionada.whatsapp || "Não informado"}</p>
                              </div>
                            </div>
                          </div>
                          {/* Ações */}
                          <div className="emp-action-btns flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {/* Botão Sincronizar — só aparece se tem CNPJ */}
                            {selecionada.cnpj && (
                              <button
                                onClick={() => sincronizarDados(selecionada)}
                                disabled={sincronizando}
                                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                title="Atualizar e salvar cadastro pela Receita Federal"
                              >
                                <RotateCw className={`w-3.5 h-3.5 ${sincronizando ? "animate-spin" : ""}`} />
                                <span className="hidden md:inline">{sincronizando ? "Atualizando..." : "Atualizar cadastro"}</span>
                              </button>
                            )}
                            <button
                              onClick={() => selecionada && abrirEditar(selecionada)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span className="hidden md:inline">Editar</span>
                            </button>
                            {confirmDelete === selecionada.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleExcluir(selecionada.id)} className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">Confirmar</button>
                                <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(selecionada.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Quick Actions ── */}
                  <div className="px-3 sm:px-4 py-1 border-b border-slate-100 bg-slate-50/60 shrink-0">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => {
                          sessionStorage.setItem("calculadora_empresa", JSON.stringify({
                            nome: selecionada.responsavel_nome || selecionada.razao_social,
                            empresa: selecionada.razao_social,
                            telefone: selecionada.telefone || selecionada.whatsapp || "",
                            cpf_cnpj: selecionada.cnpj || "",
                          }));
                          window.location.href = "/colaborador/calculadora";
                        }}
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Nova Simulação"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        <span>Nova Simulação</span>
                      </button>
                      <button
                        onClick={() => window.location.href = "/colaborador/contratos"}
                        className="flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg hover:bg-violet-100 transition-colors"
                        title="Novo Contrato"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Novo Contrato</span>
                      </button>
                      <button
                        onClick={() => { setAbaAtiva("followup"); setShowFollowupForm(true); }}
                        className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors"
                        title="Iniciar conversa"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span>Iniciar conversa</span>
                      </button>
                    </div>
                  </div>

                  {/* ── Score rápido ── */}
                  {(() => {
                    const { score, risco, tags } = calcularScore(selecionada);
                    const rCfg = {
                      baixo:   { label: "Baixo",   wrap: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-100 text-emerald-700", Icon: ShieldCheck, ic: "text-emerald-600" },
                      medio:   { label: "Médio",   wrap: "bg-amber-50 border-amber-200",   badge: "bg-amber-100 text-amber-700",   Icon: ShieldAlert,  ic: "text-amber-600" },
                      alto:    { label: "Alto",    wrap: "bg-orange-50 border-orange-200", badge: "bg-orange-100 text-orange-700", Icon: AlertTriangle,ic: "text-orange-600" },
                      critico: { label: "Crítico", wrap: "bg-red-50 border-red-200",       badge: "bg-red-100 text-red-700",       Icon: ShieldOff,    ic: "text-red-600" },
                    }[risco] || { label: "—", wrap: "bg-slate-50 border-slate-200", badge: "bg-slate-100 text-slate-600", Icon: ShieldCheck, ic: "text-slate-500" };
                    return (
                      <div className={`mx-3 sm:mx-4 mt-1 rounded-lg border px-2 py-1 shrink-0 ${rCfg.wrap}`}>
                        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
                          <div className="flex items-center gap-2 min-w-[190px]">
                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 border border-white shadow-sm">
                              <rCfg.Icon className={`w-3.5 h-3.5 ${rCfg.ic}`} />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-slate-800">Score Destrava</span>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${rCfg.badge}`}>Risco {rCfg.label}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Situação atual</p>
                            </div>
                          </div>

                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <div className="min-w-[44px]">
                              <div className="text-base font-black text-slate-900 leading-none">{score}</div>
                              <div className="text-[10px] font-semibold text-slate-400 mt-0.5">/100</div>
                            </div>
                            <div className="flex-1 min-w-[140px]">
                              <ScoreBar score={score} risco={risco} />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1 lg:max-w-[420px]">
                            {tags.slice(0, 3).map((t, i) => (
                              <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.ok ? "bg-white text-slate-600 border border-slate-200" : "bg-white text-rose-600 border border-rose-200"}`}>
                                {t.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Abas ── */}
                  <div className="border-b border-slate-200 px-3 sm:px-4 py-1 bg-white shrink-0">
                    <div className="flex flex-wrap gap-1">
                      {([
                        { id: "visao_geral", label: "Dados da Empresa", badge: sociosExibicao.length || undefined },
                        { id: "dossie_credito", label: "Dossiê / Laudo IA" },
                        { id: "documentos", label: "Acervo Documental", badge: documentos.length + contratosSociais.length || undefined },
                        { id: "followup", label: "Conversas", badge: followups.filter(f => !f.concluido).length || undefined },
                        { id: "simulacoes", label: "Simulações", badge: simulacoesEmpresa.length || undefined },
                        { id: "contratos", label: "Contratos Firmados", badge: contratosEmpresa.length || undefined },
                        { id: "historico", label: "Histórico", badge: historico.length || undefined },
                      ] as const).map(aba => (
                        <button
                          key={aba.id}
                          onClick={() => {
                            setAbaAtiva(aba.id);
                            if (selecionada?.id) setLocation(`/colaborador/empresas?empresa=${selecionada.id}&aba=${aba.id}`);
                          }}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition-all whitespace-nowrap ${
                            abaAtiva === aba.id
                              ? "border-blue-300 bg-blue-600 text-white shadow-md shadow-blue-100"
                              : "border-slate-200 text-slate-600 bg-white hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {aba.label}
                          {(aba as any).badge > 0 && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                              abaAtiva === aba.id ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                            }`}>{(aba as any).badge}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Conteúdo das abas ── */}
                  <div className="min-w-0">
                    {loadingDetalhe ? (
                      <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                    ) : (

                    /* ── VISÃO GERAL ── */
                    abaAtiva === "visao_geral" ? (
                      <EmpresaDadosWorkspace
                        empresa={selecionada}
                        socios={sociosExibicao}
                        documentosTotal={documentos.length + contratosSociais.length}
                        simulacoesTotal={simulacoesEmpresa.length}
                        contratosTotal={contratosEmpresa.length}
                        sincronizando={sincronizando}
                        onSincronizar={() => sincronizarDados(selecionada)}
                        onEditar={() => abrirEditar(selecionada)}
                        onNovaSimulacao={() => {
                          sessionStorage.setItem("calculadora_empresa", JSON.stringify({
                            nome: selecionada.responsavel_nome || selecionada.razao_social,
                            empresa: selecionada.razao_social,
                            telefone: selecionada.telefone || selecionada.whatsapp || "",
                            cpf_cnpj: selecionada.cnpj || "",
                          }));
                          window.location.href = "/colaborador/calculadora";
                        }}
                        onNovoContrato={() => { window.location.href = "/colaborador/contratos"; }}
                        onIniciarConversa={() => { setAbaAtiva("followup"); setShowFollowupForm(true); if (selecionada?.id) setLocation(`/colaborador/empresas?empresa=${selecionada.id}&aba=followup`); }}
                        onAbrirAcervo={() => { setAbaAtiva("documentos"); if (selecionada?.id) setLocation(`/colaborador/empresas?empresa=${selecionada.id}&aba=documentos`); }}
                      />
                    )

                    /* ── DOSSIÊ DE CRÉDITO ── */
                    : abaAtiva === "dossie_credito" ? (
                      <DossieCreditoEmpresa
                        empresaId={selecionada?.id}
                        onAtualizarReceita={selecionada ? () => sincronizarDados(selecionada) : undefined}
                      />
                    )

                    /* ── SÓCIOS ── */
                    : abaAtiva === "socios" ? (
                      <div className="p-5 fade-in space-y-4">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <h3 className="text-sm font-bold text-slate-700">QSA e administração</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Quadro de Sócios e Administradores da empresa.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                              {sociosExibicao.length} sócio(s)
                            </span>
                            {selecionada.cnpj && (
                              <button
                                onClick={() => sincronizarDados(selecionada)}
                                disabled={sincronizando}
                                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                title="Atualizar dados societários"
                              >
                                <RotateCw className={`w-3 h-3 ${sincronizando ? "animate-spin" : ""}`} />
                                Atualizar dados societários
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 leading-relaxed">
                          Cadastro atualizado e salvo com dados da Receita/fontes confiáveis. Complete manualmente apenas o que não vier das fontes.
                        </div>

                        {sociosExibicao.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                              <Users className="w-6 h-6 text-slate-300" />
                            </div>
                            <p className="text-sm text-slate-500 font-medium">Nenhum sócio cadastrado</p>
                            <p className="text-xs text-slate-400">Nenhum sócio-administrador cadastrado. Atualize os dados ou complete manualmente o responsável da empresa.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {sociosExibicao.map((s: any) => {
                              const pendencias = Array.isArray(s.pendencias_contrato) ? s.pendencias_contrato : pendenciasSocioContrato(s);
                              const completo = pendencias.length === 0;
                              return (
                                <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow space-y-3">
                                  <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSociosExpandidos(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                                      {(s.nome?.charAt(0) ?? "?").toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate">{s.nome}</p>
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {s.qualificacao_socio && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{s.qualificacao_socio}</span>}
                                        {s.representante_legal && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Representante legal</span>}
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${completo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                          {completo ? 'Completo para contrato' : `${pendencias.length} pendência(s)`}
                                        </span>
                                      </div>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 mt-2 transition-transform ${sociosExpandidos[s.id] ? 'rotate-180' : ''}`} />
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">CPF/CNPJ do sócio</span><b className="text-slate-700 font-mono">{s.cpf_cnpj || 'Não informado'}</b>{s.inferido_empresa ? <button onClick={() => selecionada && abrirEditar(selecionada)} className="block mt-1 text-[11px] font-bold text-blue-600 hover:underline">Completar no cadastro</button> : <button onClick={() => { const cpf = prompt('Informe o CPF completo do sócio'); if (cpf) atualizarCpfManualSocio(s, cpf); }} className="block mt-1 text-[11px] font-bold text-blue-600 hover:underline">Informar CPF completo</button>}</div>
                                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Entrada na sociedade</span><b className="text-slate-700">{s.data_entrada_sociedade ? new Date(s.data_entrada_sociedade).toLocaleDateString('pt-BR') : 'Não informado'}</b></div>
                                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">País</span><b className="text-slate-700">{s.pais || 'Não informado'}</b></div>
                                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Representante legal</span><b className="text-slate-700">{s.nome_representante || (s.representante_legal ? 'Sim' : 'Não informado')}</b></div>
                                  </div>

                                  {sociosExpandidos[s.id] && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Qualificação representante</span><b className="text-slate-700">{s.qualificacao_representante || 'Não informado'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Nascimento</span><b className="text-slate-700">{s.data_nascimento ? new Date(s.data_nascimento).toLocaleDateString('pt-BR') : 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Gênero</span><b className="text-slate-700">{s.genero || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Estado civil</span><b className="text-slate-700">{s.estado_civil || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Profissão</span><b className="text-slate-700">{s.profissao || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">RG</span><b className="text-slate-700">{s.rg || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Cônjuge</span><b className="text-slate-700">{s.conjuge_nome || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Endereço</span><b className="text-slate-700">{[s.logradouro, s.numero, s.bairro, s.cidade, s.uf].filter(Boolean).join(', ') || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">E-mail</span><b className="text-slate-700 truncate block">{s.email || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="block text-slate-400">Telefone/WhatsApp</span><b className="text-slate-700">{s.whatsapp || s.telefone || 'Pendente'}</b></div>
                                    </div>
                                  )}

                                  {sociosExpandidos[s.id] && !s.inferido_empresa && (
                                    <div className="border-t border-slate-100 pt-3">
                                      <DocumentosEntidade
                                        entidadeTipo="socio"
                                        entidadeId={s.id}
                                        empresaId={selecionada?.id}
                                        socioId={s.id}
                                        tiposPermitidos={["documento_socio", "cpf", "rg", "cnh", "comprovante_residencia", "irpf", "recibo_irpf", "certidao_casamento", "averbacao_divorcio", "certidao_obito", "rating_bacen_cpf", "cenprot_cpf", "cnd_rfb_cpf", "cadin_cpf", "pgfn_cpf", "scr_cpf", "ccs_cpf", "ccf_cpf", "consulta_serasa_cpf", "procuracao", "outros"]}
                                        titulo={`Documentos do sócio: ${s.nome || "Sócio"}`}
                                        permitirUpload
                                        permitirExcluir
                                        permitirValidar
                                      />
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {s.inferido_empresa ? (
                                      <>
                                        <button onClick={() => selecionada && abrirEditar(selecionada)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Edit2 className="w-3 h-3" /> Completar dados</button>
                                        <button onClick={() => selecionada && sincronizarDados(selecionada)} disabled={sincronizando} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"><RotateCw className="w-3 h-3" /> Atualizar</button>
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={() => abrirEdicaoSocio(s)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Edit2 className="w-3 h-3" /> Editar</button>
                                        <button onClick={() => atualizarSocioIndividual(s)} disabled={sincronizando} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"><RotateCw className="w-3 h-3" /> Atualizar</button>
                                        <button onClick={() => apagarSocio(s)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"><Trash2 className="w-3 h-3" /> Apagar</button>
                                      </>
                                    )}
                                  </div>

                                  {pendencias.length > 0 && (
                                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                                      <p className="text-[11px] font-bold text-amber-700 mb-1">Pendências para contratos/análises</p>
                                      <div className="flex flex-wrap gap-1">
                                        {pendencias.slice(0, 8).map((p: string) => <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-700">{p}</span>)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )

                    /* ── FOLLOW-UP ── */
                    : abaAtiva === "followup" ? (
                      <div className="p-5 fade-in">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-slate-700">Conversas</h3>
                          <button onClick={() => setShowFollowupForm(true)} className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                            <PlusCircle className="w-3.5 h-3.5" /> Novo
                          </button>
                        </div>
                        {showFollowupForm && (
                          <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                            <input className={inputCls} placeholder="Título da conversa..." value={novoFollowup.titulo} onChange={e => setNovoFollowup(p => ({ ...p, titulo: e.target.value }))} />
                            <div className="grid grid-cols-2 gap-2">
                              <select className={selectCls} value={novoFollowup.tipo} onChange={e => setNovoFollowup(p => ({ ...p, tipo: e.target.value }))}>
                                <option value="ligacao">Ligação</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="email">E-mail</option>
                                <option value="reuniao">Reunião</option>
                                <option value="visita">Visita</option>
                                <option value="outro">Outro</option>
                              </select>
                              <input type="datetime-local" className={inputCls} value={novoFollowup.data_agendada} onChange={e => setNovoFollowup(p => ({ ...p, data_agendada: e.target.value }))} />
                            </div>
                            <textarea className={inputCls + " resize-none h-16 py-2"} placeholder="Descrição (opcional)..." value={novoFollowup.descricao} onChange={e => setNovoFollowup(p => ({ ...p, descricao: e.target.value }))} />
                            <div className="flex gap-2">
                              <button onClick={salvarFollowup} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors">Salvar</button>
                              <button onClick={() => setShowFollowupForm(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 text-sm py-2 rounded-lg hover:bg-slate-50 transition-colors">Cancelar</button>
                            </div>
                          </div>
                        )}
                        {followups.length === 0 && !showFollowupForm ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <Bell className="w-10 h-10 text-slate-200" />
                            <p className="text-sm text-slate-500">Nenhuma conversa registrada</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {followups.map(f => (
                              <div key={f.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${f.concluido ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:border-blue-200"}`}>
                                <button onClick={() => !f.concluido && concluirFollowup(f.id)} className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${f.concluido ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-emerald-400"}`}>
                                  {f.concluido && <CheckCircle className="w-3 h-3 text-white" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${f.concluido ? "line-through text-slate-400" : "text-slate-800"}`}>{f.titulo}</p>
                                  {f.descricao && <p className="text-xs text-slate-500 mt-0.5">{f.descricao}</p>}
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{f.tipo}</span>
                                    {f.data_agendada && (
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${!f.concluido && new Date(f.data_agendada) < new Date() ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                                        {new Date(f.data_agendada).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )

                    /* ── HISTÓRICO ── */
                    : abaAtiva === "historico" ? (
                      <div className="p-5 fade-in">
                        <div className="flex gap-2 mb-4">
                          <textarea
                            className={inputCls + " resize-none h-10 py-2 flex-1"}
                            placeholder="Adicionar nota ou observação (Ctrl+Enter)..."
                            value={novaObs}
                            onChange={e => setNovaObs(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) adicionarHistorico(novaObs); }}
                          />
                          <button onClick={() => adicionarHistorico(novaObs)} disabled={!novaObs.trim()} className="shrink-0 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        {historico.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <History className="w-10 h-10 text-slate-200" />
                            <p className="text-sm text-slate-500">Nenhum registro ainda</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {historico.map(h => (
                              <div key={h.id} className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center mt-0.5 shrink-0">
                                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-slate-600">{h.autor || "Sistema"}</span>
                                    <span className="text-[11px] text-slate-400">{new Date(h.created_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</span>
                                  </div>
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{h.descricao}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )

                    /* ── ACERVO DOCUMENTAL ── */
                    : abaAtiva === "documentos" ? (
                      <div className="p-3 fade-in">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">Acervo documental</p>
                                <h3 className="text-base font-black text-slate-950 leading-tight">Documentos da empresa</h3>
                                <p className="mt-0.5 text-xs text-slate-500">Uploads, visualização, validação e preservação em área exclusiva.</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{documentos.length + contratosSociais.length} registro(s)</span>
                              <button
                                type="button"
                                disabled={!selecionada?.id}
                                onClick={() => selecionada?.id && setLocation(`/colaborador/empresas/${selecionada.id}/acervo`)}
                                className="h-10 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                              >
                                <ExternalLink className="h-4 w-4" /> Abrir acervo
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : abaAtiva === "simulacoes" ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-700">Simulações vinculadas</h3>
                          <span className="text-xs text-slate-400">{simulacoesEmpresa.length} registro(s)</span>
                        </div>
                        {simulacoesEmpresa.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <span className="text-4xl">🧮</span>
                            <p className="text-sm text-slate-500">Nenhuma simulação vinculada a esta empresa</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {simulacoesEmpresa.map((sim: any) => (
                              <div key={sim.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                                  <span className="text-base">🧮</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-slate-800">{sim.produto || "Simulação"}</p>
                                    {sim.status && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                        sim.status === "aprovado" ? "bg-green-100 text-green-700" :
                                        sim.status === "reprovado" ? "bg-red-100 text-red-700" :
                                        "bg-slate-100 text-slate-600"
                                      }`}>{sim.status}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {sim.valor_solicitado && (
                                      <span className="text-xs text-slate-500">
                                        💰 {Number(sim.valor_solicitado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    )}
                                    {sim.prazo_meses && (
                                      <span className="text-xs text-slate-500">📅 {sim.prazo_meses}x</span>
                                    )}
                                    {sim.taxa_juros && (
                                      <span className="text-xs text-slate-500">📈 {sim.taxa_juros}% a.m.</span>
                                    )}
                                    {sim.valor_parcela && (
                                      <span className="text-xs text-slate-500">
                                        💳 {Number(sim.valor_parcela).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {sim.colaborador_nome && (
                                      <span className="text-xs text-slate-400">👤 {sim.colaborador_nome}</span>
                                    )}
                                    <span className="text-xs text-slate-400">
                                      {sim.criado_em ? new Date(sim.criado_em).toLocaleDateString("pt-BR") : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : abaAtiva === "contratos" ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-700">Contratos Firmados</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Acordos e termos de serviço gerados e assinados entre a plataforma e o cliente.</p>
                          </div>
                          <span className="text-xs text-slate-400">{contratosEmpresa.length} registro(s)</span>
                        </div>
                        {contratosEmpresa.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <span className="text-4xl">📄</span>
                            <p className="text-sm text-slate-500">Nenhum contrato firmado para esta empresa</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {contratosEmpresa.map((cont: any) => (
                              <div key={cont.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                                  <span className="text-base">📄</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-slate-800">
                                      {cont.numero_contrato || cont.protocolo_contrato || `Contrato #${cont.id?.slice(0,8)}`}
                                    </p>
                                    {cont.status && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                        cont.status === "ativo" || cont.status === "assinado" ? "bg-green-100 text-green-700" :
                                        cont.status === "cancelado" ? "bg-red-100 text-red-700" :
                                        cont.status === "pendente" ? "bg-yellow-100 text-yellow-700" :
                                        "bg-slate-100 text-slate-600"
                                      }`}>{cont.status}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {cont.tipo_contrato && (
                                      <span className="text-xs text-slate-500">📋 {cont.tipo_contrato}</span>
                                    )}
                                    {cont.valor_contrato && (
                                      <span className="text-xs text-slate-500">
                                        💰 {Number(cont.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    )}
                                    {cont.data_assinatura && (
                                      <span className="text-xs text-slate-500">
                                        ✍️ {new Date(cont.data_assinatura).toLocaleDateString("pt-BR")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {cont.responsavel_nome && (
                                      <span className="text-xs text-slate-400">👤 {cont.responsavel_nome}</span>
                                    )}
                                    <span className="text-xs text-slate-400">
                                      {cont.created_at ? new Date(cont.created_at).toLocaleDateString("pt-BR") : "—"}
                                    </span>
                                  </div>
                                </div>
                                {(cont.pdf_path || cont.id) && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => handleVerContrato(cont.id)}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Visualizar PDF"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleBaixarContrato(cont.id, cont.numero_contrato || cont.protocolo_contrato)}
                                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                      title="Baixar PDF"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL DE CADASTRO / EDIÇÃO
      ════════════════════════════════════════════════════════════════════ */}
      {socioEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sócio / Representante</h2>
                <p className="text-xs text-slate-500">Complete os dados exigidos para contratos, análises e assinatura.</p>
              </div>
              <button onClick={() => setSocioEditando(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              <SectionCard title="Dados societários importados" icon={<Users className="w-4 h-4" />}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3">
                  <MField label="Nome" required><input value={socioForm.nome || ''} onChange={e => setSocioCampo('nome', e.target.value)} className={inputCls} /></MField>
                  <MField label="CPF/CNPJ do sócio" required><input value={socioForm.cpf_cnpj || ''} onChange={e => setSocioCampo('cpf_cnpj', e.target.value)} className={inputCls} placeholder="CPF completo quando disponível" /></MField>
                  <MField label="Qualificação"><input value={socioForm.qualificacao_socio || ''} onChange={e => setSocioCampo('qualificacao_socio', e.target.value)} className={inputCls} placeholder="Sócio-administrador..." /></MField>
                  <MField label="Entrada na sociedade"><input type="date" value={socioForm.data_entrada_sociedade ? String(socioForm.data_entrada_sociedade).slice(0,10) : ''} onChange={e => setSocioCampo('data_entrada_sociedade', e.target.value)} className={inputCls} /></MField>
                  <MField label="Participação (%)"><input type="number" value={socioForm.percentual_capital || ''} onChange={e => setSocioCampo('percentual_capital', e.target.value)} className={inputCls} /></MField>
                  <label className="flex items-center gap-2 text-sm text-slate-700 pt-6"><input type="checkbox" checked={!!socioForm.representante_legal} onChange={e => setSocioCampo('representante_legal', e.target.checked)} /> Representante legal/assinante</label>
                </div>
              </SectionCard>

              <SectionCard title="Dados pessoais obrigatórios" icon={<User className="w-4 h-4" />} defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 py-3">
                  <MField label="RG / Documento" required><input value={socioForm.rg || ''} onChange={e => setSocioCampo('rg', e.target.value)} className={inputCls} /></MField>
                  <MField label="Órgão emissor"><input value={socioForm.rg_orgao_emissor || ''} onChange={e => setSocioCampo('rg_orgao_emissor', e.target.value)} className={inputCls} /></MField>
                  <MField label="UF emissão"><select value={socioForm.rg_uf_emissao || ''} onChange={e => setSocioCampo('rg_uf_emissao', e.target.value)} className={selectCls}><option value="">UF</option>{ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></MField>
                  <MField label="Data emissão"><input type="date" value={socioForm.rg_data_emissao ? String(socioForm.rg_data_emissao).slice(0,10) : ''} onChange={e => setSocioCampo('rg_data_emissao', e.target.value)} className={inputCls} /></MField>
                  <MField label="Nascimento"><input type="date" value={socioForm.data_nascimento ? String(socioForm.data_nascimento).slice(0,10) : ''} onChange={e => setSocioCampo('data_nascimento', e.target.value)} className={inputCls} /></MField>
                  <MField label="Nacionalidade" required><input value={socioForm.nacionalidade || ''} onChange={e => setSocioCampo('nacionalidade', e.target.value)} className={inputCls} /></MField>
                  <MField label="Estado civil" required><select value={socioForm.estado_civil || ''} onChange={e => setSocioCampo('estado_civil', e.target.value)} className={selectCls}><option value="">Selecione</option>{ESTADOS_CIVIS_SOCIO.map(v => <option key={v} value={v}>{v}</option>)}</select></MField>
                  <MField label="Profissão" required><input value={socioForm.profissao || ''} onChange={e => setSocioCampo('profissao', e.target.value)} className={inputCls} /></MField>
                  <MField label="E-mail" required><input value={socioForm.email || ''} onChange={e => setSocioCampo('email', e.target.value)} className={inputCls} /></MField>
                  <MField label="Telefone"><input value={socioForm.telefone || ''} onChange={e => setSocioCampo('telefone', e.target.value)} className={inputCls} /></MField>
                  <MField label="WhatsApp" required><input value={socioForm.whatsapp || ''} onChange={e => setSocioCampo('whatsapp', e.target.value)} className={inputCls} /></MField>
                  <label className="flex items-center gap-2 text-sm text-slate-700 pt-6"><input type="checkbox" checked={!!socioForm.pep} onChange={e => setSocioCampo('pep', e.target.checked)} /> PEP</label>
                </div>
              </SectionCard>

              <SectionCard title="Endereço residencial" icon={<MapPin className="w-4 h-4" />} defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 py-3">
                  <MField label="CEP" required><input value={socioForm.cep || ''} onChange={e => setSocioCampo('cep', e.target.value)} className={inputCls} /></MField>
                  <MField label="Logradouro" required><input value={socioForm.logradouro || ''} onChange={e => setSocioCampo('logradouro', e.target.value)} className={inputCls} /></MField>
                  <MField label="Número"><input value={socioForm.numero || ''} onChange={e => setSocioCampo('numero', e.target.value)} className={inputCls} /></MField>
                  <MField label="Complemento"><input value={socioForm.complemento || ''} onChange={e => setSocioCampo('complemento', e.target.value)} className={inputCls} /></MField>
                  <MField label="Bairro"><input value={socioForm.bairro || ''} onChange={e => setSocioCampo('bairro', e.target.value)} className={inputCls} /></MField>
                  <MField label="Cidade" required><input value={socioForm.cidade || ''} onChange={e => setSocioCampo('cidade', e.target.value)} className={inputCls} /></MField>
                  <MField label="UF" required><select value={socioForm.uf || ''} onChange={e => setSocioCampo('uf', e.target.value)} className={selectCls}><option value="">UF</option>{ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></MField>
                </div>
              </SectionCard>

              {(String(socioForm.estado_civil || '').toLowerCase().includes('casad') || String(socioForm.estado_civil || '').toLowerCase().includes('uni')) && (
                <SectionCard title="Cônjuge / regime de bens" icon={<Users className="w-4 h-4" />} defaultOpen>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3">
                    <MField label="Nome do cônjuge" required><input value={socioForm.conjuge_nome || ''} onChange={e => setSocioCampo('conjuge_nome', e.target.value)} className={inputCls} /></MField>
                    <MField label="CPF do cônjuge" required><input value={socioForm.conjuge_cpf || ''} onChange={e => setSocioCampo('conjuge_cpf', e.target.value)} className={inputCls} /></MField>
                    <MField label="Regime de bens" required><select value={socioForm.regime_bens || ''} onChange={e => setSocioCampo('regime_bens', e.target.value)} className={selectCls}><option value="">Selecione</option>{REGIMES_BENS.map(v => <option key={v} value={v}>{v}</option>)}</select></MField>
                    <MField label="RG do cônjuge"><input value={socioForm.conjuge_rg || ''} onChange={e => setSocioCampo('conjuge_rg', e.target.value)} className={inputCls} /></MField>
                    <MField label="Profissão do cônjuge"><input value={socioForm.conjuge_profissao || ''} onChange={e => setSocioCampo('conjuge_profissao', e.target.value)} className={inputCls} /></MField>
                    <MField label="Telefone do cônjuge"><input value={socioForm.conjuge_telefone || ''} onChange={e => setSocioCampo('conjuge_telefone', e.target.value)} className={inputCls} /></MField>
                  </div>
                </SectionCard>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button type="button" onClick={() => setSocioEditando(null)} className="h-9 px-4 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
              <button type="button" onClick={salvarSocio} disabled={salvandoSocio} className="flex items-center gap-2 h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50">
                {salvandoSocio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar sócio/representante
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">

            {/* Header do modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3">
                {!editando && etapaModal === "form" && (
                  <button onClick={() => { setEtapaModal("cnpj"); cnpjReset(); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {editando ? "Editar Empresa" : etapaModal === "cnpj" ? "Nova Empresa" : "Dados da Empresa"}
                </h2>
              </div>
              <button onClick={fecharModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── ETAPA CNPJ ── */}
            {!editando && etapaModal === "cnpj" && (
              <div className="flex flex-col items-center gap-6 p-8">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-blue-200">🏛️</div>
                  <h3 className="text-base font-bold text-slate-900">Informe o CNPJ</h3>
                  <p className="text-sm text-slate-500 mt-1">Dados preenchidos automaticamente via Receita Federal</p>
                </div>
                <div className="w-full max-w-xs">
                  <div className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3 bg-slate-50 transition-all ${
                    cnpjStatus === "loading" ? "border-blue-400" :
                    cnpjStatus === "found" ? "border-emerald-400 bg-emerald-50" :
                    cnpjStatus === "error" ? "border-red-300 bg-red-50" :
                    "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
                  }`}>
                    <span className="text-lg shrink-0">
                      {cnpjStatus === "loading" ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> :
                       cnpjStatus === "found" ? "✅" :
                       cnpjStatus === "error" ? "❌" : "🔍"}
                    </span>
                    <input
                      autoFocus
                      value={cnpjInput}
                      onChange={e => {
                        const f = fmtCNPJBrasil(e.target.value);
                        setCnpjInput(f);
                        const d = cleanDigits(f);
                        if (d.length < 14) { cnpjReset(); return; }
                        cnpjLookup(f, (data) => {
                          setSocios(data.qsa ?? []);
                          const campos = mapCnpjDataParaEmpresa(data, form);
                          setForm(prev => ({ ...prev, cnpj: f, ...campos }));
                          setTimeout(() => setEtapaModal("form"), 500);
                        });
                      }}
                      placeholder="00.000.000/0000-00"
                      maxLength={18}
                      inputMode="numeric"
                      className="flex-1 bg-transparent font-mono text-xl font-bold tracking-widest text-slate-900 focus:outline-none placeholder:text-slate-300 placeholder:text-base placeholder:tracking-wide"
                    />
                  </div>
                  {cnpjStatus === "loading" && <p className="text-xs text-slate-400 mt-2 text-center">🔎 Buscando dados para atualizar o cadastro...</p>}
                  {cnpjError && <p className="text-xs text-red-500 font-medium mt-2 text-center">{cnpjError}</p>}
                  {cnpjStatus === "found" && <p className="text-xs text-emerald-600 font-medium mt-2 text-center">✓ Dados carregados para preenchimento. Ao salvar, o cadastro será atualizado no banco.</p>}
                </div>
                <p className="text-xs text-amber-600 text-center max-w-xs">
                  O CNPJ é obrigatório. Empresas sem CNPJ válido ficam bloqueadas em Dados Incompletos e não entram nas telas operacionais.
                </p>
              </div>
            )}

            {/* ── FORMULÁRIO COMPLETO ── */}
            {(editando || etapaModal === "form") && (
              <>
                <div className="flex-1 overflow-y-auto scroll-area p-5 space-y-3">

                  {/* Dados básicos */}
                  <SectionCard title="Dados da Empresa" icon={<Building2 className="w-4 h-4" />}>
                    <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <MField label="Razão Social" required error={erros.razao_social}>
                          <input value={form.razao_social} onChange={e => set("razao_social", e.target.value)} placeholder="Razão Social Ltda." className={`${inputCls} ${erros.razao_social ? "border-red-300" : ""}`} />
                        </MField>
                      </div>
                      <MField label="Nome Fantasia">
                        <input value={form.nome_fantasia || ""} onChange={e => set("nome_fantasia", e.target.value)} placeholder="Nome comercial" className={inputCls} />
                      </MField>
                      <MField label="CNPJ" required error={erros.cnpj}>
                        <input value={form.cnpj || ""} onChange={e => set("cnpj", formatCNPJ(e.target.value))} placeholder="00.000.000/0001-00" className={inputCls} inputMode="numeric" />
                      </MField>
                      <MField label="Inscrição Estadual">
                        <input value={form.inscricao_estadual || ""} onChange={e => set("inscricao_estadual", e.target.value)} placeholder="000.000.000.000" className={inputCls} />
                      </MField>
                      <MField label="Natureza Jurídica">
                        <input value={form.natureza_juridica || ""} onChange={e => set("natureza_juridica", e.target.value)} placeholder="LTDA, Empresário Individual, SA..." className={inputCls} />
                      </MField>
                      <MField label="Capital Social (R$)">
                        <input
                          type="text" inputMode="numeric"
                          value={form.capital_social ? formatBRLCurrency(form.capital_social) : ""}
                          onChange={e => { const f = maskCurrencyInput(e.target.value); set("capital_social", unmaskCurrencyInput(f) || undefined); }}
                          placeholder="0,00" autoComplete="off"
                          className={inputCls + " text-right font-mono"}
                        />
                      </MField>
                      <div className="sm:col-span-2">
                        <MField label="CNAE Principal">
                          <input value={form.cnae_principal || ""} onChange={e => set("cnae_principal", e.target.value)} placeholder="Código — atividade principal" className={inputCls} />
                        </MField>
                      </div>
                      <MField label="Data de Abertura">
                        <input type="date" value={form.data_abertura ? String(form.data_abertura).slice(0, 10) : ""} onChange={e => set("data_abertura", e.target.value)} className={inputCls} />
                      </MField>
                      <MField label="Situação Cadastral">
                        <input value={form.situacao_cadastral || ""} onChange={e => set("situacao_cadastral", e.target.value)} placeholder="ATIVA, BAIXADA, INAPTA..." className={inputCls} />
                      </MField>
                      <MField label="Porte">
                        <select value={form.porte || "mei"} onChange={e => set("porte", e.target.value)} className={selectCls}>
                          {Object.entries(PORTE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </MField>
                      <MField label="Segmento">
                        <select value={form.segmento || ""} onChange={e => set("segmento", e.target.value)} className={selectCls}>
                          <option value="">Selecione...</option>
                          {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </MField>
                      <MField label="Status">
                        <select value={form.status} onChange={e => set("status", e.target.value)} className={selectCls}>
                          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </MField>
                      <MField label="Faturamento Anual (R$)">
                        <input
                          type="text" inputMode="numeric"
                          value={form.faturamento_anual ? formatBRLCurrency(form.faturamento_anual) : ""}
                          onChange={e => { const f = maskCurrencyInput(e.target.value); set("faturamento_anual", unmaskCurrencyInput(f) || undefined); }}
                          placeholder="0,00" autoComplete="off"
                          className={inputCls + " text-right font-mono"}
                        />
                      </MField>
                      <MField label="Nº de Funcionários">
                        <input type="number" value={form.numero_funcionarios || ""} onChange={e => set("numero_funcionarios", e.target.value ? Number(e.target.value) : undefined)} placeholder="0" min="0" className={inputCls} />
                      </MField>
                    </div>
                  </SectionCard>

                  {/* Contato */}
                  <SectionCard title="Contato" icon={<Phone className="w-4 h-4" />} defaultOpen={false}>
                    <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <MField label="Telefone"><input value={form.telefone || ""} onChange={e => set("telefone", formatTel(e.target.value))} placeholder="(61) 3333-4444" inputMode="tel" className={inputCls} /></MField>
                      <MField label="WhatsApp"><input value={form.whatsapp || ""} onChange={e => set("whatsapp", formatTel(e.target.value))} placeholder="(61) 9 9999-9999" inputMode="tel" className={inputCls} /></MField>
                      <MField label="E-mail"><input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="contato@empresa.com.br" className={inputCls} /></MField>
                      <MField label="Site"><input value={form.site || ""} onChange={e => set("site", e.target.value)} placeholder="https://empresa.com.br" className={inputCls} /></MField>
                    </div>
                  </SectionCard>

                  {/* Endereço */}
                  <SectionCard title="Endereço" icon={<MapPin className="w-4 h-4" />} defaultOpen={false}>
                    <div className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <MField label="CEP">
                        <input value={form.cep || ""} onChange={e => { const v = e.target.value.replace(/\D/g,"").slice(0,8); const f = v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v; set("cep", f); if (v.length === 8) buscarCEP(v); }} placeholder="00000-000" inputMode="numeric" className={inputCls} />
                      </MField>
                      <div className="sm:col-span-2"><MField label="Logradouro"><input value={form.logradouro || ""} onChange={e => set("logradouro", e.target.value)} placeholder="Rua, Av., Quadra..." className={inputCls} /></MField></div>
                      <MField label="Número"><input value={form.numero || ""} onChange={e => set("numero", e.target.value)} placeholder="123" className={inputCls} /></MField>
                      <MField label="Complemento"><input value={form.complemento || ""} onChange={e => set("complemento", e.target.value)} placeholder="Sala 10..." className={inputCls} /></MField>
                      <MField label="Bairro"><input value={form.bairro || ""} onChange={e => set("bairro", e.target.value)} placeholder="Bairro" className={inputCls} /></MField>
                      <div className="sm:col-span-2"><MField label="Cidade"><input value={form.cidade || ""} onChange={e => set("cidade", e.target.value)} placeholder="Brasília" className={inputCls} /></MField></div>
                      <MField label="Estado">
                        <select value={form.estado || ""} onChange={e => set("estado", e.target.value)} className={selectCls}>
                          <option value="">UF</option>
                          {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                      </MField>
                    </div>
                  </SectionCard>

                  {/* Responsável */}
                  <SectionCard title="Sócio / Responsável" icon={<User className="w-4 h-4" />} defaultOpen={false}>
                    <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <MField label="Nome"><input value={form.responsavel_nome || ""} onChange={e => set("responsavel_nome", e.target.value)} placeholder="Nome completo" className={inputCls} /></MField>
                      <MField label="CPF"><input value={form.responsavel_cpf || ""} onChange={e => set("responsavel_cpf", e.target.value)} placeholder="000.000.000-00" className={inputCls} /></MField>
                      <MField label="Cargo"><input value={form.responsavel_cargo || ""} onChange={e => set("responsavel_cargo", e.target.value)} placeholder="Sócio, Diretor..." className={inputCls} /></MField>
                      <MField label="Telefone"><input value={form.responsavel_telefone || ""} onChange={e => set("responsavel_telefone", formatTel(e.target.value))} placeholder="(61) 9 9999-9999" className={inputCls} /></MField>
                      <div className="sm:col-span-2"><MField label="E-mail"><input type="email" value={form.responsavel_email || ""} onChange={e => set("responsavel_email", e.target.value)} placeholder="socio@empresa.com.br" className={inputCls} /></MField></div>
                    </div>
                    {/* Sócios da Receita */}
                    {socios.length > 0 && (
                      <div className="pb-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Sócios identificados pela Receita Federal</p>
                        {socios.map((s, i) => (
                          <button key={i} type="button" onClick={() => { set("responsavel_nome", s.nome_socio || ""); set("responsavel_cpf", s.cnpj_cpf_do_socio || ""); set("responsavel_cargo", s.descricao_qualificacao_socio || ""); }} className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group">
                            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-blue-700">{s.nome_socio?.charAt(0) ?? "?"}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{s.nome_socio}</p>
                              <p className="text-xs text-slate-500">{s.descricao_qualificacao_socio || s.qualificacao_socio}</p>
                            </div>
                            <span className="text-[11px] text-blue-600 font-medium opacity-0 group-hover:opacity-100">Usar</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  {/* Financeiro */}
                  <SectionCard title="Dados Financeiros" icon={<DollarSign className="w-4 h-4" />} defaultOpen={false}>
                    <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <MField label="Banco Principal"><input value={form.banco_principal || ""} onChange={e => set("banco_principal", e.target.value)} placeholder="Banco do Brasil..." className={inputCls} /></MField>
                      <MField label="Agência"><input value={form.agencia || ""} onChange={e => set("agencia", e.target.value)} placeholder="0001" className={inputCls} /></MField>
                      <MField label="Conta Corrente"><input value={form.conta || ""} onChange={e => set("conta", e.target.value)} placeholder="00000-0" className={inputCls} /></MField>
                      <MField label="Limite de Crédito (R$)">
                        <input type="text" inputMode="numeric" value={form.limite_credito_atual ? formatBRLCurrency(form.limite_credito_atual) : ""} onChange={e => { const f = maskCurrencyInput(e.target.value); set("limite_credito_atual", unmaskCurrencyInput(f) || undefined); }} placeholder="0,00" className={inputCls + " text-right font-mono"} />
                      </MField>
                      <MField label="Score Serasa (0–1000)"><input type="number" value={form.score_serasa || ""} onChange={e => set("score_serasa", e.target.value ? Number(e.target.value) : undefined)} placeholder="850" min="0" max="1000" className={inputCls} /></MField>
                      <MField label="Score SPC (0–1000)"><input type="number" value={form.score_spc || ""} onChange={e => set("score_spc", e.target.value ? Number(e.target.value) : undefined)} placeholder="850" min="0" max="1000" className={inputCls} /></MField>
                    </div>
                  </SectionCard>

                  {/* Tags e Obs */}
                  <SectionCard title="Tags e Observações" icon={<Tag className="w-4 h-4" />} defaultOpen={false}>
                    <div className="py-3 space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1.5">Tags</label>
                        <div className="flex gap-2">
                          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const t = tagInput.trim(); if (t && !(form.tags||[]).includes(t)) { set("tags", [...(form.tags||[]), t]); setTagInput(""); } } }} placeholder="Adicionar tag..." className={inputCls + " flex-1"} />
                          <button type="button" onClick={() => { const t = tagInput.trim(); if (t && !(form.tags||[]).includes(t)) { set("tags", [...(form.tags||[]), t]); setTagInput(""); } }} className="h-9 px-3 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Plus className="w-4 h-4" /></button>
                        </div>
                        {(form.tags||[]).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(form.tags||[]).map(tag => (
                              <span key={tag} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
                                {tag}
                                <button type="button" onClick={() => set("tags", (form.tags||[]).filter(t => t !== tag))} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <MField label="Observações">
                        <textarea value={form.observacoes || ""} onChange={e => set("observacoes", e.target.value)} placeholder="Informações adicionais..." rows={3} className={inputCls + " h-auto py-2 resize-none"} />
                      </MField>
                      {/* Equipe */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <MField label="Resp. pela Captação">
                          <select value={form.captador_id || ""} onChange={e => set("captador_id", e.target.value || undefined)} className={selectCls}>
                            <option value="">Nenhum</option>
                            {captacao.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.cargo}</option>)}
                          </select>
                        </MField>
                        <MField label="Resp. pelo Atendimento">
                          <select value={form.analista_id || ""} onChange={e => set("analista_id", e.target.value || undefined)} className={selectCls}>
                            <option value="">Nenhum</option>
                            {atendimento.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.cargo}</option>)}
                          </select>
                        </MField>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {/* Footer do modal */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
                  <button type="button" onClick={fecharModal} className="h-9 px-4 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleSalvar} disabled={salvando} className="flex items-center gap-2 h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors shadow-sm">
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editando ? "Salvar Alterações" : "Cadastrar Empresa"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
