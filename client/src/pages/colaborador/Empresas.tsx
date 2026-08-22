import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Layout from "./Layout";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
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
  LayoutGrid, List as ListIcon,
} from "lucide-react";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/states";
import { RiscoBadge, ScoreIndicator, StatusCadastroBadge } from "@/components/ui/risco-badge";
import DocumentosEntidade from "@/components/documentos/DocumentosEntidade";
import Inteligencia360 from "./Inteligencia360";
import EsteiraCredito from "./EsteiraCredito";
import Historico360 from "./Historico360";
import NexusTarefasEmpresa from "./NexusTarefasEmpresa";
import CriarTarefaNexusModal from "./CriarTarefaNexusModal";

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
  ativo:      { label: "Ativo",       dot: "bg-success/100", badge: "bg-success/10 text-success ring-1 ring-success/30" },
  inativo:    { label: "Inativo",     dot: "bg-border",   badge: "bg-muted text-muted-foreground ring-1 ring-border" },
  prospecto:  { label: "Prospecto",   dot: "bg-primary/100",    badge: "bg-primary/10 text-primary ring-1 ring-primary/30" },
  cliente:    { label: "Cliente",     dot: "bg-primary/100",  badge: "bg-primary/10 text-primary ring-1 ring-primary/30" },
  ex_cliente: { label: "Ex-cliente",  dot: "bg-warning/100",   badge: "bg-warning/10 text-warning ring-1 ring-warning/30" },
};

