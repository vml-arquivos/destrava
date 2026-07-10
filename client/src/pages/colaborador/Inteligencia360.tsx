/**
 * Inteligencia360.tsx
 *
 * Aba "Central de Inteligência / Cliente 360" para a página da empresa.
 * Exibe visão consolidada executiva com diagnóstico determinístico.
 *
 * REGRA: ZERO REGRESSÃO — não altera dados, apenas leitura.
 * Todos os campos têm fallback seguro para undefined/null/[].
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  Building2, Users, FileText, AlertTriangle, CheckCircle2,
  TrendingUp, ShieldCheck, ShieldAlert, ShieldX, ShieldOff,
  BarChart3, Banknote, Clock, Star, Zap, ArrowRight,
  FileWarning, BookOpen, Target, ChevronDown, ChevronUp,
  RefreshCw, Info, XCircle, CheckCheck, AlertCircle,
  CreditCard, Briefcase, Calendar, Hash,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Recomendacao360 {
  titulo: string;
  prioridade: "alta" | "media" | "baixa";
  motivo: string;
  acao: string;
  modulo: string;
}

interface Pendencia360 {
  tipo: string;
  descricao: string;
  severidade: "critica" | "alta" | "media" | "baixa";
}

interface PropostaPreliminar {
  empresa: string;
  cnpj: string | null;
  segmento: string | null;
  cnae: string | null;
  capital_social: number | null;
  faturamento: number | null;
  score_interno: number | null;
  documentos_disponiveis: number;
  pendencias_count: number;
  valor_sugerido: number | null;
  observacao: string;
  apto_para_proposta: boolean;
}

interface Inteligencia360Data {
  empresa_id: string;
  razao_social: string;
  cnpj: string | null;
  saude_cadastral: string;
  saude_documental: string;
  risco_documental: string;
  risco_credito: string;
  prontidao_contrato: string;
  prontidao_proposta_bancaria: string;
  score_destrava: number;
  score_serasa: number | null;
  score_spc: number | null;
  score_interno: number | null;
  situacao_cadastral: string;
  regime_tributario: string | null;
  porte: string | null;
  capital_social: number | null;
  data_abertura: string | null;
  cnae_principal: string | null;
  segmento: string | null;
  dados_receita: {
    sincronizado: boolean;
    ultima_sincronizacao: string | null;
    situacao: string | null;
    data_situacao: string | null;
    motivo_situacao: string | null;
    matriz_filial: string | null;
    natureza_juridica: string | null;
  };
  socios: any[];
  socios_com_cpf: number;
  socios_sem_cpf: number;
  socios_com_pendencias: number;
  documentos: any[];
  documentos_com_arquivo: number;
  documentos_sem_arquivo: number;
  documentos_validados: number;
  documentos_pendentes_validacao: number;
  pendencias: Pendencia360[];
  pendencias_contrato: string[];
  pendencias_credito: string[];
  pendencias_faturamento: string[];
  pendencias_cadastrais: string[];
  simulacoes: any[];
  contratos: any[];
  faturamento: number | null;
  historico_count: number;
  followups_abertos: number;
  proposta_preliminar: PropostaPreliminar;
  recomendacoes: Recomendacao360[];
  proximas_acoes: string[];
  diagnostico_geral: string;
  caminho_sugerido: string;
  gerado_em: string;
  fonte: string;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function fmtBRL(v: number | null | undefined): string {
  if (v === null || v === undefined) return "Não informado";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "Não informado";
  try {
    return new Date(v).toLocaleDateString("pt-BR");
  } catch {
    return String(v);
  }
}

// ─── Configurações visuais ────────────────────────────────────────────────────

const SAUDE_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  completo:     { label: "Completo",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  basico:       { label: "Básico",       color: "text-sky-700",     bg: "bg-sky-50 border-sky-200",         dot: "bg-sky-500" },
  incompleto:   { label: "Incompleto",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-500" },
  parcial:      { label: "Parcial",      color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-500" },
  insuficiente: { label: "Insuficiente", color: "text-orange-700",  bg: "bg-orange-50 border-orange-200",   dot: "bg-orange-500" },
  critico:      { label: "Crítico",      color: "text-red-700",     bg: "bg-red-50 border-red-200",         dot: "bg-red-500" },
};

const RISCO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  baixo:   { label: "Baixo",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", Icon: ShieldCheck },
  medio:   { label: "Médio",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     Icon: ShieldAlert },
  alto:    { label: "Alto",    color: "text-orange-700",  bg: "bg-orange-50 border-orange-200",   Icon: ShieldAlert },
  critico: { label: "Crítico", color: "text-red-700",     bg: "bg-red-50 border-red-200",         Icon: ShieldX },
};

const PRONTIDAO_CFG: Record<string, { label: string; color: string }> = {
  pronto:                  { label: "Pronto",                   color: "text-emerald-700" },
  pendencias_menores:      { label: "Pendências menores",       color: "text-amber-700" },
  pendencias_criticas:     { label: "Pendências críticas",      color: "text-orange-700" },
  inapto:                  { label: "Inapto",                   color: "text-red-700" },
  necessita_complementacao:{ label: "Necessita complementação", color: "text-amber-700" },
  insuficiente:            { label: "Insuficiente",             color: "text-red-700" },
};

const PRIORIDADE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alta:  { label: "Alta",  color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  media: { label: "Média", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  baixa: { label: "Baixa", color: "text-slate-600",  bg: "bg-slate-50 border-slate-200" },
};

const SEV_CFG: Record<string, { color: string; label: string }> = {
  critica: { color: "text-red-700 bg-red-50 border-red-200",       label: "Crítica" },
  alta:    { color: "text-orange-700 bg-orange-50 border-orange-200", label: "Alta" },
  media:   { color: "text-amber-700 bg-amber-50 border-amber-200",  label: "Média" },
  baixa:   { color: "text-slate-600 bg-slate-50 border-slate-200",  label: "Baixa" },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const cor = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : pct >= 30 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-black text-slate-700 w-8 text-right tabular-nums">{score}</span>
    </div>
  );
}

function StatusChip({ value, cfg }: { value: string; cfg: Record<string, { label: string; color: string; bg: string; dot?: string }> }) {
  const c = cfg[value] ?? { label: value || "—", color: "text-slate-500", bg: "bg-slate-50 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border ${c.bg} ${c.color}`}>
      {c.dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
      {c.label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-600" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 min-w-[18px] text-center">{count}</span>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right">{value || "—"}</span>
    </div>
  );
}

function Accordion({ title, icon: Icon, badge, children, defaultOpen = false }: {
  title: string;
  icon: React.ElementType;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  empresaId: string;
  onNavegar?: (aba: string) => void;
}

export default function Inteligencia360({ empresaId, onNavegar }: Props) {
  const [data, setData] = useState<Inteligencia360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/inteligencia-360`);
      setData(res);
    } catch (err: any) {
      setErro(err?.message || "Erro ao carregar inteligência 360");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Calculando inteligência empresarial...</span>
      </div>
    );
  }

  if (erro || !data) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600 font-semibold">{erro || "Dados indisponíveis"}</p>
        <button onClick={carregar} className="mt-3 text-xs text-blue-600 hover:underline font-semibold">Tentar novamente</button>
      </div>
    );
  }

  // Garantir arrays seguros em todos os campos
  const socios = safeArr<any>(data.socios);
  const documentos = safeArr<any>(data.documentos);
  const simulacoes = safeArr<any>(data.simulacoes);
  const contratos = safeArr<any>(data.contratos);
  const pendencias = safeArr<Pendencia360>(data.pendencias);
  const pendencias_contrato = safeArr<string>(data.pendencias_contrato);
  const pendencias_credito = safeArr<string>(data.pendencias_credito);
  const pendencias_faturamento = safeArr<string>(data.pendencias_faturamento);
  const pendencias_cadastrais = safeArr<string>(data.pendencias_cadastrais);
  const recomendacoes = safeArr<Recomendacao360>(data.recomendacoes);
  const proximas_acoes = safeArr<string>(data.proximas_acoes);

  const riscoDoc = RISCO_CFG[data.risco_documental] ?? RISCO_CFG.medio;
  const riscoCredito = RISCO_CFG[data.risco_credito] ?? RISCO_CFG.medio;
  const RiscoDocIcon = riscoDoc.Icon;
  const RiscoCreditoIcon = riscoCredito.Icon;

  return (
    <div className="p-4 space-y-4 max-w-[1400px]">

      {/* ── Diagnóstico Geral ── */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-black text-slate-900">Central de Inteligência — Cliente 360</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                {data.fonte === "ia_assistida" ? "IA Assistida" : "Análise Determinística"}
              </span>
            </div>
            <p className="text-sm font-semibold text-blue-800 mt-1">{data.diagnostico_geral}</p>
            <p className="text-xs text-slate-500 mt-1">{data.caminho_sugerido}</p>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Gerado em {fmtDate(data.gerado_em)} às {data.gerado_em ? new Date(data.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
          <button
            onClick={carregar}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors shrink-0"
            title="Recalcular"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Painel de Scores ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Score Destrava", value: data.score_destrava, max: 100, icon: Star },
          { label: "Score Interno", value: data.score_interno, max: 1000, icon: BarChart3 },
          { label: "Score Serasa", value: data.score_serasa, max: 1000, icon: CreditCard },
          { label: "Score SPC", value: data.score_spc, max: 1000, icon: CreditCard },
        ].map(({ label, value, max, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-500">{label}</span>
            </div>
            {value !== null && value !== undefined ? (
              <ScoreBar score={value} max={max} />
            ) : (
              <span className="text-xs text-slate-400">Não informado</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Status Geral ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeader icon={Building2} title="Status Geral" />
          <div className="space-y-0.5">
            <InfoRow label="Saúde Cadastral" value={<StatusChip value={data.saude_cadastral} cfg={SAUDE_CFG} />} />
            <InfoRow label="Saúde Documental" value={<StatusChip value={data.saude_documental} cfg={SAUDE_CFG} />} />
            <InfoRow label="Situação Cadastral" value={data.situacao_cadastral} />
            <InfoRow label="Regime Tributário" value={data.regime_tributario || "Não informado"} />
            <InfoRow label="Porte" value={data.porte ? data.porte.toUpperCase() : "Não informado"} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeader icon={ShieldAlert} title="Risco" />
          <div className="space-y-2">
            <div className={`flex items-center gap-2 rounded-lg border p-2.5 ${riscoDoc.bg}`}>
              <RiscoDocIcon className={`w-4 h-4 ${riscoDoc.color} shrink-0`} />
              <div>
                <p className="text-[11px] font-bold text-slate-600">Risco Documental</p>
                <p className={`text-xs font-black ${riscoDoc.color}`}>{riscoDoc.label}</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 rounded-lg border p-2.5 ${riscoCredito.bg}`}>
              <RiscoCreditoIcon className={`w-4 h-4 ${riscoCredito.color} shrink-0`} />
              <div>
                <p className="text-[11px] font-bold text-slate-600">Risco de Crédito</p>
                <p className={`text-xs font-black ${riscoCredito.color}`}>{riscoCredito.label}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeader icon={Target} title="Prontidão" />
          <div className="space-y-0.5">
            <InfoRow
              label="Para Contrato"
              value={
                <span className={`text-xs font-bold ${PRONTIDAO_CFG[data.prontidao_contrato]?.color ?? "text-slate-500"}`}>
                  {PRONTIDAO_CFG[data.prontidao_contrato]?.label ?? data.prontidao_contrato}
                </span>
              }
            />
            <InfoRow
              label="Para Proposta Bancária"
              value={
                <span className={`text-xs font-bold ${PRONTIDAO_CFG[data.prontidao_proposta_bancaria]?.color ?? "text-slate-500"}`}>
                  {PRONTIDAO_CFG[data.prontidao_proposta_bancaria]?.label ?? data.prontidao_proposta_bancaria}
                </span>
              }
            />
            <InfoRow label="Simulações" value={simulacoes.length} />
            <InfoRow label="Contratos" value={contratos.length} />
            <InfoRow label="Conversas abertas" value={data.followups_abertos} />
          </div>
        </div>
      </div>

      {/* ── Dados da Receita ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeader icon={Hash} title="Dados da Receita Federal" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-0.5">
          <InfoRow label="CNPJ" value={data.cnpj || "Não informado"} />
          <InfoRow label="Situação" value={data.dados_receita?.situacao || "Não informado"} />
          <InfoRow label="Data Situação" value={fmtDate(data.dados_receita?.data_situacao)} />
          <InfoRow label="Motivo" value={data.dados_receita?.motivo_situacao || "—"} />
          <InfoRow label="Natureza Jurídica" value={data.dados_receita?.natureza_juridica || "Não informado"} />
          <InfoRow label="Matriz/Filial" value={data.dados_receita?.matriz_filial || "Não informado"} />
          <InfoRow label="CNAE Principal" value={data.cnae_principal || "Não informado"} />
          <InfoRow label="Capital Social" value={fmtBRL(data.capital_social)} />
          <InfoRow label="Data Abertura" value={fmtDate(data.data_abertura)} />
          <InfoRow label="Segmento" value={data.segmento || "Não informado"} />
          <InfoRow label="Faturamento Anual" value={fmtBRL(data.faturamento)} />
          <InfoRow
            label="Última Sincronização"
            value={
              data.dados_receita?.sincronizado
                ? fmtDate(data.dados_receita.ultima_sincronizacao)
                : <span className="text-amber-600 font-semibold">Não sincronizado</span>
            }
          />
        </div>
      </div>

      {/* ── Sócios ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader icon={Users} title="Sócios / QSA" count={socios.length} />
          <div className="flex gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              {data.socios_com_cpf} com CPF
            </span>
            {data.socios_sem_cpf > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold">
                {data.socios_sem_cpf} sem CPF
              </span>
            )}
          </div>
        </div>
        {socios.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Nenhum sócio cadastrado — necessário para contrato e análise de crédito.
          </div>
        ) : (
          <div className="space-y-2">
            {socios.map((s: any, i: number) => {
              const temCpf = s?.cpf_cnpj && String(s.cpf_cnpj).replace(/\D/g, "").length >= 11;
              return (
                <div key={s?.id ?? i} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-blue-700">{String(s?.nome || "?")[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{s?.nome || "Nome não informado"}</p>
                    <p className="text-[11px] text-slate-500">{s?.qualificacao_socio || "Qualificação não informada"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {temCpf ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                    {s?.representante_legal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Rep. Legal</span>
                    )}
                    {s?.percentual_capital && (
                      <span className="text-[10px] text-slate-500">{s.percentual_capital}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {onNavegar && (
          <button
            onClick={() => onNavegar("visao_geral")}
            className="mt-3 text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1"
          >
            <ArrowRight className="w-3 h-3" /> Gerenciar sócios
          </button>
        )}
      </div>

      {/* ── Documentação ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader icon={FileText} title="Documentação" count={documentos.length} />
          <div className="flex gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              {data.documentos_com_arquivo} com arquivo
            </span>
            {data.documentos_sem_arquivo > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                {data.documentos_sem_arquivo} sem arquivo
              </span>
            )}
            {data.documentos_validados > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                {data.documentos_validados} validados
              </span>
            )}
          </div>
        </div>
        {documentos.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
            <FileWarning className="w-4 h-4 text-amber-400" />
            Nenhum documento no acervo — faça upload dos documentos necessários.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
            {documentos.map((d: any, i: number) => {
              const temArquivo = !!(d?.arquivo_path || d?.url || d?.file_path);
              return (
                <div key={d?.id ?? i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                  {temArquivo ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span className="text-xs text-slate-700 truncate">{d?.tipo || d?.nome_arquivo || "Documento"}</span>
                  {d?.status && d.status !== "ativo" && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{d.status}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {onNavegar && (
          <button
            onClick={() => onNavegar("documentos")}
            className="mt-3 text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1"
          >
            <ArrowRight className="w-3 h-3" /> Abrir Acervo Documental
          </button>
        )}
      </div>

      {/* ── Pendências ── */}
      {pendencias.length > 0 && (
        <div className="space-y-2">
          <Accordion
            title={`Pendências Críticas (${pendencias.filter(p => p.severidade === "critica" || p.severidade === "alta").length})`}
            icon={AlertTriangle}
            badge={pendencias.filter(p => p.severidade === "critica" || p.severidade === "alta").length}
            defaultOpen={true}
          >
            <div className="space-y-2 pt-2">
              {pendencias.map((p, i) => {
                const sev = SEV_CFG[p.severidade] ?? SEV_CFG.baixa;
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-lg border p-2.5 ${sev.color}`}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">{p.descricao}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">{p.tipo} · {sev.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Accordion>

          {pendencias_contrato.length > 0 && (
            <Accordion title={`Para Contrato (${pendencias_contrato.length})`} icon={FileText} badge={pendencias_contrato.length}>
              <ul className="space-y-1.5 pt-2">
                {pendencias_contrato.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                    <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </Accordion>
          )}

          {pendencias_credito.length > 0 && (
            <Accordion title={`Para Crédito (${pendencias_credito.length})`} icon={Banknote} badge={pendencias_credito.length}>
              <ul className="space-y-1.5 pt-2">
                {pendencias_credito.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                    <XCircle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </Accordion>
          )}

          {pendencias_faturamento.length > 0 && (
            <Accordion title={`Para Faturamento (${pendencias_faturamento.length})`} icon={BarChart3} badge={pendencias_faturamento.length}>
              <ul className="space-y-1.5 pt-2">
                {pendencias_faturamento.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                    <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </Accordion>
          )}
        </div>
      )}

      {/* ── Propostas e Simulações ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeader icon={TrendingUp} title="Simulações" count={simulacoes.length} />
          {simulacoes.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">Nenhuma simulação realizada.</p>
          ) : (
            <div className="space-y-2">
              {simulacoes.slice(0, 3).map((s: any, i: number) => (
                <div key={s?.id ?? i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{s?.produto || "Produto não informado"}</p>
                    <p className="text-[11px] text-slate-500">{fmtBRL(s?.valor_solicitado)} · {s?.prazo_meses ? `${s.prazo_meses} meses` : "—"}</p>
                  </div>
                  {s?.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold shrink-0">{s.status}</span>
                  )}
                </div>
              ))}
              {simulacoes.length > 3 && (
                <p className="text-[11px] text-slate-400">+{simulacoes.length - 3} simulação(ões)</p>
              )}
            </div>
          )}
          {onNavegar && (
            <button
              onClick={() => onNavegar("simulacoes")}
              className="mt-2 text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1"
            >
              <ArrowRight className="w-3 h-3" /> Ver simulações
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeader icon={BookOpen} title="Contratos Firmados" count={contratos.length} />
          {contratos.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">Nenhum contrato firmado.</p>
          ) : (
            <div className="space-y-2">
              {contratos.slice(0, 3).map((c: any, i: number) => (
                <div key={c?.id ?? i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {c?.numero_contrato || c?.tipo_contrato || `Contrato #${String(c?.id || "").slice(0, 8)}`}
                    </p>
                    <p className="text-[11px] text-slate-500">{fmtDate(c?.data_assinatura)}</p>
                  </div>
                  {c?.status && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                      c.status === "ativo" || c.status === "assinado" ? "bg-emerald-100 text-emerald-700" :
                      c.status === "cancelado" ? "bg-red-100 text-red-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>{c.status}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {onNavegar && (
            <button
              onClick={() => onNavegar("contratos")}
              className="mt-2 text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1"
            >
              <ArrowRight className="w-3 h-3" /> Ver contratos
            </button>
          )}
        </div>
      </div>

      {/* ── Proposta Preliminar de Crédito ── */}
      <div className={`rounded-xl border p-4 ${data.proposta_preliminar?.apto_para_proposta ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center gap-2 mb-3">
          <Banknote className={`w-4 h-4 ${data.proposta_preliminar?.apto_para_proposta ? "text-emerald-600" : "text-slate-500"}`} />
          <h3 className="text-sm font-bold text-slate-800">Proposta Preliminar de Crédito</h3>
          {data.proposta_preliminar?.apto_para_proposta ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">Apto</span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold">Pendente</span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5">
          <InfoRow label="Empresa" value={data.proposta_preliminar?.empresa || "—"} />
          <InfoRow label="CNPJ" value={data.proposta_preliminar?.cnpj || "—"} />
          <InfoRow label="Segmento" value={data.proposta_preliminar?.segmento || "Não informado"} />
          <InfoRow label="CNAE" value={data.proposta_preliminar?.cnae || "Não informado"} />
          <InfoRow label="Capital Social" value={fmtBRL(data.proposta_preliminar?.capital_social)} />
          <InfoRow label="Faturamento" value={fmtBRL(data.proposta_preliminar?.faturamento)} />
          <InfoRow label="Score Interno" value={data.proposta_preliminar?.score_interno ?? "Não informado"} />
          <InfoRow label="Docs Disponíveis" value={data.proposta_preliminar?.documentos_disponiveis} />
          <InfoRow label="Pendências" value={data.proposta_preliminar?.pendencias_count} />
          {data.proposta_preliminar?.valor_sugerido && (
            <InfoRow label="Valor Sugerido" value={<span className="font-black text-emerald-700">{fmtBRL(data.proposta_preliminar.valor_sugerido)}</span>} />
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-3 italic border-t border-slate-200 pt-2">
          {data.proposta_preliminar?.observacao}
        </p>
      </div>

      {/* ── Recomendações Acionáveis ── */}
      {recomendacoes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeader icon={Zap} title="Recomendações Acionáveis" count={recomendacoes.length} />
          <div className="space-y-2">
            {recomendacoes.map((r, i) => {
              const pri = PRIORIDADE_CFG[r.prioridade] ?? PRIORIDADE_CFG.baixa;
              return (
                <div key={i} className={`rounded-xl border p-3 ${pri.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-bold ${pri.color}`}>{r.titulo}</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${pri.bg} ${pri.color}`}>
                      {pri.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">{r.motivo}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                    <p className="text-[11px] font-semibold text-slate-700">{r.acao}</p>
                    {onNavegar && r.modulo && (
                      <button
                        onClick={() => onNavegar(r.modulo)}
                        className="ml-auto text-[10px] text-blue-600 hover:underline font-semibold shrink-0"
                      >
                        Ir para módulo →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Próximas Ações ── */}
      {proximas_acoes.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <SectionHeader icon={CheckCircle2} title="Próximas Ações Recomendadas" />
          <ol className="space-y-2">
            {proximas_acoes.map((acao, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="h-5 w-5 rounded-full bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {acao}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Resumo de Atividade ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Histórico", value: data.historico_count, icon: Clock, color: "text-slate-600" },
          { label: "Conversas Abertas", value: data.followups_abertos, icon: AlertCircle, color: "text-amber-600" },
          { label: "Simulações", value: simulacoes.length, icon: BarChart3, color: "text-blue-600" },
          { label: "Contratos", value: contratos.length, icon: Briefcase, color: "text-emerald-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-xl font-black text-slate-800">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