const PORTE_CFG: Record<string, { label: string; color: string }> = {
  mei:    { label: "MEI",         color: "text-muted-foreground bg-muted" },
  me:     { label: "Micro (ME)",  color: "text-primary bg-primary/10" },
  epp:    { label: "EPP",         color: "text-primary bg-primary/10" },
  medio:  { label: "Médio Porte", color: "text-primary bg-primary/10" },
  grande: { label: "Grande",      color: "text-destructive bg-destructive/10" },
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
  "inteligencia_360",
  "esteira_credito",
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

const ABA_EMPRESA_FEATURES: Partial<Record<AbaEmpresa, string>> = {
  visao_geral: "empresa-tab-dados",
  socios: "empresa-tab-dados",
  dossie_credito: "empresa-tab-dossie",
  inteligencia_360: "empresa-tab-inteligencia-360",
  esteira_credito: "empresa-tab-esteira-credito",
  followup: "empresa-tab-conversas",
  historico: "empresa-tab-historico",
  documentos: "empresa-tab-acervo-documental",
  simulacoes: "empresa-tab-simulacoes",
  contratos: "empresa-tab-contratos",
};

function featureDaAbaEmpresa(aba: AbaEmpresa): string | undefined {
  return ABA_EMPRESA_FEATURES[aba];
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
    <div className="flex items-start gap-2.5 py-2.5 border-b border-border last:border-0">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-sm font-medium text-foreground break-words ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

function InfoTile({ label, value, icon, tone = "slate", mono = false }: { label: string; value?: string | number | null; icon?: React.ReactNode; tone?: "slate" | "blue" | "emerald" | "amber" | "violet"; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  const palette = {
    slate: "bg-card border-border text-muted-foreground",
    blue: "bg-primary/10 border-primary/20 text-primary",
    emerald: "bg-success/10 border-success/20 text-success",
    amber: "bg-warning/10 border-warning/20 text-warning",
    violet: "bg-primary/10 border-primary/20 text-primary",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${palette}`}>
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
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
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-muted-foreground transition-colors"
      title="Copiar"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function SectionCard({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-muted transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-1">{children}</div>}
    </div>
  );
}

function ScoreBar({ score, risco }: { score: number; risco: string }) {
  const colors = { baixo: "bg-success/100", medio: "bg-warning/100", alto: "bg-warning/100", critico: "bg-destructive/100" };
  const barColor = colors[risco as keyof typeof colors] || colors.critico;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`Score ${score} de 100`}>
      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${score}%` }} />
    </div>
  );
}


function DetailChip({ label, value, tone = "slate" }: { label: string; value?: string | number | null; tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "violet" }) {
  const palette = {
    slate: "border-border bg-muted text-muted-foreground",
    blue: "border-primary/20 bg-primary/10 text-primary",
    emerald: "border-success/20 bg-success/10 text-success",
    amber: "border-warning/20 bg-warning/10 text-warning",
    rose: "border-destructive/20 bg-destructive/10 text-destructive",
    violet: "border-primary/20 bg-primary/10 text-primary",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${palette}`}>
      <span className="text-muted-foreground font-black uppercase tracking-wide">{label}</span>
      <span>{value || "—"}</span>
    </span>
  );
}

function DataCell({ label, value, icon, mono = false, muted = false }: { label: string; value?: string | number | null; icon?: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/80 px-3 py-2.5 min-h-[72px]">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-sm font-bold break-words ${mono ? "font-mono" : ""} ${muted || !value ? "text-muted-foreground" : "text-foreground"}`}>
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
  onEditarSocio,
  onAbrirAcervo,
}: {
  empresa: Empresa;
  socios: any[];
  documentosTotal: number;
  simulacoesTotal: number;
  contratosTotal: number;
  sincronizando: boolean;
  onSincronizar?: () => void;
  onEditar?: () => void;
  onEditarSocio?: (socio: any) => void;
  onAbrirAcervo?: () => void;
}) {
  const [painelAtivo, setPainelAtivo] = useState<"resumo" | "receita" | "cadastro" | "contato" | "endereco" | "socios" | "documentos">("resumo");
  const { score, risco, tags } = calcularScore(empresa);
  const enderecoCompleto = [empresa.logradouro, empresa.numero, empresa.complemento, empresa.bairro, empresa.cidade, empresa.estado]
    .filter(Boolean)
    .join(", ");
  const cnaesSecundarios = Array.isArray(empresa.cnaes_secundarios) ? empresa.cnaes_secundarios.filter(Boolean) : [];

  const paineis = [
    { id: "resumo" as const, label: "Resumo", description: "Visão executiva", icon: <Building2 className="w-4 h-4" />, badge: empresa.status },
    { id: "receita" as const, label: "Receita Federal", description: "Dados oficiais", icon: <Briefcase className="w-4 h-4" />, badge: empresa.situacao_cadastral },
    { id: "cadastro" as const, label: "Cadastro interno", description: "Controle operacional", icon: <Building className="w-4 h-4" />, badge: fmtDate(empresa.created_at) },
    { id: "contato" as const, label: "Contato", description: "Telefone, e-mail e site", icon: <Phone className="w-4 h-4" />, badge: empresa.telefone || empresa.email ? "OK" : "Pendente" },
    { id: "endereco" as const, label: "Endereço", description: "Localização completa", icon: <MapPin className="w-4 h-4" />, badge: empresa.cidade || "Pendente" },
    { id: "socios" as const, label: "Sócios / QSA", description: "Conferência societária inicial", icon: <Users className="w-4 h-4" />, badge: socios.length ? `${socios.length}` : "0" },
    { id: "documentos" as const, label: "Documentos", description: "Atalho para o acervo", icon: <FileText className="w-4 h-4" />, badge: `${documentosTotal}` },
  ];

  const painelSelecionado = paineis.find((p) => p.id === painelAtivo) || paineis[0];

  const renderPainel = () => {
    if (painelAtivo === "receita") {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Atualização cadastral</p>
                <p className="text-sm text-primary mt-1">Dados oficiais vindos das fontes confiáveis. Atualize somente quando precisar sincronizar com a Receita Federal.</p>
                <p className="text-xs text-primary mt-1">Última atualização: {empresa.ultima_sincronizacao_receita ? new Date(empresa.ultima_sincronizacao_receita).toLocaleString("pt-BR") : "Não registrada"}</p>
              </div>
              {empresa.cnpj && onSincronizar && (
                <button onClick={onSincronizar} disabled={sincronizando} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50">
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
            <div className="rounded-2xl border border-border bg-muted p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">CNAEs secundários</p>
              <div className="flex flex-wrap gap-1.5">
                {cnaesSecundarios.map((cnae, i) => <span key={`${cnae}-${i}`} className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{cnae}</span>)}
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
            {onEditar && (
            <button onClick={onEditar} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted">
              <Edit2 className="w-4 h-4" /> Editar cadastro
            </button>
            )}
            {empresa.cnpj && onSincronizar && (
              <button onClick={onSincronizar} disabled={sincronizando} className="inline-flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-2 text-sm font-bold text-success hover:bg-success/20 disabled:opacity-50">
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
              <a key={c.label} href={c.href} target={c.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="rounded-2xl border border-border bg-muted p-4 hover:border-primary/20 hover:bg-primary/10 transition-all">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground">{c.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{c.label}</p>
                    <p className="text-sm font-bold text-foreground truncate">{c.value}</p>
                  </div>
                </div>
              </a>
            ) : (
              <div key={c.label} className="rounded-2xl border border-dashed border-border bg-muted p-4 text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center">{c.icon}</div>
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
          <div className="rounded-3xl border border-border bg-muted p-5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground shrink-0"><MapPin className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Endereço principal</p>
                <p className="text-lg font-black text-foreground mt-1">{enderecoCompleto || "Não informado"}</p>
                <p className="text-sm text-muted-foreground mt-1">{empresa.cep ? `CEP ${empresa.cep}` : "CEP não informado"}</p>
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
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <p className="text-sm font-black text-foreground">Conferência societária inicial</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nesta etapa o sistema confere somente CNPJ, razão social, capital social, nomes dos sócios e quem é Sócio-Administrador. Dados pessoais e documentos dos sócios pertencem às próximas fases e não interferem neste resultado.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <DataCell label="CNPJ" value={empresa.cnpj} icon={<Hash className="w-3.5 h-3.5" />} mono />
            <DataCell label="Razão social" value={empresa.razao_social} icon={<Building2 className="w-3.5 h-3.5" />} />
            <DataCell label="Capital social" value={normalizarCapitalSocial(empresa.capital_social)} icon={<Banknote className="w-3.5 h-3.5" />} />
          </div>

          {socios.filter((s: any) => s?.nome && !/^(?:não|nao) identificado$/i.test(String(s.nome).trim())).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm font-semibold text-muted-foreground">Nenhum sócio identificado na sincronização cadastral.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {socios
                .filter((s: any) => s?.nome && !/^(?:não|nao) identificado$/i.test(String(s.nome).trim()))
                .map((s: any) => {
                  const qualificacao = s.qualificacao_socio || s.qualificacao || s.cargo || "Qualificação não informada";
                  const administrador = s.administrador === true || s.representante_legal === true || /administrador|titular|empres[aá]rio individual/i.test(String(qualificacao));
                  return (
                    <article key={s.id || s.nome} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">{String(s.nome || "?").slice(0, 1).toUpperCase()}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-foreground">{s.nome}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${administrador ? "border-success/20 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}`}>
                              {administrador ? "Sócio-Administrador" : "Sócio"}
                            </span>
                            {onEditarSocio && (
                              <button type="button" onClick={() => onEditarSocio(s)} className="ml-auto rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted">Editar vínculo</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
          )}
        </div>
      );
    }

    if (painelAtivo === "documentos") {
      return (
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm"><FileText className="w-7 h-7" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Central documental</p>
                <h3 className="text-xl font-black text-foreground mt-1">Anexos e documentos da empresa</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Todos os arquivos são visualizados na página exclusiva do acervo para preservar o cadastro limpo e oferecer mais espaço ao PDF.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <DetailChip label="Arquivos" value={documentosTotal} tone="blue" />
                  <DetailChip label="Simulações" value={simulacoesTotal} />
                  <DetailChip label="Contratos" value={contratosTotal} />
                </div>
              </div>
            </div>
            {onAbrirAcervo && (
            <button onClick={onAbrirAcervo} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-sm shadow-blue-100 hover:bg-primary/90">
              <ExternalLink className="w-4 h-4" /> Abrir acervo documental
            </button>
            )}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DataCell label="CNPJ" value={empresa.cnpj} icon={<Hash className="w-3.5 h-3.5" />} mono />
          <DataCell label="Localização" value={[empresa.cidade, empresa.estado].filter(Boolean).join(" / ")} icon={<MapPin className="w-3.5 h-3.5" />} />
          <DataCell label="Contato principal" value={empresa.responsavel_nome || empresa.telefone || empresa.whatsapp || empresa.email} icon={<Phone className="w-3.5 h-3.5" />} />
        </div>
        {/* "Nova simulação" / "Novo contrato" / "Iniciar conversa" não se repetem
            mais aqui -- são a mesma ação da barra "Quick Actions" logo acima das
            abas, visível em qualquer aba. "Acervo documental" também já é uma aba
            própria. Manter os quatro botões aqui só duplicava ações já visíveis
            na mesma tela. */}
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-3 fade-in">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-muted lg:border-b-0 lg:border-r">
            <div className="border-b border-border bg-card px-3 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Central de informações</p>
              <h3 className="mt-0.5 text-base font-black text-foreground truncate">Dados da empresa</h3>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <DetailChip label="Docs" value={documentosTotal} tone="blue" />
                <DetailChip label="Sócios" value={socios.length} tone="emerald" />
              </div>
            </div>
            <div className="p-2.5">
              <div className="space-y-1">
                {paineis.map((painel) => (
                  <button
                    key={painel.id}
                    type="button"
                    onClick={() => setPainelAtivo(painel.id)}
                    className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all ${painelAtivo === painel.id ? "border-primary/30 bg-primary/10 shadow-sm" : "border-transparent bg-card hover:border-border hover:bg-card"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${painelAtivo === painel.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{painel.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-black text-foreground truncate">{painel.label}</p>
                          {painel.badge && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground max-w-[86px] truncate">{painel.badge}</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">{painel.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0 bg-card">
            {/* "Editar"/"Atualizar" não se repetem mais aqui -- são exatamente a mesma
                ação dos botões já visíveis no cabeçalho da empresa, acima das abas,
                em qualquer painel. Repeti-los aqui só duplicava a mesma ação duas
                vezes na mesma tela. */}
            <div className="border-b border-border px-3 sm:px-4 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Visualização</p>
              <h3 className="text-lg font-black text-foreground truncate">{painelSelecionado.label}</h3>
              <p className="text-sm text-muted-foreground truncate">{painelSelecionado.description}</p>
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
      <label className="text-xs font-semibold text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

const inputCls = "h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-muted-foreground w-full";
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
  const { isFeatureEnabled } = useFeatureAccess();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selecionada, setSelecionada] = useState<Empresa | null>(null);
  const [showDetail, setShowDetail] = useState(false); // mobile toggle
  const [comboAberto, setComboAberto] = useState(false);
  // Tela inicial (antes de escolher uma empresa): mostra as empresas com
  // movimentação mais recente em blocos ou numa lista compacta -- mesmo
  // padrão de visualização do Acompanhamento Bancário.
  const [visualizacaoEmpresas, setVisualizacaoEmpresas] = useState<"blocos" | "lista">("blocos");
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
  // Confirmação antes de anexar/substituir o contrato assinado: como uma
  // empresa pode ter mais de um tipo de contrato (assessoria, limpa nome,
  // rating...), o modal deixa explícito QUAL contrato (número + tipo) está
  // prestes a ser substituído, e exige confirmação de que as assinaturas de
  // todas as partes foram conferidas antes de trocar o status pra "assinado".
  const [modalAnexoAssinado, setModalAnexoAssinado] = useState<{ contrato: any; file: File } | null>(null);
  const [confirmouAssinaturas, setConfirmouAssinaturas] = useState(false);
  const [enviandoAnexoAssinado, setEnviandoAnexoAssinado] = useState(false);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [novaObs, setNovaObs] = useState("");
  const [novoFollowup, setNovoFollowup] = useState({ titulo: "", tipo: "ligacao", data_agendada: "", descricao: "" });
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [form, setForm] = useState<FormEmpresa>({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [tarefaNexusOpen, setTarefaNexusOpen] = useState(false);
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
  const cnpjErroInvalido = /cnpj\s+inv[aá]lido/i.test(String(cnpjError || ""));
  const podeCadastrarManualmente = cnpjStatus === "error"
    && cleanDigits(cnpjInput).length === 14
    && !cnpjErroInvalido;
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
      // O card de "sócio-administrador padrão" (id sintético "socio-admin-<empresaId>",
      // ver montarSocioAdministradorPadrao) é só uma inferência visual enquanto a empresa
      // não tem nenhum sócio real salvo em socios_empresa. Ele nunca existe no banco, então
      // um PUT para esse id sempre falhava (Postgres rejeita o id inválido como UUID e a
      // tela mostrava "Erro ao atualizar sócio"). Quando o usuário completa e salva esses
      // dados, o registro precisa ser CRIADO (POST), não atualizado.
      const ehSocioInferido = !!socioEditando?.inferido_empresa;
      const atualizado = ehSocioInferido
        ? await apiFetch(`/api/empresas/${selecionada.id}/socios`, {
            method: 'POST',
            body: JSON.stringify({ ...socioForm, fonte_dados: 'manual_validado' }),
          })
        : await apiFetch(`/api/empresas/${selecionada.id}/socios/${socioEditando.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...socioForm, fonte_dados: 'manual_validado' }),
          });
      setSociosEmpresa(prev => prev.some((s: any) => s.id === atualizado.id)
        ? prev.map((s: any) => s.id === atualizado.id ? atualizado : s)
        : [...prev, atualizado]);
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
  async function handleAnexarContratoAssinado(contratoId: string, file: File) {
    setEnviandoAnexoAssinado(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",").pop() || "");
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        reader.readAsDataURL(file);
      });
      await apiFetch(`/api/contratos/${contratoId}/anexo-assinado`, {
        method: "POST",
        body: JSON.stringify({ arquivo_base64: base64, nome_arquivo: file.name }),
      });
      toast.success("Contrato assinado anexado. Rotinas de acompanhamento (CENPROT semanal, CND mensal) começam a valer a partir de agora.");
      await carregarEmpresas();
      if (selecionada) {
        const atualizada = await apiFetch(`/api/empresas/${selecionada.id}`).catch(() => null);
        if (atualizada) setSelecionada((prev) => (prev ? { ...prev, ...atualizada } : prev));
      }
      setModalAnexoAssinado(null);
      setConfirmouAssinaturas(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao anexar contrato assinado");
    } finally {
      setEnviandoAnexoAssinado(false);
    }
  }
  // Abre a confirmação em vez de anexar direto -- garante que o colaborador
  // vê explicitamente qual contrato (número + tipo) está prestes a substituir
  // antes de o upload de verdade acontecer.
  function abrirConfirmacaoAnexoAssinado(contrato: any, file: File) {
    setConfirmouAssinaturas(false);
    setModalAnexoAssinado({ contrato, file });
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

  // ── Acervo Documental sempre abre direto na página exclusiva ────────────────
  // Rede de segurança: qualquer caminho que ainda ative abaAtiva === "documentos"
  // (link antigo salvo, Histórico 360, etc.) é redirecionado imediatamente para
  // a página exclusiva do acervo, em vez de mostrar o card intermediário com o
  // botão "Abrir acervo documental". navegarParaAba() já cobre o clique direto
  // na aba; este efeito cobre os demais casos sem duplicar lógica.
  useEffect(() => {
    if (abaAtiva === "documentos" && selecionada?.id) {
      setLocation(`/colaborador/empresas/${selecionada.id}/acervo`);
    }
  }, [abaAtiva, selecionada?.id]);

  // ── Dossiê / Laudo IA também abre direto na página exclusiva ────────────────
  // Mesma rede de segurança acima, mas para a aba "dossie_credito": cobre
  // qualquer caminho que ainda ative essa aba sem passar por navegarParaAba()
  // (link salvo, "?aba=dossie_credito" direto na URL, etc.), redirecionando
  // pra a mesma página exclusiva do acervo (?view=analise) em vez de montar
  // uma segunda cópia do dossiê aqui dentro.
  useEffect(() => {
    if (abaAtiva === "dossie_credito" && selecionada?.id) {
      setLocation(`/colaborador/empresas/${selecionada.id}/acervo?view=analise`);
    }
  }, [abaAtiva, selecionada?.id]);

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
        body: JSON.stringify({ ...camposAtualizados, _origem: "sincronizacao_receita" }),
      });

      setSelecionada(atualizada);
      setEmpresas(prev => prev.map(e => e.id === empresa.id ? atualizada : e));
      await carregarEmpresas();

      // Sócios/QSA não podem travar a atualização cadastral. Se falhar, a empresa continua sincronizada.
      const sociosReload = await apiFetch(`/api/empresas/${empresa.id}/socios`).catch(() => []);
      if (Array.isArray(sociosReload)) setSociosEmpresa(sociosReload);

      if (!opts.silencioso) {
        // Mostra exatamente o que mudou -- campos protegidos (contato/responsável já
        // preenchidos manualmente) nunca aparecem aqui, porque o backend nem tenta
        // sobrescrevê-los numa sincronização automática.
        const alteracoes: Array<{ campo: string }> = Array.isArray(atualizada?._alteracoesReais) ? atualizada._alteracoesReais : [];
        if (alteracoes.length === 0) {
          toast.success("Sincronizado com a Receita — nenhuma alteração de cadastro encontrada.", { id: "sync" });
        } else {
          const nomesCampos: Record<string, string> = {
            razao_social: "Razão social", nome_fantasia: "Nome fantasia", situacao_cadastral: "Situação cadastral",
            cnae_principal: "CNAE principal", cnaes_secundarios: "CNAEs secundários", natureza_juridica: "Natureza jurídica",
            capital_social: "Capital social", data_abertura: "Data de abertura", porte: "Porte", segmento: "Segmento",
          };
          const lista = alteracoes.map((a) => nomesCampos[a.campo] || a.campo).join(", ");
          toast.success(`Cadastro atualizado pela Receita: ${lista}.`, { id: "sync", duration: 6000 });
        }
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

  // Abre o modal de nova empresa automaticamente quando a página é acessada com
  // ?novo=1 -- usado pelo link "cadastre a empresa primeiro" da Calculadora de
  // Crédito e de outros pontos do sistema que agora exigem empresa já cadastrada.
  useEffect(() => {
    const queryString = location.split("?")[1] || "";
    if (new URLSearchParams(queryString).get("novo") === "1") {
      abrirNova();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function continuarCadastroManual() {
    if (!podeCadastrarManualmente) return;
    // Preserva somente o CNPJ informado e abre os campos já existentes para edição.
    // Nenhum dado parcial da Receita é reaproveitado como se fosse sincronizado.
    setForm(prev => ({
      ...prev,
      cnpj: cnpjInput,
      ultima_sincronizacao_receita: undefined,
      dados_extra_receita: undefined,
    }));
    setSocios([]);
    setErros({});
    setEtapaModal("form");
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
        ultima_sincronizacao_receita: form.ultima_sincronizacao_receita || null,
        cnaes_secundarios: Array.isArray(form.cnaes_secundarios) ? form.cnaes_secundarios : [],
        numero_funcionarios: form.numero_funcionarios || null,
        limite_credito_atual: form.limite_credito_atual || null,
        score_serasa: form.score_serasa || null,
        score_spc: form.score_spc || null,
      };
      if (editando) {
        const atualizada = await apiFetch(`/api/empresas/${editando.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (socios.length > 0) {
          await apiFetch(`/api/empresas/${editando.id}/socios/bulk`, {
            method: "POST",
            body: JSON.stringify({ socios: normalizarSociosReceita(socios as any[]), replace: true }),
          }).catch(() => null);
        }
        // Raiz do bug: só a lista lateral (empresas) era atualizada depois de salvar --
        // a ficha exibida na tela usa `selecionada`, que ficava com os dados antigos até
        // uma navegação manual ou reload forçar um novo fetch. Atualiza os dois agora.
        setSelecionada((prev) => (prev && prev.id === editando.id ? { ...prev, ...atualizada } : prev));
        setEmpresas((prev) => prev.map((e) => (e.id === editando.id ? { ...e, ...atualizada } : e)));
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
  function abaPermitida(aba: AbaEmpresa): boolean {
    const featureKey = featureDaAbaEmpresa(aba);
    return isFeatureEnabled(featureKey);
  }

  function primeiraAbaPermitida(): AbaEmpresa {
    return (ABAS_EMPRESA.find(aba => abaPermitida(aba)) as AbaEmpresa | undefined) || "visao_geral";
  }

  function navegarParaAba(aba: AbaEmpresa, opts?: { abrirFollowup?: boolean }) {
    const destino = abaPermitida(aba) ? aba : primeiraAbaPermitida();
    if (destino !== aba) {
      toast.info("Esta função está oculta para este usuário.");
    }
    // Acervo Documental abre direto na página exclusiva -- sem o card
    // intermediário com o botão "Abrir acervo documental".
    if (destino === "documentos" && selecionada?.id) {
      setLocation(`/colaborador/empresas/${selecionada.id}/acervo`);
      return;
    }
    // Dossiê / Laudo IA é a mesma tela que já abre sozinha dentro do acervo
    // documental (?view=analise) -- mandar pra lá em vez de montar uma segunda
    // cópia aqui evita o vaivém "acervo -> voltar pra empresa -> aba Dossiê ->
    // recarregar tudo de novo" e garante que exista só um lugar no sistema
    // onde o dossiê é calculado e mostrado.
    if (destino === "dossie_credito" && selecionada?.id) {
      setLocation(`/colaborador/empresas/${selecionada.id}/acervo?view=analise`);
      return;
    }
    setAbaAtiva(destino);
    if (opts?.abrirFollowup && destino === "followup") setShowFollowupForm(true);
    if (selecionada?.id) setLocation(`/colaborador/empresas?empresa=${selecionada.id}&aba=${destino}`);
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

  // `empresas` já vem filtrada pelo servidor (busca/status/porte/origem, ver
  // carregarEmpresas). "Empresas recentes" mostra só quem já tem documento
  // anexado E alguma análise iniciada (ver /api/documentacao/empresas/documentos-resumo,
  // que já devolve pré-filtrado) -- ordenadas pela mais recentemente atualizada,
  // limitadas a 6 pra não precisar rolar a tela.
  const LIMITE_EMPRESAS_RECENTES = 6;
  const [documentosResumo, setDocumentosResumo] = useState<Record<string, { documentos_count: number; analise_iniciada: boolean }>>({});
  useEffect(() => {
    let ativo = true;
    apiFetch(`/api/documentacao/empresas/documentos-resumo`)
      .then((data) => {
        if (!ativo || !Array.isArray(data)) return;
        const mapa: Record<string, { documentos_count: number; analise_iniciada: boolean }> = {};
        for (const r of data) mapa[r.empresa_id] = { documentos_count: r.documentos_count || 0, analise_iniciada: !!r.analise_iniciada };
        setDocumentosResumo(mapa);
      })
      .catch(() => { /* silencioso -- widget só some se a chamada falhar, resto da página funciona normal */ });
    return () => { ativo = false; };
  }, []);
  const empresasRecentes = useMemo(() => {
    return [...empresas]
      .filter((emp) => documentosResumo[emp.id])
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, LIMITE_EMPRESAS_RECENTES);
  }, [empresas, documentosResumo]);

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

      <div className="emp-page min-h-full overflow-x-hidden bg-[#f8f9fc] pb-8">

        {/* ── Layout principal em tela cheia útil ── */}
        <div className="max-w-none w-full px-3 sm:px-4 py-2">
          <div className="flex flex-col gap-3 min-h-0">

            {/* ── BARRA SUPERIOR: seletor de empresa com busca ── */}
            <div className={`shrink-0 rounded-2xl border border-border bg-card p-2.5 shadow-sm ${showDetail ? "hidden sm:block" : ""}`}>
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                  <h1 className="text-xl font-black text-foreground tracking-tight leading-tight">Empresas</h1>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    {loading ? "Carregando..." : `${empresas.length} encontrada${empresas.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => exportarRelatorio('csv')}
                    className="inline-flex items-center gap-1 bg-card hover:bg-muted text-muted-foreground border border-border px-2.5 py-2 rounded-xl font-bold text-xs transition-colors shrink-0"
                    title="Exportar relatório CSV"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    onClick={abrirNova}
                    className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-2 rounded-xl font-bold text-xs transition-colors shadow-sm shadow-blue-200 shrink-0"
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
                  className="w-full flex items-center gap-2.5 h-11 px-3 border border-border rounded-xl bg-card hover:border-input focus:outline-none focus:ring-2 focus:ring-primary transition-colors text-left"
                >
                  {selecionada ? (
                    <>
                      <Search className="w-4 h-4 text-primary shrink-0" />
                      <span className="flex-1 min-w-0 text-sm font-semibold text-muted-foreground truncate">Trocar empresa ou buscar outra...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm text-muted-foreground">Selecione ou busque uma empresa...</span>
                    </>
                  )}
                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${comboAberto ? "rotate-90" : ""}`} />
                </button>

                {comboAberto && (
                  <div className="absolute z-30 mt-1.5 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden fade-in">
                    <div className="p-2 border-b border-border space-y-1.5">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          ref={searchRef}
                          value={busca}
                          onChange={e => setBusca(e.target.value)}
                          placeholder="Buscar empresa, CNPJ..."
                          className="w-full pl-9 pr-8 h-9 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {busca && (
                          <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="flex-1 h-8 border border-border rounded-lg px-2 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="todos">Todos os status</option>
                          {Object.entries(STATUS_CFG).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                        </select>
                        <select value={filtroPorte} onChange={e => setFiltroPorte(e.target.value)} className="h-8 border border-border rounded-lg px-2 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="todos">Todos os portes</option>
                          <option value="MEI">MEI</option><option value="ME">ME</option><option value="EPP">EPP</option>
                          <option value="Médio">Médio</option><option value="Grande">Grande</option>
                        </select>
                        <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} className="h-8 border border-border rounded-lg px-2 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="todos">Todas as origens</option>
                          <option value="simulador">Simulador</option><option value="indicacao">Indicação</option>
                          <option value="campanha">Campanha</option><option value="site">Site</option><option value="manual">Manual</option>
                        </select>
                        <button onClick={carregarEmpresas} className="h-8 px-2 border border-border rounded-lg bg-card hover:bg-muted text-muted-foreground transition-colors" title="Atualizar">
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
                          action={<button onClick={abrirNova} className="text-xs text-primary hover:underline">+ Cadastrar primeira empresa</button>}
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
                              ativa ? "border-primary/20 bg-primary/10" : "border-transparent hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground text-xs font-black shrink-0 ${ativa ? "bg-primary" : "bg-primary"}`}>
                                {getInitials(emp.razao_social)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate leading-tight">{emp.razao_social}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sc.badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                                  </span>
                                  {(emp.cidade || emp.estado) && (
                                    <span className="text-[10px] text-muted-foreground truncate">{[emp.cidade, emp.estado].filter(Boolean).join(", ")}</span>
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
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  {/* ── Filtros rápidos: status/porte/origem sempre visíveis, sem precisar
                      abrir o combobox de busca -- usam os mesmos estados dele, então
                      buscar em qualquer um dos dois lugares filtra o mesmo resultado. ── */}
                  <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFiltroStatus("todos")}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${filtroStatus === "todos" ? "bg-brand-navy text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted"}`}
                      >Todos</button>
                      {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFiltroStatus(key)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${filtroStatus === key ? "bg-brand-navy text-primary-foreground" : `${cfg.badge} hover:opacity-80`}`}
                        >{cfg.label}</button>
                      ))}
                      <span className="mx-1 hidden h-4 w-px bg-muted sm:block" />
                      <select
                        value={filtroPorte}
                        onChange={e => setFiltroPorte(e.target.value)}
                        className="h-7 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="todos">Porte (todos)</option>
                        {Object.entries(PORTE_CFG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                      </select>
                      <select
                        value={filtroOrigem}
                        onChange={e => setFiltroOrigem(e.target.value)}
                        className="h-7 rounded-full border border-border bg-card px-2.5 text-[11px] font-semibold text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="todos">Origem (todas)</option>
                        <option value="simulador">Simulador</option>
                        <option value="indicacao">Indicação</option>
                        <option value="campanha">Campanha</option>
                        <option value="site">Site</option>
                        <option value="manual">Manual</option>
                      </select>
                      {(filtroStatus !== "todos" || filtroPorte !== "todos" || filtroOrigem !== "todos" || busca.trim()) && (
                        <button
                          type="button"
                          onClick={() => { setFiltroStatus("todos"); setFiltroPorte("todos"); setFiltroOrigem("todos"); setBusca(""); }}
                          className="rounded-full px-2.5 py-1 text-[11px] font-bold text-primary hover:underline"
                        >Limpar filtros</button>
                      )}
                    </div>
                  </div>

                  {/* ── Cabeçalho + alternância blocos/lista ── */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">Empresas recentes</h2>
                      <p className="text-[11px] text-muted-foreground">
                        {loading ? "Carregando…" : "com documentos anexados e análise iniciada · mais recentes primeiro"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
                      <button
                        type="button"
                        onClick={() => setVisualizacaoEmpresas("blocos")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${visualizacaoEmpresas === "blocos" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-muted-foreground"}`}
                        title="Ver como blocos"
                      ><LayoutGrid className="h-3 w-3" /> Blocos</button>
                      <button
                        type="button"
                        onClick={() => setVisualizacaoEmpresas("lista")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${visualizacaoEmpresas === "lista" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-muted-foreground"}`}
                        title="Ver como lista"
                      ><ListIcon className="h-3 w-3" /> Lista</button>
                    </div>
                  </div>

                  {/* ── Conteúdo: cards recentes em blocos ou lista compacta ── */}
                  <div className="px-4 pb-4">
                    {loading ? (
                      <LoadingState message="Carregando empresas…" className="py-10" />
                    ) : empresasRecentes.length === 0 ? (
                      <EmptyState
                        preset="empresas"
                        title="Nenhuma empresa com documentos e análise ainda"
                        description="Assim que uma empresa tiver documento anexado e análise iniciada no Acervo Documental, ela aparece aqui."
                        action={<button onClick={abrirNova} className="text-xs text-primary hover:underline">+ Cadastrar primeira empresa</button>}
                        className="py-10"
                      />
                    ) : visualizacaoEmpresas === "blocos" ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {empresasRecentes.map(emp => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => selecionar(emp)}
                            className="flex flex-col items-start rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md hover:border-primary/30"
                          >
                            <div className="flex w-full items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-xs font-black text-primary-foreground">
                                  {getInitials(emp.razao_social)}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="truncate text-sm font-bold text-foreground leading-tight">{emp.razao_social}</h3>
                                </div>
                              </div>
                              <StatusBadge status={emp.status} />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                Análise iniciada
                              </span>
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {documentosResumo[emp.id]?.documentos_count || 0} documento{documentosResumo[emp.id]?.documentos_count === 1 ? "" : "s"} anexado{documentosResumo[emp.id]?.documentos_count === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="mt-3 flex w-full items-center justify-between border-t border-border pt-2">
                              <span className="text-[10px] text-muted-foreground">Atualizado {fmtDate(emp.updated_at)}</span>
                              <span className="text-[10px] font-bold text-primary">Abrir →</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {empresasRecentes.map(emp => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => selecionar(emp)}
                            className="emp-list-item flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left hover:border-primary/30 hover:bg-primary/10/40"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-xs font-black text-primary-foreground">
                              {getInitials(emp.razao_social)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">{emp.razao_social}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                  Análise iniciada
                                </span>
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  {documentosResumo[emp.id]?.documentos_count || 0} documento{documentosResumo[emp.id]?.documentos_count === 1 ? "" : "s"} anexado{documentosResumo[emp.id]?.documentos_count === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] text-muted-foreground">Atualizado {fmtDate(emp.updated_at)}</span>
                            <StatusBadge status={emp.status} />
                          </button>
                        ))}
                      </div>
                    )}
                    {!loading && empresas.filter(e => documentosResumo[e.id]).length > empresasRecentes.length && (
                      <p className="mt-3 text-center text-[11px] text-muted-foreground">
                        Mostrando as {empresasRecentes.length} mais recentes — refine a busca ou os filtros acima para ver outras.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-visible slide-up flex flex-col min-w-0">

                  {/* ── Header detalhe ── */}
                  <div className="px-3 sm:px-4 py-2 border-b border-border shrink-0 bg-card">
                    <div className="flex items-start gap-3">
                      {/* Botão voltar -- antes só existia no celular; agora aparece em qualquer
                          tamanho de tela, pra sair da empresa sem precisar clicar em "Trocar
                          empresa" (que abre a busca) nem usar o botão voltar do navegador. */}
                      <button
                        onClick={() => { setSelecionada(null); setShowDetail(false); setLocation("/colaborador/empresas"); }}
                        className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground sm:px-2"
                        title="Voltar para a lista de empresas"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden text-xs font-bold sm:inline">Voltar</span>
                      </button>
                      {/* Avatar grande */}
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary flex items-center justify-center text-primary-foreground text-sm font-black shrink-0 shadow-sm shadow-blue-100">
                        {getInitials(selecionada.razao_social)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-base font-black text-foreground leading-tight truncate">{selecionada.razao_social}</h2>
                            {selecionada.nome_fantasia && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{selecionada.nome_fantasia}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <StatusBadge status={selecionada.status} />
                              {selecionada.porte && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PORTE_CFG[selecionada.porte]?.color || "bg-muted text-muted-foreground"}`}>
                                  {PORTE_CFG[selecionada.porte]?.label}
                                </span>
                              )}
                              {selecionada.natureza_juridica && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                  {selecionada.natureza_juridica}
                                </span>
                              )}
                              {selecionada.situacao_cadastral && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">
                                  Receita: {selecionada.situacao_cadastral}
                                </span>
                              )}
                              {selecionada.segmento && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {selecionada.segmento}
                                </span>
                              )}
                            </div>
                            <div className="emp-info-grid mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5 max-w-[760px]">
                              <div className="rounded-lg border border-border bg-muted/80 px-2 py-1">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">CNPJ</p>
                                <p className="text-xs font-bold text-muted-foreground mt-0.5 truncate">{selecionada.cnpj || "Não informado"}</p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/80 px-2 py-1">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Localização</p>
                                <p className="text-xs font-bold text-muted-foreground mt-0.5 truncate">{[selecionada.cidade, selecionada.estado].filter(Boolean).join(" / ") || "Não informado"}</p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/80 px-2 py-1">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Contato principal</p>
                                <p className="text-xs font-bold text-muted-foreground mt-0.5 truncate">{selecionada.responsavel_nome || selecionada.telefone || selecionada.whatsapp || "Não informado"}</p>
                              </div>
                            </div>
                          </div>
                          {/* Ações */}
                          <div className="emp-action-btns flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {/* Botão Sincronizar — só aparece se tem CNPJ */}
                            {selecionada.cnpj && isFeatureEnabled("empresa-action-atualizar-cadastro") && (
                              <button
                                onClick={() => sincronizarDados(selecionada)}
                                disabled={sincronizando}
                                className="flex items-center gap-1.5 text-xs font-semibold text-success border border-success/20 bg-success/10 px-2.5 py-1.5 rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50"
                                title="Atualizar e salvar cadastro pela Receita Federal"
                              >
                                <RotateCw className={`w-3.5 h-3.5 ${sincronizando ? "animate-spin" : ""}`} />
                                <span className="hidden md:inline">{sincronizando ? "Atualizando..." : "Atualizar cadastro"}</span>
                              </button>
                            )}
                            {isFeatureEnabled("empresa-action-editar") && (
                              <button
                                onClick={() => selecionada && abrirEditar(selecionada)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground border border-border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Editar</span>
                              </button>
                            )}
                            {isFeatureEnabled("empresa-action-arquivar") && (confirmDelete === selecionada.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleExcluir(selecionada.id)} className="text-xs font-semibold bg-destructive text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-destructive/90">Confirmar</button>
                                <button onClick={() => setConfirmDelete(null)} className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(selecionada.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors border border-transparent hover:border-destructive/20">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Quick Actions ── */}
                  <div className="px-3 sm:px-4 py-1 border-b border-border bg-muted shrink-0">
                    <div className="flex flex-wrap gap-1.5">
                      {isFeatureEnabled("empresa-action-nova-simulacao") && isFeatureEnabled("calculadora") && (
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
                        className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                        title="Nova Simulação"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        <span>Nova Simulação</span>
                      </button>
                      )}
                      {isFeatureEnabled("empresa-action-novo-contrato") && isFeatureEnabled("contratos") && (
                      <button
                        onClick={() => window.location.href = "/colaborador/contratos"}
                        className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                        title="Novo Contrato"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Novo Contrato</span>
                      </button>
                      )}
                      {isFeatureEnabled("empresa-action-iniciar-conversa") && abaPermitida("followup") && (
                      <button
                        onClick={() => navegarParaAba("followup", { abrirFollowup: true })}
                        className="flex items-center gap-1 text-[10px] font-bold text-warning bg-warning/10 border border-warning/20 px-2 py-1 rounded-lg hover:bg-warning/20 transition-colors"
                        title="Iniciar conversa"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span>Iniciar conversa</span>
                      </button>
                      )}
                      <button
                        onClick={() => setTarefaNexusOpen(true)}
                        className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                        title="Criar uma lista independente desta empresa no Nexus"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Criar tarefa no Nexus</span>
                      </button>
                    </div>
                  </div>

                  {/* ── Score rápido ── */}
                  {(() => {
                    const { score, risco, tags } = calcularScore(selecionada);
                    const rCfg = {
                      baixo:   { label: "Baixo",   wrap: "bg-success/10 border-success/20", badge: "bg-success/20 text-success", Icon: ShieldCheck, ic: "text-success" },
                      medio:   { label: "Médio",   wrap: "bg-warning/10 border-warning/20",   badge: "bg-warning/20 text-warning",   Icon: ShieldAlert,  ic: "text-warning" },
                      alto:    { label: "Alto",    wrap: "bg-warning/10 border-warning/20", badge: "bg-warning/20 text-warning", Icon: AlertTriangle,ic: "text-warning" },
                      critico: { label: "Crítico", wrap: "bg-destructive/10 border-destructive/20",       badge: "bg-destructive/20 text-destructive",       Icon: ShieldOff,    ic: "text-destructive" },
                    }[risco] || { label: "—", wrap: "bg-muted border-border", badge: "bg-muted text-muted-foreground", Icon: ShieldCheck, ic: "text-muted-foreground" };
                    return (
                      <div className={`mx-3 sm:mx-4 mt-1 rounded-lg border px-2 py-1 shrink-0 ${rCfg.wrap}`}>
                        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
                          <div className="flex items-center gap-2 min-w-[190px]">
                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-card/90 border border-white shadow-sm">
                              <rCfg.Icon className={`w-3.5 h-3.5 ${rCfg.ic}`} />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-foreground">Score Destrava</span>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${rCfg.badge}`}>Risco {rCfg.label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">Situação atual</p>
                            </div>
                          </div>

                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <div className="min-w-[44px]">
                              <div className="text-base font-black text-foreground leading-none">{score}</div>
                              <div className="text-[10px] font-semibold text-muted-foreground mt-0.5">/100</div>
                            </div>
                            <div className="flex-1 min-w-[140px]">
                              <ScoreBar score={score} risco={risco} />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1 lg:max-w-[420px]">
                            {tags.slice(0, 3).map((t, i) => (
                              <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.ok ? "bg-card text-muted-foreground border border-border" : "bg-card text-destructive border border-destructive/20"}`}>
                                {t.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Abas ── */}
                  <div className="border-b border-border px-3 sm:px-4 py-1 bg-card shrink-0">
                    <div className="flex flex-wrap gap-1">
                      {([
                        { id: "visao_geral", label: "Dados da Empresa", badge: sociosExibicao.length || undefined },
                        { id: "dossie_credito", label: "Dossiê / Laudo IA" },
                        { id: "inteligencia_360", label: "Inteligência 360" },
                        { id: "esteira_credito", label: "Esteira de Crédito" },
                        { id: "documentos", label: "Acervo Documental", badge: documentos.length + contratosSociais.length || undefined },
                        { id: "followup", label: "Conversas", badge: followups.filter(f => !f.concluido).length || undefined },
                        { id: "simulacoes", label: "Simulações", badge: simulacoesEmpresa.length || undefined },
                        { id: "contratos", label: "Contratos Firmados", badge: contratosEmpresa.length || undefined },
                        { id: "historico", label: "Histórico", badge: historico.length || undefined },
                      ] as const).filter(aba => abaPermitida(aba.id)).map(aba => (
                        <button
                          key={aba.id}
                          onClick={() => navegarParaAba(aba.id)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition-all whitespace-nowrap ${
                            abaAtiva === aba.id
                              ? "border-primary/30 bg-primary text-primary-foreground shadow-md shadow-blue-100"
                              : "border-border text-muted-foreground bg-card hover:text-foreground hover:border-input hover:bg-muted"
                          }`}
                        >
                          {aba.label}
                          {(aba as any).badge > 0 && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                              abaAtiva === aba.id ? "bg-card/20 text-primary-foreground" : "bg-primary/20 text-primary"
                            }`}>{(aba as any).badge}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Conteúdo das abas ── */}
                  <div className="min-w-0 overflow-visible pb-6">
                    {loadingDetalhe ? (
                      <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : (

                    /* ── VISÃO GERAL ── */
                    (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "visao_geral" ? (
                      <EmpresaDadosWorkspace
                        empresa={selecionada}
                        socios={sociosExibicao}
                        documentosTotal={documentos.length + contratosSociais.length}
                        simulacoesTotal={simulacoesEmpresa.length}
                        contratosTotal={contratosEmpresa.length}
                        sincronizando={sincronizando}
                        onSincronizar={isFeatureEnabled("empresa-action-atualizar-cadastro") ? () => sincronizarDados(selecionada) : undefined}
                        onEditar={isFeatureEnabled("empresa-action-editar") ? () => abrirEditar(selecionada) : undefined}
                        onEditarSocio={isFeatureEnabled("empresa-action-editar") ? abrirEdicaoSocio : undefined}
                        onAbrirAcervo={abaPermitida("documentos") ? () => navegarParaAba("documentos") : undefined}
                      />
                    )

                    /* ── DOSSIÊ DE CRÉDITO ── */
                    // O dossiê/laudo IA passou a ter uma casa única: a página exclusiva
                    // do acervo (/acervo?view=analise), a mesma que abre sozinha ao
                    // terminar "Iniciar análise documental". Antes esta aba renderizava
                    // uma SEGUNDA cópia independente do <DossieCreditoEmpresa>, com seu
                    // próprio carregamento do zero ("Montando Dossiê de Crédito...") --
                    // clicar em "Voltar para a empresa" a partir do acervo e depois nesta
                    // aba recarregava tudo de novo, um caminho longo pra ver a mesma
                    // coisa. O useEffect de segurança logo acima já redireciona direto
                    // pra página exclusiva assim que abaAtiva vira "dossie_credito";
                    // este bloco só cobre o instante entre o clique e o redirecionamento,
                    // igual ao padrão já usado na aba "Acervo Documental".
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "dossie_credito" ? (
                      <div className="p-3 fade-in">
                        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex items-center justify-center gap-3 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <p className="text-sm font-semibold">Abrindo dossiê / laudo IA...</p>
                        </div>
                      </div>
                    )

                    /* ── INTELIGÊNCIA 360 ── */
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "inteligencia_360" ? (
                      selecionada?.id ? (
                        <Inteligencia360
                          empresaId={selecionada.id}
                          onNavegar={(aba) => {
                            if (isAbaEmpresa(aba)) navegarParaAba(aba);
                          }}
                        />
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground">Empresa não selecionada.</div>
                      )
                    )

                    /* ── ESTEIRA DE CRÉDITO ── */
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "esteira_credito" ? (
                      selecionada?.id ? (
                        <div className="p-4">
                          <EsteiraCredito
                            empresaId={selecionada.id}
                            onNavegar={(aba) => {
                              if (isAbaEmpresa(aba)) navegarParaAba(aba);
                            }}
                          />
                        </div>
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground">Empresa não selecionada.</div>
                      )
                    )

                    /* ── SÓCIOS ── */
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "socios" ? (
                      <div className="p-5 fade-in space-y-4">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <h3 className="text-sm font-bold text-muted-foreground">QSA e administração</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Quadro de Sócios e Administradores da empresa.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/20 text-primary">
                              {sociosExibicao.length} sócio(s)
                            </span>
                            {selecionada.cnpj && isFeatureEnabled("empresa-action-atualizar-cadastro") && (
                              <button
                                onClick={() => sincronizarDados(selecionada)}
                                disabled={sincronizando}
                                className="flex items-center gap-1 text-xs font-semibold text-success border border-success/20 bg-success/10 px-2.5 py-1 rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50"
                                title="Atualizar dados societários"
                              >
                                <RotateCw className={`w-3 h-3 ${sincronizando ? "animate-spin" : ""}`} />
                                Atualizar dados societários
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary leading-relaxed">
                          Cadastro atualizado e salvo com dados da Receita/fontes confiáveis. Complete manualmente apenas o que não vier das fontes.
                        </div>

                        {sociosExibicao.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-border">
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                              <Users className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground font-medium">Nenhum sócio cadastrado</p>
                            <p className="text-xs text-muted-foreground">Nenhum sócio-administrador cadastrado. Atualize os dados ou complete manualmente o responsável da empresa.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {sociosExibicao.map((s: any) => {
                              const pendencias = Array.isArray(s.pendencias_contrato) ? s.pendencias_contrato : pendenciasSocioContrato(s);
                              const completo = pendencias.length === 0;
                              return (
                                <div key={s.id} className="p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow space-y-3">
                                  <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSociosExpandidos(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/90 text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                                      {(s.nome?.charAt(0) ?? "?").toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-foreground truncate">{s.nome}</p>
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {s.qualificacao_socio && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{s.qualificacao_socio}</span>}
                                        {s.representante_legal && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success/20 text-success">Representante legal</span>}
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${completo ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                                          {completo ? 'Completo para contrato' : `${pendencias.length} pendência(s)`}
                                        </span>
                                      </div>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-muted-foreground mt-2 transition-transform ${sociosExpandidos[s.id] ? 'rotate-180' : ''}`} />
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">CPF/CNPJ do sócio</span><b className="text-muted-foreground font-mono">{s.cpf_cnpj || 'Não informado'}</b>{s.inferido_empresa ? <button onClick={() => selecionada && abrirEditar(selecionada)} className="block mt-1 text-[11px] font-bold text-primary hover:underline">Completar no cadastro</button> : <button onClick={() => { const cpf = prompt('Informe o CPF completo do sócio'); if (cpf) atualizarCpfManualSocio(s, cpf); }} className="block mt-1 text-[11px] font-bold text-primary hover:underline">Informar CPF completo</button>}</div>
                                    <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Entrada na sociedade</span><b className="text-muted-foreground">{s.data_entrada_sociedade ? new Date(s.data_entrada_sociedade).toLocaleDateString('pt-BR') : 'Não informado'}</b></div>
                                    <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">País</span><b className="text-muted-foreground">{s.pais || 'Não informado'}</b></div>
                                    <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Representante legal</span><b className="text-muted-foreground">{s.nome_representante || (s.representante_legal ? 'Sim' : 'Não informado')}</b></div>
                                  </div>

                                  {sociosExpandidos[s.id] && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs border-t border-border pt-3">
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Qualificação representante</span><b className="text-muted-foreground">{s.qualificacao_representante || 'Não informado'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Nascimento</span><b className="text-muted-foreground">{s.data_nascimento ? new Date(s.data_nascimento).toLocaleDateString('pt-BR') : 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Gênero</span><b className="text-muted-foreground">{s.genero || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Estado civil</span><b className="text-muted-foreground">{s.estado_civil || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Profissão</span><b className="text-muted-foreground">{s.profissao || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">RG</span><b className="text-muted-foreground">{s.rg || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Cônjuge</span><b className="text-muted-foreground">{s.conjuge_nome || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Endereço</span><b className="text-muted-foreground">{[s.logradouro, s.numero, s.bairro, s.cidade, s.uf].filter(Boolean).join(', ') || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">E-mail</span><b className="text-muted-foreground truncate block">{s.email || 'Pendente'}</b></div>
                                      <div className="rounded-lg bg-muted border border-border p-2"><span className="block text-muted-foreground">Telefone/WhatsApp</span><b className="text-muted-foreground">{s.whatsapp || s.telefone || 'Pendente'}</b></div>
                                    </div>
                                  )}

                                  {sociosExpandidos[s.id] && !s.inferido_empresa && (
                                    <div className="border-t border-border pt-3">
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
                                        <button onClick={() => selecionada && abrirEditar(selecionada)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"><Edit2 className="w-3 h-3" /> Completar dados</button>
                                        <button onClick={() => selecionada && sincronizarDados(selecionada)} disabled={sincronizando} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-success/20 text-success bg-success/10 hover:bg-success/20 disabled:opacity-50"><RotateCw className="w-3 h-3" /> Atualizar</button>
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={() => abrirEdicaoSocio(s)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"><Edit2 className="w-3 h-3" /> Editar</button>
                                        <button onClick={() => atualizarSocioIndividual(s)} disabled={sincronizando} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-success/20 text-success bg-success/10 hover:bg-success/20 disabled:opacity-50"><RotateCw className="w-3 h-3" /> Atualizar</button>
                                        <button onClick={() => apagarSocio(s)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-destructive/20 text-destructive bg-destructive/10 hover:bg-destructive/20"><Trash2 className="w-3 h-3" /> Apagar</button>
                                      </>
                                    )}
                                  </div>

                                  {pendencias.length > 0 && (
                                    <div className="rounded-lg bg-warning/10 border border-warning/20 p-2">
                                      <p className="text-[11px] font-bold text-warning mb-1">Dados para contratos e etapas futuras — não bloqueiam a Fase 1</p>
                                      <div className="flex flex-wrap gap-1">
                                        {pendencias.slice(0, 8).map((p: string) => <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-card border border-warning/20 text-warning">{p}</span>)}
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
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "followup" ? (
                      <div className="p-5 fade-in">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-muted-foreground">Conversas</h3>
                          <button onClick={() => setShowFollowupForm(true)} className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
                            <PlusCircle className="w-3.5 h-3.5" /> Novo
                          </button>
                        </div>
                        {showFollowupForm && (
                          <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3">
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
                              <button onClick={salvarFollowup} className="flex-1 bg-primary text-primary-foreground text-sm font-semibold py-2 rounded-lg hover:bg-primary/90 transition-colors">Salvar</button>
                              <button onClick={() => setShowFollowupForm(false)} className="flex-1 bg-card border border-border text-muted-foreground text-sm py-2 rounded-lg hover:bg-muted transition-colors">Cancelar</button>
                            </div>
                          </div>
                        )}
                        {followups.length === 0 && !showFollowupForm ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-border">
                            <Bell className="w-10 h-10 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Nenhuma conversa registrada</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {followups.map(f => (
                              <div key={f.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${f.concluido ? "border-border bg-muted opacity-60" : "border-border bg-card hover:border-primary/20"}`}>
                                <button onClick={() => !f.concluido && concluirFollowup(f.id)} className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${f.concluido ? "bg-success/100 border-success/70" : "border-input hover:border-success/50"}`}>
                                  {f.concluido && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${f.concluido ? "line-through text-muted-foreground" : "text-foreground"}`}>{f.titulo}</p>
                                  {f.descricao && <p className="text-xs text-muted-foreground mt-0.5">{f.descricao}</p>}
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{f.tipo}</span>
                                    {f.data_agendada && (
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${!f.concluido && new Date(f.data_agendada) < new Date() ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>
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
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "historico" ? (
                      <div className="p-5 fade-in">
                        <div className="flex gap-2 mb-4">
                          <textarea
                            className={inputCls + " resize-none h-10 py-2 flex-1"}
                            placeholder="Adicionar nota ou observação (Ctrl+Enter)..."
                            value={novaObs}
                            onChange={e => setNovaObs(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) adicionarHistorico(novaObs); }}
                          />
                          <button onClick={() => adicionarHistorico(novaObs)} disabled={!novaObs.trim()} className="shrink-0 px-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors">
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        {historico.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-border">
                            <History className="w-10 h-10 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Nenhum registro ainda</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {historico.map(h => (
                              <div key={h.id} className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 shrink-0">
                                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <div className="flex-1 bg-muted rounded-xl px-3 py-2.5 border border-border">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">{h.autor || "Sistema"}</span>
                                    <span className="text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</span>
                                  </div>
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{h.descricao}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Histórico 360 consolidado */}
                        {selecionada?.id && (
                          <div className="mt-4 space-y-4">
                            <NexusTarefasEmpresa empresaId={selecionada.id} />
                            <Historico360
                              empresaId={selecionada.id}
                              onNavegar={(aba) => {
                                if (isAbaEmpresa(aba)) {
                                  setAbaAtiva(aba);
                                  if (selecionada?.id) setLocation(`/colaborador/empresas?empresa=${selecionada.id}&aba=${aba}`);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )

                    /* ── ACERVO DOCUMENTAL ── */
                    // Não mostra mais o card com o botão "Abrir acervo documental": o
                    // useEffect logo acima já redireciona direto para a página exclusiva
                    // assim que abaAtiva vira "documentos". Este bloco só cobre o instante
                    // entre o clique e o redirecionamento, para nunca aparecer em branco.
                    : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "documentos" ? (
                      <div className="p-3 fade-in">
                        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex items-center justify-center gap-3 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <p className="text-sm font-semibold">Abrindo acervo documental...</p>
                        </div>
                      </div>
                    ) : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "simulacoes" ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-muted-foreground">Simulações vinculadas</h3>
                          <span className="text-xs text-muted-foreground">{simulacoesEmpresa.length} registro(s)</span>
                        </div>
                        {simulacoesEmpresa.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-border">
                            <span className="text-4xl">🧮</span>
                            <p className="text-sm text-muted-foreground">Nenhuma simulação vinculada a esta empresa</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {simulacoesEmpresa.map((sim: any) => (
                              <div key={sim.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                                  <span className="text-base">🧮</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-foreground">{sim.produto || "Simulação"}</p>
                                    {sim.status && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                        sim.status === "aprovado" ? "bg-success/20 text-success" :
                                        sim.status === "reprovado" ? "bg-destructive/20 text-destructive" :
                                        "bg-muted text-muted-foreground"
                                      }`}>{sim.status}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {sim.valor_solicitado && (
                                      <span className="text-xs text-muted-foreground">
                                        💰 {Number(sim.valor_solicitado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    )}
                                    {sim.prazo_meses && (
                                      <span className="text-xs text-muted-foreground">📅 {sim.prazo_meses}x</span>
                                    )}
                                    {sim.taxa_juros && (
                                      <span className="text-xs text-muted-foreground">📈 {sim.taxa_juros}% a.m.</span>
                                    )}
                                    {sim.valor_parcela && (
                                      <span className="text-xs text-muted-foreground">
                                        💳 {Number(sim.valor_parcela).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {sim.colaborador_nome && (
                                      <span className="text-xs text-muted-foreground">👤 {sim.colaborador_nome}</span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {sim.criado_em ? new Date(sim.criado_em).toLocaleDateString("pt-BR") : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (abaPermitida(abaAtiva) ? abaAtiva : primeiraAbaPermitida()) === "contratos" ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="text-sm font-semibold text-muted-foreground">Contratos Firmados</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Contrato de prestação de serviços entre a Destrava e o cliente. Ao gerar, fica "aguardando assinatura"; a prestação de serviço só começa depois que o contrato assinado é anexado aqui.</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{contratosEmpresa.length} registro(s)</span>
                        </div>
                        {contratosEmpresa.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-border">
                            <span className="text-4xl">📄</span>
                            <p className="text-sm text-muted-foreground">Nenhum contrato firmado para esta empresa</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {contratosEmpresa.map((cont: any) => {
                              const assinado = cont.status === "assinado" || cont.status === "ativo";
                              const cancelado = cont.status === "cancelado";
                              const statusLabel = assinado ? "Assinado" : cancelado ? "Cancelado" : "Aguardando assinatura";
                              const statusCls = assinado ? "bg-success/20 text-success" : cancelado ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning";
                              return (
                              <div key={cont.id} className={`flex items-start gap-3 p-3 rounded-xl border bg-card hover:bg-muted transition-colors ${assinado ? "border-border" : cancelado ? "border-destructive/20" : "border-warning/20"}`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${assinado ? "bg-success/10" : cancelado ? "bg-destructive/10" : "bg-warning/10"}`}>
                                  <span className="text-base">{assinado ? "✅" : cancelado ? "🚫" : "⏳"}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-foreground">
                                      {cont.numero_contrato || cont.protocolo_contrato || `Contrato #${cont.id?.slice(0,8)}`}
                                    </p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${statusCls}`}>{statusLabel}</span>
                                  </div>
                                  {!assinado && !cancelado && (
                                    <p className="text-[11px] text-warning mt-1">Contrato gerado, aguardando o cliente assinar. A prestação de serviço (CENPROT semanal, CND mensal) só começa depois que o contrato assinado for anexado abaixo.</p>
                                  )}
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {cont.tipo_contrato && (
                                      <span className="text-xs text-muted-foreground">📋 {cont.tipo_contrato}</span>
                                    )}
                                    {cont.valor_contrato && (
                                      <span className="text-xs text-muted-foreground">
                                        💰 {Number(cont.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    )}
                                    {cont.assinado_em && (
                                      <span className="text-xs text-success font-medium">
                                        ✍️ Assinado em {new Date(cont.assinado_em).toLocaleDateString("pt-BR")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {cont.responsavel_nome && (
                                      <span className="text-xs text-muted-foreground">👤 {cont.responsavel_nome}</span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      Gerado em {cont.created_at ? new Date(cont.created_at).toLocaleDateString("pt-BR") : "—"}
                                    </span>
                                  </div>
                                </div>
                                {(cont.pdf_path || cont.id) && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => handleVerContrato(cont.id)}
                                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                      title="Visualizar PDF"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleBaixarContrato(cont.id, cont.numero_contrato || cont.protocolo_contrato)}
                                      className="p-1.5 text-muted-foreground hover:text-success hover:bg-success/10 rounded-lg transition-colors"
                                      title="Baixar PDF"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    <label
                                      className={
                                        assinado
                                          ? "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors text-muted-foreground border border-border hover:bg-muted"
                                          : "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors text-primary-foreground bg-warning hover:bg-warning/90 shadow-sm"
                                      }
                                      title={assinado ? "Substituir contrato assinado" : "Anexar contrato assinado -- ativa CENPROT semanal e CND mensal"}
                                    >
                                      <Upload className="w-3.5 h-3.5" />
                                      {assinado ? "Substituir assinado" : "Anexar contrato assinado"}
                                      <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) abrirConfirmacaoAnexoAssinado(cont, file);
                                          e.currentTarget.value = "";
                                        }}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                              );
                            })}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
              <div>
                <h2 className="text-lg font-bold text-foreground">Sócio / Representante</h2>
                <p className="text-xs text-muted-foreground">Complete os dados exigidos para contratos, análises e assinatura.</p>
              </div>
              <button onClick={() => setSocioEditando(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              <SectionCard title="Dados societários importados" icon={<Users className="w-4 h-4" />}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3">
                  <MField label="Nome" required><input value={socioForm.nome || ''} onChange={e => setSocioCampo('nome', e.target.value)} className={inputCls} /></MField>
                  <MField label="CPF/CNPJ do sócio" required><input value={socioForm.cpf_cnpj || ''} onChange={e => setSocioCampo('cpf_cnpj', e.target.value)} className={inputCls} placeholder="CPF completo quando disponível" /></MField>
                  <MField label="Qualificação"><input value={socioForm.qualificacao_socio || ''} onChange={e => setSocioCampo('qualificacao_socio', e.target.value)} className={inputCls} placeholder="Sócio-administrador..." /></MField>
                  <MField label="Entrada na sociedade"><input type="date" value={socioForm.data_entrada_sociedade ? String(socioForm.data_entrada_sociedade).slice(0,10) : ''} onChange={e => setSocioCampo('data_entrada_sociedade', e.target.value)} className={inputCls} /></MField>
                  <MField label="Participação (%)"><input type="number" value={socioForm.percentual_capital || ''} onChange={e => setSocioCampo('percentual_capital', e.target.value)} className={inputCls} /></MField>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground pt-6"><input type="checkbox" checked={!!socioForm.representante_legal} onChange={e => setSocioCampo('representante_legal', e.target.checked)} /> Representante legal/assinante</label>
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
                  <label className="flex items-center gap-2 text-sm text-muted-foreground pt-6"><input type="checkbox" checked={!!socioForm.pep} onChange={e => setSocioCampo('pep', e.target.checked)} /> PEP</label>
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
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-muted shrink-0">
              <button type="button" onClick={() => setSocioEditando(null)} className="h-9 px-4 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted font-medium">Cancelar</button>
              <button type="button" onClick={salvarSocio} disabled={salvandoSocio} className="flex items-center gap-2 h-9 px-5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50">
                {salvandoSocio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar sócio/representante
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">

            {/* Header do modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                {!editando && etapaModal === "form" && (
                  <button onClick={() => { setEtapaModal("cnpj"); cnpjReset(); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary-foreground" />
                </div>
                <h2 className="text-base font-bold text-foreground">
                  {editando ? "Editar Empresa" : etapaModal === "cnpj" ? "Nova Empresa" : "Dados da Empresa"}
                </h2>
              </div>
              <button onClick={fecharModal} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── ETAPA CNPJ ── */}
            {!editando && etapaModal === "cnpj" && (
              <div className="flex flex-col items-center gap-6 p-8">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-blue-200">🏛️</div>
                  <h3 className="text-base font-bold text-foreground">Informe o CNPJ</h3>
                  <p className="text-sm text-muted-foreground mt-1">Dados preenchidos automaticamente via Receita Federal</p>
                </div>
                <div className="w-full max-w-xs">
                  <div className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3 bg-muted transition-all ${
                    cnpjStatus === "loading" ? "border-primary/50" :
                    cnpjStatus === "found" ? "border-success/50 bg-success/10" :
                    cnpjStatus === "error" ? "border-destructive/30 bg-destructive/10" :
                    "border-border focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/20"
                  }`}>
                    <span className="text-lg shrink-0">
                      {cnpjStatus === "loading" ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> :
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
                      className="flex-1 bg-transparent font-mono text-xl font-bold tracking-widest text-foreground focus:outline-none placeholder:text-muted-foreground placeholder:text-base placeholder:tracking-wide"
                    />
                  </div>
                  {cnpjStatus === "loading" && <p className="text-xs text-muted-foreground mt-2 text-center">🔎 Buscando dados para atualizar o cadastro...</p>}
                  {cnpjError && <p className="text-xs text-destructive font-medium mt-2 text-center">{cnpjError}</p>}
                  {podeCadastrarManualmente && (
                    <div className="mt-3 rounded-xl border border-warning/20 bg-warning/10 p-3 text-center">
                      <p className="text-xs text-warning">
                        Não foi possível localizar os dados deste CNPJ agora. Você pode continuar e informar os dados manualmente.
                      </p>
                      <button
                        type="button"
                        onClick={continuarCadastroManual}
                        className="mt-2 inline-flex items-center justify-center rounded-lg bg-warning px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-warning/90"
                      >
                        Continuar cadastro manualmente
                      </button>
                    </div>
                  )}
                  {cnpjStatus === "found" && <p className="text-xs text-success font-medium mt-2 text-center">✓ Dados carregados para preenchimento. Ao salvar, o cadastro será atualizado no banco.</p>}
                </div>
                <p className="text-xs text-warning text-center max-w-xs">
                  CNPJ inválido continua bloqueado. Se a consulta falhar para um CNPJ válido, o cadastro manual ficará disponível.
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
                          <input value={form.razao_social} onChange={e => set("razao_social", e.target.value)} placeholder="Razão Social Ltda." className={`${inputCls} ${erros.razao_social ? "border-destructive/30" : ""}`} />
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
                        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Sócios identificados pela Receita Federal</p>
                        {socios.map((s, i) => (
                          <button key={i} type="button" onClick={() => { set("responsavel_nome", s.nome_socio || ""); set("responsavel_cpf", s.cnpj_cpf_do_socio || ""); set("responsavel_cargo", s.descricao_qualificacao_socio || ""); }} className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-muted hover:border-primary/30 hover:bg-primary/10 transition-all text-left group">
                            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-primary/90">{s.nome_socio?.charAt(0) ?? "?"}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{s.nome_socio}</p>
                              <p className="text-xs text-muted-foreground">{s.descricao_qualificacao_socio || s.qualificacao_socio}</p>
                            </div>
                            <span className="text-[11px] text-primary font-medium opacity-0 group-hover:opacity-100">Usar</span>
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
                        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Tags</label>
                        <div className="flex gap-2">
                          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const t = tagInput.trim(); if (t && !(form.tags||[]).includes(t)) { set("tags", [...(form.tags||[]), t]); setTagInput(""); } } }} placeholder="Adicionar tag..." className={inputCls + " flex-1"} />
                          <button type="button" onClick={() => { const t = tagInput.trim(); if (t && !(form.tags||[]).includes(t)) { set("tags", [...(form.tags||[]), t]); setTagInput(""); } }} className="h-9 px-3 border border-border rounded-lg text-muted-foreground hover:bg-muted"><Plus className="w-4 h-4" /></button>
                        </div>
                        {(form.tags||[]).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(form.tags||[]).map(tag => (
                              <span key={tag} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
                                {tag}
                                <button type="button" onClick={() => set("tags", (form.tags||[]).filter(t => t !== tag))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <MField label="Observações">
                        <textarea value={form.observacoes || ""} onChange={e => set("observacoes", e.target.value)} placeholder="Informações adicionais..." rows={3} className={inputCls + " h-auto py-2 resize-none"} />
                      </MField>
                      {/* Equipe */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
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
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-muted shrink-0">
                  <button type="button" onClick={fecharModal} className="h-9 px-4 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted font-medium transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleSalvar} disabled={salvando} className="flex items-center gap-2 h-9 px-5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors shadow-sm">
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editando ? "Salvar Alterações" : "Cadastrar Empresa"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmação antes de anexar/substituir o contrato assinado -- deixa
          explícito qual contrato (número + tipo) está sendo trocado, já que
          uma empresa pode ter mais de um tipo de contrato de prestação de
          serviço firmado com a Destrava (assessoria, limpa nome, rating...).
          Só depois de marcar a confirmação de que as assinaturas de todas as
          partes foram conferidas é que o upload de verdade acontece. */}
      {modalAnexoAssinado && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Confirmar contrato assinado</p>
                <p className="text-xs text-muted-foreground mt-0.5">Confira se este é o contrato certo antes de enviar.</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Contrato que será substituído</p>
                <p className="text-sm font-bold text-foreground mt-1">
                  {modalAnexoAssinado.contrato.numero_contrato || modalAnexoAssinado.contrato.protocolo_contrato || `Contrato #${modalAnexoAssinado.contrato.id?.slice(0, 8)}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  📋 Tipo: <strong>{modalAnexoAssinado.contrato.tipo_contrato || "não especificado"}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate">📄 Arquivo: {modalAnexoAssinado.file.name}</p>
              </div>
              {contratosEmpresa.length > 1 && (
                <p className="text-[11px] text-warning bg-warning/10 border border-warning/20 rounded-lg px-2.5 py-1.5">
                  Esta empresa tem {contratosEmpresa.length} contratos firmados. Confirme acima que o tipo é o mesmo do contrato que o cliente assinou antes de continuar.
                </p>
              )}
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmouAssinaturas}
                  onChange={(e) => setConfirmouAssinaturas(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>Confirmo que revisei o PDF anexado e as assinaturas de todas as partes (contratante e contratada) estão presentes, no local correto.</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2 bg-muted">
              <button
                type="button"
                onClick={() => { setModalAnexoAssinado(null); setConfirmouAssinaturas(false); }}
                disabled={enviandoAnexoAssinado}
                className="h-9 px-4 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleAnexarContratoAssinado(modalAnexoAssinado.contrato.id, modalAnexoAssinado.file)}
                disabled={!confirmouAssinaturas || enviandoAnexoAssinado}
                className="h-9 px-4 rounded-lg bg-warning text-primary-foreground text-xs font-bold hover:bg-warning/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {enviandoAnexoAssinado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {enviandoAnexoAssinado ? "Enviando..." : "Confirmar e anexar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {tarefaNexusOpen && selecionada && (
        <CriarTarefaNexusModal
          entidade={{ tipo: 'empresa', id: selecionada.id, nome: selecionada.razao_social || selecionada.nome_fantasia || 'Empresa' }}
          onClose={() => setTarefaNexusOpen(false)}
        />
      )}
    </Layout>
  );
}
