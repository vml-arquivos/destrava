import { useState, useEffect, useCallback, useRef } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  Plus,
  FileText,
  Settings,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "@/lib/currency";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Empresa = { id: string; razao_social: string; cnpj?: string };

type Config = {
  configurado: boolean;
  empresa_id?: string;
  faturamento_anual_declarado?: number;
  percentual_operacional?: number;
  limite_anual?: number;
  faturamento_anual_empresa?: number;
  percentual_operacional_padrao?: number;
};

type Movimentacao = {
  id?: string;
  data_movimento: string;
  tipo: "entrada" | "saida";
  categoria?: string;
  descricao?: string;
  valor: number;
};

type SaldoDiario = {
  id?: string;
  data_referencia: string;
  saldo_dia: number;
};

type LancamentoImportado = {
  id: string;
  acompanhamento_id: string;
  arquivo_id?: string | null;
  arquivo_nome?: string | null;
  data_movimento: string;
  tipo: "entrada" | "saida";
  categoria?: string | null;
  descricao?: string | null;
  valor: number;
  evidencia?: string | null;
  confianca?: number | null;
  status: "pendente" | "aprovado" | "descartado";
  aplicado_em?: string | null;
};

type SemanaFinanceira = {
  id: string;
  empresa_id: string;
  razao_social?: string;
  cnpj?: string;
  ano: number;
  mes: number;
  numero_semana: number;
  semana_inicio: string;
  semana_fim: string;
  saldo_inicial: number;
  total_entradas: number;
  total_saidas: number;
  saldo_final: number;
  saldo_medio: number;
  limite_semanal_referencia: number;
  limite_mensal_referencia: number;
  limite_anual_referencia: number;
  acumulado_mensal: number;
  acumulado_anual: number;
  percentual_uso_semana: number;
  percentual_uso_mes: number;
  percentual_uso_ano: number;
  status: string;
  diagnostico?: string;
  observacoes?: string;
  faturamento_anual_declarado?: number;
  percentual_operacional?: number;
  movimentacoes?: Movimentacao[];
  saldos_diarios?: SaldoDiario[];
  created_at?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function moneyBR(value?: unknown): string {
  const n = Number(value ?? 0);
  if (isNaN(n) || !isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pctBR(value?: unknown): string {
  const n = Number(value ?? 0);
  if (isNaN(n) || !isFinite(n)) return "0,00%";
  return `${n.toFixed(2).replace(".", ",")}%`;
}

function dataBR(value?: string | null): string {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return value;
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseMoneyInput(v: string): number {
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function nomeMes(mes: number): string {
  return MESES[(mes - 1)] || String(mes);
}

function normalizarCargo(v?: string | null): string {
  return String(v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_").replace(/-/g, "_");
}

function podeAcessarFinanceiro(user: any): boolean {
  if (!user) return false;
  if (user?.acesso_acompanhamento_financeiro === true) return true;
  const permitidos = new Set([
    "admin","administrador","super_admin","superadmin",
    "diretor",
    "gestor_credito","gestor_de_credito",
  ]);
  return (
    permitidos.has(normalizarCargo(user?.cargo)) ||
    permitidos.has(normalizarCargo(user?.perfil))
  );
}

function podeEditarPercentual(user: any): boolean {
  const c = normalizarCargo(user?.cargo);
  return ["administrador","admin","diretor"].includes(c);
}

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  dentro_da_referencia: { label: "Dentro da Referência", color: "text-success", bg: "bg-success/10", border: "border-success/30" },
  atencao_leve:         { label: "Atenção Leve",         color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  atencao_media:        { label: "Atenção Média",        color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  incompativel:         { label: "Incompatível",         color: "text-destructive",    bg: "bg-destructive/10",    border: "border-destructive/30" },
  critico:              { label: "Crítico",              color: "text-destructive",    bg: "bg-destructive/20",   border: "border-destructive/30" },
  sem_documentacao:     { label: "Sem Documentação",     color: "text-foreground",   bg: "bg-muted",   border: "border-input" },
  aguardando_atualizacao:{ label: "Aguardando Atualização", color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
  regularizado:         { label: "Regularizado",         color: "text-success",bg: "bg-success/10",border: "border-success/30" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: "text-foreground", bg: "bg-muted", border: "border-input" };
  const Icon = ["critico","incompativel"].includes(status) ? XCircle
    : ["dentro_da_referencia","regularizado"].includes(status) ? CheckCircle2
    : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold ${s.bg} ${s.color} ${s.border}`}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{s.label}</span>
    </span>
  );
}

// ─── Barra de progresso ───────────────────────────────────────────────────────

function BarraProgresso({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.min(pct, 200);
  const cor = pct > 120 ? "bg-destructive" : pct > 100 ? "bg-warning" : "bg-success";
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${pct > 100 ? "text-destructive" : "text-foreground"}`}>{pctBR(pct)}</span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${Math.min(clamped, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Modal de confirmação de exclusão ─────────────────────────────────────────

function ModalConfirmacao({
  aberto,
  mensagem,
  onConfirmar,
  onCancelar,
  carregando,
}: {
  aberto: boolean;
  mensagem: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  carregando?: boolean;
}) {
  return (
    <Dialog open={aberto} onOpenChange={v => !v && onCancelar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground py-2">{mensagem}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={carregando}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={carregando}>
            {carregando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Formulário de configuração ───────────────────────────────────────────────

function FormConfig({
  empresaId,
  config,
  onSalvo,
  onClose,
  user,
}: {
  empresaId: string;
  config: Config;
  onSalvo: () => void;
  onClose: () => void;
  user: any;
}) {
  // fat: valor de faturamento exibido no input (string formatada com máscara)
  const [fat, setFat] = useState(() => {
    const v = config.faturamento_anual_declarado || config.faturamento_anual_empresa || 0;
    return v ? formatBRLCurrency(v) : "";
  });
  const [pct, setPct] = useState(
    String(config.percentual_operacional || config.percentual_operacional_padrao || 30)
  );
  const [saving, setSaving] = useState(false);
  const [limites, setLimites] = useState<{ limite_anual: number; limite_mensal: number; limite_semanal: number; semanas_no_mes: number } | null>(null);
  const editarPct = podeEditarPercentual(user);

  // Valor numérico do faturamento (derivado da string formatada)
  const fatNum = unmaskCurrencyInput(fat);

  const calcularPreview = useCallback(async () => {
    const f = fatNum;
    const p = parseFloat(String(pct).replace(",", "."));
    if (!isFinite(f) || f <= 0 || !isFinite(p) || p <= 0) { setLimites(null); return; }
    try {
      const data = await apiFetch("/api/acompanhamento-financeiro/calcular-limites", {
        method: "POST",
        body: JSON.stringify({
          faturamento_anual_declarado: f,
          percentual_operacional: p,
          ano: new Date().getFullYear(),
          mes: new Date().getMonth() + 1,
        }),
      });
      setLimites(data);
    } catch {}
  }, [fatNum, pct]);

  useEffect(() => { calcularPreview(); }, [calcularPreview]);

  const salvar = async () => {
    const f = fatNum;
    const p = parseFloat(String(pct).replace(",", "."));
    if (!isFinite(f) || f < 0) { toast.error("Faturamento anual inválido."); return; }
    if (!isFinite(p) || p <= 0 || p > 100) { toast.error("Percentual deve estar entre 0,01% e 100%."); return; }
    setSaving(true);
    try {
      await apiFetch("/api/acompanhamento-financeiro/config", {
        method: "POST",
        body: JSON.stringify({ empresa_id: empresaId, faturamento_anual_declarado: f, percentual_operacional: p }),
      });
      toast.success("Configuração salva com sucesso.");
      onSalvo();
    } catch (err: any) { toast.error(err?.message || "Erro de conexão."); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Faturamento Anual Declarado (R$)</Label>
          <Input
            value={fat}
            onChange={e => setFat(maskCurrencyInput(e.target.value))}
            placeholder="0,00"
            inputMode="numeric"
            autoComplete="off"
            className="mt-1 text-right font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground mt-1">Informe o valor bruto anual declarado</p>
        </div>
        <div>
          <Label>Percentual Operacional (%)</Label>
          <Input
            value={pct}
            onChange={e => setPct(e.target.value)}
            placeholder="30"
            disabled={!editarPct}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {editarPct ? "Padrão: 30%" : "Somente Administrador ou Diretor pode alterar"}
          </p>
        </div>
      </div>

      {limites && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-primary uppercase">Limites Calculados (prévia)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="text-center bg-card rounded border border-primary/20 p-3">
              <p className="text-xs text-primary uppercase font-medium">Limite Anual</p>
              <p className="text-base font-bold text-primary mt-1">{moneyBR(limites.limite_anual)}</p>
              <p className="text-xs text-primary">{pct}% de {moneyBR(fatNum)}</p>
            </div>
            <div className="text-center bg-card rounded border border-primary/20 p-3">
              <p className="text-xs text-primary uppercase font-medium">Limite Mensal</p>
              <p className="text-base font-bold text-primary mt-1">{moneyBR(limites.limite_mensal)}</p>
              <p className="text-xs text-primary">÷ 12 meses</p>
            </div>
            <div className="text-center bg-card rounded border border-primary/20 p-3">
              <p className="text-xs text-primary uppercase font-medium">Limite Semanal</p>
              <p className="text-base font-bold text-primary mt-1">{moneyBR(limites.limite_semanal)}</p>
              <p className="text-xs text-primary">÷ {limites.semanas_no_mes} semanas no mês</p>
            </div>
          </div>
        </div>
      )}

      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
        <Button onClick={salvar} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configuração
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Formulário de semana ─────────────────────────────────────────────────────

function FormSemana({
  empresaId,
  semanaExistente,
  onSalvo,
  onClose,
}: {
  empresaId: string;
  semanaExistente?: SemanaFinanceira | null;
  onSalvo: () => void;
  onClose: () => void;
}) {
  const hoje = isoDate(new Date());
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const [form, setForm] = useState({
    ano: semanaExistente?.ano ?? anoAtual,
    mes: semanaExistente?.mes ?? mesAtual,
    numero_semana: semanaExistente?.numero_semana ?? 1,
    semana_inicio: semanaExistente?.semana_inicio?.slice(0, 10) ?? hoje,
    semana_fim: semanaExistente?.semana_fim?.slice(0, 10) ?? hoje,
    saldo_inicial: String(semanaExistente?.saldo_inicial ?? ""),
    observacoes: semanaExistente?.observacoes ?? "",
  });

  // Movimentações com edição inline
  const [movs, setMovs] = useState<Movimentacao[]>(semanaExistente?.movimentacoes ?? []);
  const [editMovIdx, setEditMovIdx] = useState<number | null>(null);
  const [novaMov, setNovaMov] = useState<Movimentacao>({
    data_movimento: hoje, tipo: "entrada", categoria: "", descricao: "", valor: 0,
  });

  // Saldos diários com edição inline
  const [saldos, setSaldos] = useState<SaldoDiario[]>(semanaExistente?.saldos_diarios ?? []);
  const [editSaldoIdx, setEditSaldoIdx] = useState<number | null>(null);
  const [novoSaldo, setNovoSaldo] = useState<SaldoDiario>({ data_referencia: hoje, saldo_dia: 0 });

  const [saving, setSaving] = useState(false);

  // Cálculos em tempo real
  const totalEntradas = movs.filter(m => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor), 0);
  const totalSaidas = movs.filter(m => m.tipo === "saida").reduce((s, m) => s + Number(m.valor), 0);
  const saldoIni = unmaskCurrencyInput(form.saldo_inicial);
  const saldoFinal = saldoIni + totalEntradas - totalSaidas;
  const saldoMedio = saldos.length > 0
    ? saldos.reduce((s, d) => s + Number(d.saldo_dia), 0) / saldos.length
    : (saldoIni + saldoFinal) / 2;

  // Movimentação: adicionar
  const adicionarMov = () => {
    if (!novaMov.valor || Number(novaMov.valor) <= 0) { toast.error("Informe um valor válido."); return; }
    if (!novaMov.data_movimento) { toast.error("Informe a data da movimentação."); return; }
    setMovs(prev => [...prev, { ...novaMov }]);
    setNovaMov({ data_movimento: hoje, tipo: "entrada", categoria: "", descricao: "", valor: 0 });
  };

  // Movimentação: salvar edição inline
  const salvarEdicaoMov = (idx: number, dados: Movimentacao) => {
    setMovs(prev => prev.map((m, i) => i === idx ? { ...dados } : m));
    setEditMovIdx(null);
  };

  // Movimentação: remover
  const removerMov = (idx: number) => {
    setMovs(prev => prev.filter((_, i) => i !== idx));
    if (editMovIdx === idx) setEditMovIdx(null);
  };

  // Saldo diário: adicionar/atualizar
  const adicionarSaldo = () => {
    if (!novoSaldo.data_referencia) { toast.error("Informe a data."); return; }
    const existe = saldos.findIndex(s => s.data_referencia === novoSaldo.data_referencia);
    if (existe >= 0) {
      setSaldos(prev => prev.map((s, i) => i === existe ? { ...novoSaldo } : s));
    } else {
      setSaldos(prev => [...prev, { ...novoSaldo }]);
    }
    setNovoSaldo({ data_referencia: hoje, saldo_dia: 0 });
  };

  // Saldo diário: salvar edição inline
  const salvarEdicaoSaldo = (idx: number, dados: SaldoDiario) => {
    setSaldos(prev => prev.map((s, i) => i === idx ? { ...dados } : s));
    setEditSaldoIdx(null);
  };

  // Saldo diário: remover
  const removerSaldo = (idx: number) => {
    setSaldos(prev => prev.filter((_, i) => i !== idx));
    if (editSaldoIdx === idx) setEditSaldoIdx(null);
  };

  const salvar = async () => {
    if (!form.semana_inicio || !form.semana_fim) { toast.error("Informe as datas da semana."); return; }
    if (form.semana_fim < form.semana_inicio) { toast.error("Data fim não pode ser anterior à data início."); return; }
    setSaving(true);
    try {
      const body: any = {
        empresa_id: empresaId,
        ano: form.ano,
        mes: form.mes,
        numero_semana: form.numero_semana,
        semana_inicio: form.semana_inicio,
        semana_fim: form.semana_fim,
        saldo_inicial: saldoIni,
        total_entradas: totalEntradas,
        total_saidas: totalSaidas,
        observacoes: form.observacoes || null,
        movimentacoes: movs,
        saldos_diarios: saldos,
      };
      if (semanaExistente?.id) body.id = semanaExistente.id;

      await apiFetch("/api/acompanhamento-financeiro/semana", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(semanaExistente ? "Semana atualizada com sucesso." : "Semana registrada com sucesso.");
      onSalvo();
    } catch (err: any) { toast.error(err?.message || "Erro de conexão."); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 overflow-y-auto max-h-[80vh] pr-1">

      {/* Identificação da semana */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Identificação da Semana</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Ano</Label>
            <Input type="number" value={form.ano} onChange={e => setForm(f => ({ ...f, ano: Number(e.target.value) }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={String(form.mes)} onValueChange={v => setForm(f => ({ ...f, mes: Number(v) }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nº Semana</Label>
            <Input type="number" min={1} max={6} value={form.numero_semana} onChange={e => setForm(f => ({ ...f, numero_semana: Number(e.target.value) }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Saldo Inicial (R$)</Label>
            <Input
              value={form.saldo_inicial}
              onChange={e => setForm(f => ({ ...f, saldo_inicial: maskCurrencyInput(e.target.value) }))}
              placeholder="0,00"
              inputMode="numeric"
              autoComplete="off"
              className="mt-1 text-right font-mono tabular-nums"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <Label className="text-xs">Data Início da Semana</Label>
            <Input type="date" value={form.semana_inicio} onChange={e => setForm(f => ({ ...f, semana_inicio: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Data Fim da Semana</Label>
            <Input type="date" value={form.semana_fim} onChange={e => setForm(f => ({ ...f, semana_fim: e.target.value }))} className="mt-1" />
          </div>
        </div>
      </div>

      {/* Resumo calculado em tempo real */}
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Resumo Calculado em Tempo Real</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="bg-card rounded border p-2">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-sm font-bold text-success">{moneyBR(totalEntradas)}</p>
          </div>
          <div className="bg-card rounded border p-2">
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-sm font-bold text-destructive">{moneyBR(totalSaidas)}</p>
          </div>
          <div className="bg-card rounded border p-2">
            <p className="text-xs text-muted-foreground">Saldo Final</p>
            <p className={`text-sm font-bold ${saldoFinal >= 0 ? "text-foreground" : "text-destructive"}`}>{moneyBR(saldoFinal)}</p>
          </div>
          <div className="bg-card rounded border p-2">
            <p className="text-xs text-muted-foreground">Saldo Médio</p>
            <p className="text-sm font-bold text-foreground">{moneyBR(saldoMedio)}</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Movimentações */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Movimentações (Entradas e Saídas)</h4>

        {/* Formulário de nova movimentação */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-3">
          <p className="text-xs font-medium text-primary mb-2">Adicionar Movimentação</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={novaMov.data_movimento} onChange={e => setNovaMov(m => ({ ...m, data_movimento: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={novaMov.tipo} onValueChange={v => setNovaMov(m => ({ ...m, tipo: v as "entrada" | "saida" }))}>
                <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={novaMov.valor ? formatBRLCurrency(Number(novaMov.valor)) : ""}
                onChange={e => {
                  const formatted = maskCurrencyInput(e.target.value);
                  setNovaMov(m => ({ ...m, valor: unmaskCurrencyInput(formatted) }));
                }}
                autoComplete="off"
                className="mt-1 text-sm text-right font-mono tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Input placeholder="Ex: Vendas" value={novaMov.categoria ?? ""} onChange={e => setNovaMov(m => ({ ...m, categoria: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <div className="flex gap-2 mt-1">
                <Input placeholder="Descrição da movimentação" value={novaMov.descricao ?? ""} onChange={e => setNovaMov(m => ({ ...m, descricao: e.target.value }))} className="text-sm" />
                <Button type="button" size="sm" onClick={adicionarMov} className="flex-shrink-0">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de movimentações */}
        {movs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3 border rounded">Nenhuma movimentação lançada.</p>
        ) : (
          <div className="space-y-2">
            {movs.map((m, i) => (
              <MovimentacaoItem
                key={i}
                mov={m}
                editando={editMovIdx === i}
                onEditar={() => setEditMovIdx(i)}
                onSalvar={dados => salvarEdicaoMov(i, dados)}
                onCancelar={() => setEditMovIdx(null)}
                onExcluir={() => removerMov(i)}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Saldos diários */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1">Saldos Diários <span className="text-muted-foreground font-normal">(opcional)</span></h4>
        <p className="text-xs text-muted-foreground mb-3">Quando informados, o saldo médio semanal será calculado com base nestes valores.</p>

        <div className="bg-muted border rounded-lg p-3 mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Adicionar Saldo Diário</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={novoSaldo.data_referencia} onChange={e => setNovoSaldo(s => ({ ...s, data_referencia: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Saldo do Dia (R$)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={novoSaldo.saldo_dia ? formatBRLCurrency(Number(novoSaldo.saldo_dia)) : ""}
                onChange={e => {
                  const formatted = maskCurrencyInput(e.target.value);
                  setNovoSaldo(s => ({ ...s, saldo_dia: unmaskCurrencyInput(formatted) }));
                }}
                autoComplete="off"
                className="mt-1 text-sm text-right font-mono tabular-nums"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" size="sm" variant="outline" onClick={adicionarSaldo} className="w-full sm:w-auto mt-1">
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </div>

        {saldos.length > 0 && (
          <div className="space-y-2">
            {saldos.map((s, i) => (
              <SaldoDiarioItem
                key={i}
                saldo={s}
                editando={editSaldoIdx === i}
                onEditar={() => setEditSaldoIdx(i)}
                onSalvar={dados => salvarEdicaoSaldo(i, dados)}
                onCancelar={() => setEditSaldoIdx(null)}
                onExcluir={() => removerSaldo(i)}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Observações */}
      <div>
        <Label className="text-sm font-semibold text-foreground">Observações</Label>
        <Textarea
          value={form.observacoes}
          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
          placeholder="Observações técnicas sobre o período analisado..."
          className="mt-1"
          rows={3}
        />
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
        <Button onClick={salvar} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {semanaExistente ? "Atualizar Semana" : "Registrar Semana"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Item de movimentação (com edição inline) ─────────────────────────────────

function MovimentacaoItem({
  mov,
  editando,
  onEditar,
  onSalvar,
  onCancelar,
  onExcluir,
}: {
  mov: Movimentacao;
  editando: boolean;
  onEditar: () => void;
  onSalvar: (dados: Movimentacao) => void;
  onCancelar: () => void;
  onExcluir: () => void;
}) {
  const [dados, setDados] = useState({ ...mov });

  useEffect(() => { setDados({ ...mov }); }, [mov, editando]);

  if (editando) {
    return (
      <div className="border border-primary/30 rounded-lg p-3 bg-primary/10 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={dados.data_movimento} onChange={e => setDados(d => ({ ...d, data_movimento: e.target.value }))} className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={dados.tipo} onValueChange={v => setDados(d => ({ ...d, tipo: v as "entrada" | "saida" }))}>
              <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              value={dados.valor ? formatBRLCurrency(Number(dados.valor)) : ""}
              onChange={e => {
                const formatted = maskCurrencyInput(e.target.value);
                setDados(d => ({ ...d, valor: unmaskCurrencyInput(formatted) }));
              }}
              autoComplete="off"
              className="mt-1 text-sm text-right font-mono tabular-nums"
            />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Input value={dados.categoria ?? ""} onChange={e => setDados(d => ({ ...d, categoria: e.target.value }))} className="mt-1 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Descrição</Label>
            <Input value={dados.descricao ?? ""} onChange={e => setDados(d => ({ ...d, descricao: e.target.value }))} className="mt-1 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={onCancelar}><X className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
          <Button size="sm" onClick={() => {
            if (!dados.valor || Number(dados.valor) <= 0) { toast.error("Valor inválido."); return; }
            onSalvar(dados);
          }}><Save className="h-3.5 w-3.5 mr-1" /> Salvar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-card">
      {/* Mobile: card empilhado */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-1 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Data</span>
            <span className="font-medium">{dataBR(mov.data_movimento)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Tipo</span>
            <span className={`font-semibold capitalize ${mov.tipo === "entrada" ? "text-success" : "text-destructive"}`}>
              {mov.tipo === "entrada" ? "Entrada" : "Saída"}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Descrição</span>
            <span className="text-foreground truncate block">{mov.descricao || mov.categoria || "—"}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Valor</span>
            <span className={`font-bold ${mov.tipo === "entrada" ? "text-success" : "text-destructive"}`}>{moneyBR(mov.valor)}</span>
          </div>
        </div>
        <div className="flex gap-2 sm:flex-shrink-0">
          <Button size="sm" variant="outline" onClick={onEditar} className="h-8 px-2">
            <Edit className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">Editar</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onExcluir} className="h-8 px-2 text-destructive hover:bg-destructive/10 border-destructive/20">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">Excluir</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Item de saldo diário (com edição inline) ─────────────────────────────────

function SaldoDiarioItem({
  saldo,
  editando,
  onEditar,
  onSalvar,
  onCancelar,
  onExcluir,
}: {
  saldo: SaldoDiario;
  editando: boolean;
  onEditar: () => void;
  onSalvar: (dados: SaldoDiario) => void;
  onCancelar: () => void;
  onExcluir: () => void;
}) {
  const [dados, setDados] = useState({ ...saldo });
  useEffect(() => { setDados({ ...saldo }); }, [saldo, editando]);

  if (editando) {
    return (
      <div className="border border-primary/30 rounded-lg p-3 bg-primary/10">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={dados.data_referencia} onChange={e => setDados(d => ({ ...d, data_referencia: e.target.value }))} className="mt-1 text-sm" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Saldo do Dia (R$)</Label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              value={dados.saldo_dia ? formatBRLCurrency(Number(dados.saldo_dia)) : ""}
              onChange={e => {
                const formatted = maskCurrencyInput(e.target.value);
                setDados(d => ({ ...d, saldo_dia: unmaskCurrencyInput(formatted) }));
              }}
              autoComplete="off"
              className="mt-1 text-sm text-right font-mono tabular-nums"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <Button size="sm" variant="outline" onClick={onCancelar}><X className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
          <Button size="sm" onClick={() => onSalvar(dados)}><Save className="h-3.5 w-3.5 mr-1" /> Salvar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-card flex items-center justify-between gap-2">
      <div className="flex gap-4 text-sm">
        <div>
          <span className="text-xs text-muted-foreground block">Data</span>
          <span className="font-medium">{dataBR(saldo.data_referencia)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Saldo do Dia</span>
          <span className="font-bold text-foreground">{moneyBR(saldo.saldo_dia)}</span>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button size="sm" variant="outline" onClick={onEditar} className="h-8 px-2">
          <Edit className="h-3.5 w-3.5" /><span className="ml-1 text-xs">Editar</span>
        </Button>
        <Button size="sm" variant="outline" onClick={onExcluir} className="h-8 px-2 text-destructive hover:bg-destructive/10 border-destructive/20">
          <Trash2 className="h-3.5 w-3.5" /><span className="ml-1 text-xs">Excluir</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Detalhe da semana ────────────────────────────────────────────────────────

function ImportacaoExtratoSemana({
  semana,
  onSemanaAtualizada,
}: {
  semana: SemanaFinanceira;
  onSemanaAtualizada: (semana: SemanaFinanceira) => void;
}) {
  const [linhas, setLinhas] = useState<LancamentoImportado[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregandoLinhas, setCarregandoLinhas] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const carregarLinhas = useCallback(async () => {
    setCarregandoLinhas(true);
    try {
      const data = await apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}/lancamentos-importados`);
      setLinhas(Array.isArray(data) ? data : []);
      setSelecionados(new Set());
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar os lançamentos importados.");
    } finally {
      setCarregandoLinhas(false);
    }
  }, [semana.id]);

  useEffect(() => { carregarLinhas(); }, [carregarLinhas]);

  const analisarArquivo = async () => {
    if (!arquivo) { toast.error("Selecione um extrato ou comprovante em PDF ou imagem."); return; }
    if (arquivo.size > 25 * 1024 * 1024) { toast.error("O arquivo deve ter no máximo 25 MB."); return; }
    setAnalisando(true);
    try {
      const fd = new FormData();
      fd.append("file", arquivo);
      fd.append("entidade_tipo", "acompanhamento_financeiro");
      fd.append("entidade_id", semana.id);
      fd.append("empresa_id", semana.empresa_id);
      fd.append("tipo_documento", "extrato_bancario");
      fd.append("nome_customizado", `Extrato/comprovante — ${arquivo.name}`);
      const documento = await apiFetch("/api/documentos/upload", { method: "POST", body: fd });
      await apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}/analisar-extrato`, {
        method: "POST",
        body: JSON.stringify({ arquivo_id: documento.id }),
      });
      setArquivo(null);
      toast.success("Documento analisado. Revise os lançamentos antes de aplicar.");
      await carregarLinhas();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível analisar o extrato ou comprovante.");
    } finally {
      setAnalisando(false);
    }
  };

  const atualizarLinhaLocal = (id: string, campo: keyof LancamentoImportado, valor: unknown) => {
    setLinhas((atuais) => atuais.map((linha) => linha.id === id ? { ...linha, [campo]: valor } as LancamentoImportado : linha));
  };

  const revisarLinha = async (linha: LancamentoImportado, status: LancamentoImportado["status"] = linha.status) => {
    const valor = Number(linha.valor);
    if (!linha.data_movimento || !linha.descricao?.trim() || !Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe data, descrição e valor válido antes de revisar o lançamento.");
      return;
    }
    try {
      await apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}/lancamentos-importados/${linha.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          data_movimento: String(linha.data_movimento).slice(0, 10),
          tipo: linha.tipo,
          categoria: linha.categoria || null,
          descricao: linha.descricao.trim(),
          valor,
          status,
        }),
      });
      toast.success(status === "aprovado" ? "Lançamento aprovado para aplicação." : status === "descartado" ? "Lançamento descartado." : "Lançamento revisado.");
      await carregarLinhas();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível salvar a revisão.");
    }
  };

  const aprovarSelecionados = async () => {
    const itens = linhas.filter((linha) => selecionados.has(linha.id) && linha.status === "pendente" && !linha.aplicado_em);
    if (!itens.length) { toast.error("Selecione pelo menos um lançamento pendente."); return; }
    try {
      await Promise.all(itens.map((linha) => apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}/lancamentos-importados/${linha.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "aprovado" }),
      })));
      toast.success(`${itens.length} lançamento${itens.length === 1 ? " aprovado" : "s aprovados"} para aplicação.`);
      await carregarLinhas();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível aprovar os lançamentos selecionados.");
      await carregarLinhas();
    }
  };

  const aplicarAprovados = async () => {
    const quantidade = linhas.filter((linha) => linha.status === "aprovado" && !linha.aplicado_em).length;
    if (!quantidade) { toast.error("Nenhum lançamento aprovado está aguardando aplicação."); return; }
    setAplicando(true);
    try {
      const resposta = await apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}/aplicar-lancamentos`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      onSemanaAtualizada(resposta.semana);
      toast.success(`${resposta.aplicados || 0} lançamento${Number(resposta.aplicados || 0) === 1 ? " aplicado" : "s aplicados"}. ${resposta.duplicados || 0} duplicado${Number(resposta.duplicados || 0) === 1 ? " foi ignorado" : "s foram ignorados"}.`);
      await carregarLinhas();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível aplicar os lançamentos aprovados.");
    } finally {
      setAplicando(false);
    }
  };

  const pendentes = linhas.filter((linha) => linha.status === "pendente" && !linha.aplicado_em);
  const aprovados = linhas.filter((linha) => linha.status === "aprovado" && !linha.aplicado_em);

  return (
    <div className="border border-primary/20 bg-primary/10/50 rounded-lg p-3 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-primary uppercase flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Importar extrato e comprovantes</p>
          <p className="text-xs text-primary mt-1">Anexe PDF ou imagem. A leitura ficará em revisão e não altera os lançamentos manuais até a aprovação.</p>
        </div>
        <Badge variant="secondary" className="w-fit text-xs">{pendentes.length} pendente{pendentes.length === 1 ? "" : "s"}</Badge>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Extrato ou comprovante</Label>
          <Input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="mt-1 bg-card text-xs"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            disabled={analisando}
          />
          {arquivo && <p className="text-[11px] text-muted-foreground mt-1 truncate">Selecionado: {arquivo.name}</p>}
        </div>
        <Button size="sm" onClick={analisarArquivo} disabled={!arquivo || analisando} className="sm:min-w-[140px]">
          {analisando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
          {analisando ? "Analisando..." : "Analisar documento"}
        </Button>
      </div>

      {carregandoLinhas ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando revisão...</div>
      ) : linhas.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-primary/20 pt-3">
            <p className="text-xs font-semibold text-foreground">Lançamentos extraídos para revisão</p>
            <div className="flex flex-wrap gap-2">
              {pendentes.length > 0 && <Button size="sm" variant="outline" className="h-8 text-xs bg-card" onClick={() => setSelecionados(new Set(selecionados.size === pendentes.length ? [] : pendentes.map((linha) => linha.id)))}>
                {selecionados.size === pendentes.length ? "Desmarcar pendentes" : "Selecionar pendentes"}
              </Button>}
              <Button size="sm" variant="outline" className="h-8 text-xs bg-card" onClick={aprovarSelecionados} disabled={!selecionados.size}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-success" /> Aprovar selecionados
              </Button>
              <Button size="sm" onClick={aplicarAprovados} disabled={!aprovados.length || aplicando} className="h-8 text-xs">
                {aplicando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Aplicar aprovados ({aprovados.length})
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {linhas.map((linha) => {
              const bloqueada = Boolean(linha.aplicado_em);
              return (
                <div key={linha.id} className={`border rounded-lg p-2.5 bg-card ${linha.status === "descartado" ? "opacity-60" : ""}`}>
                  <div className="flex flex-col lg:flex-row gap-2 lg:items-end">
                    <div className="flex items-center gap-2 lg:pb-1">
                      <input
                        type="checkbox"
                        checked={selecionados.has(linha.id)}
                        onChange={(e) => setSelecionados((atual) => { const novo = new Set(atual); if (e.target.checked) novo.add(linha.id); else novo.delete(linha.id); return novo; })}
                        disabled={bloqueada || linha.status !== "pendente"}
                        className="h-4 w-4 accent-blue-600"
                        aria-label={`Selecionar lançamento ${linha.descricao || linha.id}`}
                      />
                    </div>
                    <div className="w-full lg:w-32"><Label className="text-[11px]">Data</Label><Input type="date" value={String(linha.data_movimento).slice(0, 10)} onChange={(e) => atualizarLinhaLocal(linha.id, "data_movimento", e.target.value)} disabled={bloqueada} className="h-8 mt-0.5 text-xs" /></div>
                    <div className="w-full lg:w-28"><Label className="text-[11px]">Tipo</Label><select value={linha.tipo} onChange={(e) => atualizarLinhaLocal(linha.id, "tipo", e.target.value)} disabled={bloqueada} className="flex h-8 mt-0.5 w-full rounded-md border border-input bg-background px-2 text-xs"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></div>
                    <div className="w-full lg:flex-1"><Label className="text-[11px]">Descrição</Label><Input value={linha.descricao || ""} onChange={(e) => atualizarLinhaLocal(linha.id, "descricao", e.target.value)} disabled={bloqueada} className="h-8 mt-0.5 text-xs" /></div>
                    <div className="w-full lg:w-32"><Label className="text-[11px]">Valor</Label><Input type="text" inputMode="numeric" value={linha.valor ? formatBRLCurrency(Number(linha.valor)) : ""} onChange={(e) => atualizarLinhaLocal(linha.id, "valor", unmaskCurrencyInput(maskCurrencyInput(e.target.value)))} disabled={bloqueada} className="h-8 mt-0.5 text-xs text-right" /></div>
                    <div className="flex items-center gap-1 lg:pb-0.5">
                      <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${linha.status === "aprovado" ? "border-success/30 text-success" : linha.status === "descartado" ? "border-input text-muted-foreground" : "border-warning/30 text-warning"}`}>{bloqueada ? "Aplicado" : linha.status === "aprovado" ? "Aprovado" : linha.status === "descartado" ? "Descartado" : "Pendente"}</Badge>
                      {!bloqueada && linha.status !== "descartado" && <Button size="sm" variant="outline" onClick={() => revisarLinha(linha, "pendente")} className="h-8 px-2 text-xs">Salvar</Button>}
                      {!bloqueada && linha.status === "pendente" && <Button size="sm" onClick={() => revisarLinha(linha, "aprovado")} className="h-8 px-2 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovar</Button>}
                      {!bloqueada && linha.status !== "descartado" && <Button size="sm" variant="outline" onClick={() => revisarLinha(linha, "descartado")} className="h-8 px-2 text-xs text-destructive border-destructive/20"><XCircle className="h-3 w-3 mr-1" />Descartar</Button>}
                    </div>
                  </div>
                  {linha.evidencia && <p className="text-[11px] text-muted-foreground mt-2 border-t pt-1.5"><span className="font-semibold">Evidência:</span> {linha.evidencia}</p>}
                  {linha.arquivo_nome && <p className="text-[10px] text-muted-foreground mt-1">Origem: {linha.arquivo_nome}{linha.confianca !== null && linha.confianca !== undefined ? ` · confiança ${Math.round(Number(linha.confianca) * 100)}%` : ""}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground border-t border-primary/20 pt-3">Nenhum lançamento importado nesta semana. Os documentos analisados aparecerão aqui para revisão.</p>
      )}
    </div>
  );
}

// ─── Detalhe da semana ────────────────────────────────────────────────────────

function DetalheSemana({
  semana,
  onClose,
  onExportarPdf,
  onEditar,
  onSemanaAtualizada,
}: {
  semana: SemanaFinanceira;
  onClose: () => void;
  onExportarPdf: (id: string) => void;
  onEditar: (s: SemanaFinanceira) => void;
  onSemanaAtualizada: (semana: SemanaFinanceira) => void;
}) {
  const [exportando, setExportando] = useState(false);

  const handlePdf = async () => {
    setExportando(true);
    await onExportarPdf(semana.id);
    setExportando(false);
  };

  return (
    <div className="space-y-4 overflow-y-auto max-h-[80vh] pr-1">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{nomeMes(semana.mes)}/{semana.ano} — Semana {semana.numero_semana}</p>
          <p className="text-xs text-muted-foreground">{dataBR(semana.semana_inicio)} a {dataBR(semana.semana_fim)}</p>
        </div>
        <StatusBadge status={semana.status} />
      </div>

      {/* Parâmetros */}
      {(semana.faturamento_anual_declarado || 0) > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
          <p className="text-xs font-semibold text-primary uppercase mb-2">Parâmetros de Acompanhamento</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="bg-card rounded border border-primary/20 p-2 text-center">
              <p className="text-xs text-primary">Faturamento Declarado</p>
              <p className="text-sm font-bold text-primary">{moneyBR(semana.faturamento_anual_declarado)}</p>
            </div>
            <div className="bg-card rounded border border-primary/20 p-2 text-center">
              <p className="text-xs text-primary">Percentual Operacional</p>
              <p className="text-sm font-bold text-primary">{pctBR(semana.percentual_operacional)}</p>
            </div>
            <div className="bg-card rounded border border-primary/20 p-2 text-center">
              <p className="text-xs text-primary">Limite Anual</p>
              <p className="text-sm font-bold text-primary">{moneyBR(semana.limite_anual_referencia)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-card rounded border border-primary/20 p-2 text-center">
              <p className="text-xs text-primary">Limite Mensal</p>
              <p className="text-sm font-bold text-primary">{moneyBR(semana.limite_mensal_referencia)}</p>
            </div>
            <div className="bg-card rounded border border-primary/20 p-2 text-center">
              <p className="text-xs text-primary">Limite Semanal</p>
              <p className="text-sm font-bold text-primary">{moneyBR(semana.limite_semanal_referencia)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Resumo financeiro */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Resumo Financeiro da Semana</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Saldo Inicial</p>
            <p className="text-base font-bold text-foreground">{moneyBR(semana.saldo_inicial)}</p>
          </div>
          <div className="border rounded-lg p-3 text-center bg-success/10 border-success/20">
            <p className="text-xs text-success">Total de Entradas</p>
            <p className="text-base font-bold text-success">{moneyBR(semana.total_entradas)}</p>
          </div>
          <div className="border rounded-lg p-3 text-center bg-destructive/10 border-destructive/20">
            <p className="text-xs text-destructive">Total de Saídas</p>
            <p className="text-base font-bold text-destructive">{moneyBR(semana.total_saidas)}</p>
          </div>
          <div className="border rounded-lg p-3 text-center bg-muted">
            <p className="text-xs text-muted-foreground">Saldo Final</p>
            <p className="text-base font-bold text-foreground">{moneyBR(semana.saldo_final)}</p>
          </div>
          <div className="border rounded-lg p-3 text-center sm:col-span-2">
            <p className="text-xs text-muted-foreground">Saldo Médio Semanal</p>
            <p className="text-base font-bold text-foreground">{moneyBR(semana.saldo_medio)}</p>
          </div>
        </div>
      </div>

      {/* Análise de conformidade */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Análise de Conformidade</p>
        <div className="space-y-3">
          <BarraProgresso pct={semana.percentual_uso_semana} label={`Semanal — ${moneyBR(semana.total_entradas)} / ${moneyBR(semana.limite_semanal_referencia)}`} />
          <BarraProgresso pct={semana.percentual_uso_mes} label={`Mensal — ${moneyBR(semana.acumulado_mensal)} / ${moneyBR(semana.limite_mensal_referencia)}`} />
          <BarraProgresso pct={semana.percentual_uso_ano} label={`Anual — ${moneyBR(semana.acumulado_anual)} / ${moneyBR(semana.limite_anual_referencia)}`} />
        </div>
      </div>

      {/* Diagnóstico técnico */}
      {semana.diagnostico && (
        <div className="bg-muted border-l-4 border-primary/30 p-3 rounded-r">
          <p className="text-xs font-semibold text-primary uppercase mb-1">Diagnóstico Técnico</p>
          <p className="text-xs text-foreground leading-relaxed text-justify">{semana.diagnostico}</p>
        </div>
      )}

      <ImportacaoExtratoSemana semana={semana} onSemanaAtualizada={onSemanaAtualizada} />

      {/* Movimentações */}
      {semana.movimentacoes && semana.movimentacoes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Movimentações</p>
          <div className="space-y-2">
            {semana.movimentacoes.map((m, i) => (
              <div key={i} className="border rounded-lg p-3 bg-card">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Data</span>
                    <span>{dataBR(m.data_movimento)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Tipo</span>
                    <span className={`font-semibold ${m.tipo === "entrada" ? "text-success" : "text-destructive"}`}>
                      {m.tipo === "entrada" ? "Entrada" : "Saída"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Descrição</span>
                    <span className="text-foreground">{m.descricao || m.categoria || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Valor</span>
                    <span className={`font-bold ${m.tipo === "entrada" ? "text-success" : "text-destructive"}`}>{moneyBR(m.valor)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saldos diários */}
      {semana.saldos_diarios && semana.saldos_diarios.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Saldos Diários</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {semana.saldos_diarios.map((s, i) => (
              <div key={i} className="border rounded-lg p-2 bg-card text-center">
                <p className="text-xs text-muted-foreground">{dataBR(s.data_referencia)}</p>
                <p className="text-sm font-bold text-foreground">{moneyBR(s.saldo_dia)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observações */}
      {semana.observacoes && (
        <div className="bg-warning/10 border-l-4 border-warning/30 p-3 rounded-r">
          <p className="text-xs font-semibold text-warning uppercase mb-1">Observações</p>
          <p className="text-xs text-foreground leading-relaxed">{semana.observacoes}</p>
        </div>
      )}

      <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Fechar</Button>
        <Button variant="outline" onClick={() => onEditar(semana)} className="w-full sm:w-auto">
          <Edit className="h-4 w-4 mr-1" /> Editar
        </Button>
        <Button onClick={handlePdf} disabled={exportando} className="w-full sm:w-auto">
          {exportando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          Exportar PDF
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Card de semana (mobile-first) ────────────────────────────────────────────

function CardSemana({
  semana,
  onVerDetalhe,
  onEditar,
  onExcluir,
  onExportarPdf,
}: {
  semana: SemanaFinanceira;
  onVerDetalhe: (s: SemanaFinanceira) => void;
  onEditar: (s: SemanaFinanceira) => void;
  onExcluir: (s: SemanaFinanceira) => void;
  onExportarPdf: (id: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Linha principal — clicável */}
      <button
        className="w-full text-left p-4 hover:bg-muted transition-colors"
        onClick={() => setExpandido(v => !v)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                Semana {semana.numero_semana} — {nomeMes(semana.mes)}/{semana.ano}
              </span>
              <StatusBadge status={semana.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{dataBR(semana.semana_inicio)} a {dataBR(semana.semana_fim)}</p>
          </div>
          <div className="flex-shrink-0 mt-0.5">
            {expandido ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Resumo rápido */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div>
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-sm font-bold text-success">{moneyBR(semana.total_entradas)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-sm font-bold text-destructive">{moneyBR(semana.total_saidas)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo Médio</p>
            <p className="text-sm font-bold text-foreground">{moneyBR(semana.saldo_medio)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">% Semanal</p>
            <p className={`text-sm font-bold ${semana.percentual_uso_semana > 100 ? "text-destructive" : "text-foreground"}`}>{pctBR(semana.percentual_uso_semana)}</p>
          </div>
        </div>
      </button>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted">
          <div className="space-y-2">
            <BarraProgresso pct={semana.percentual_uso_semana} label="Semanal" />
            <BarraProgresso pct={semana.percentual_uso_mes} label="Mensal" />
            <BarraProgresso pct={semana.percentual_uso_ano} label="Anual" />
          </div>

          {semana.diagnostico && (
            <div className="bg-card border-l-4 border-primary/30 p-2 rounded-r text-xs text-foreground leading-relaxed">
              {semana.diagnostico}
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => onVerDetalhe(semana)} className="flex-1 sm:flex-none">
              <FileText className="h-3.5 w-3.5 mr-1" /> Detalhes / Extratos
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEditar(semana)} className="flex-1 sm:flex-none">
              <Edit className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExportarPdf(semana.id)} className="flex-1 sm:flex-none">
              <Download className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExcluir(semana)} className="flex-1 sm:flex-none text-destructive hover:bg-destructive/10 border-destructive/20">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AcompanhamentoFinanceiro() {
  const { colaborador } = useAuth();

  // Verificação de acesso
  if (!podeAcessarFinanceiro(colaborador)) {
    return (
      <ColaboradorLayout title="Acompanhamento Financeiro">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <XCircle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground max-w-sm">
            Este módulo é exclusivo para Gestores de Crédito, Diretores e Administradores.
          </p>
        </div>
      </ColaboradorLayout>
    );
  }

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  // Estado principal
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>("");
  const [buscaEmpresa, setBuscaEmpresa] = useState<string>("");
  const [config, setConfig] = useState<Config | null>(null);
  const [semanas, setSemanas] = useState<SemanaFinanceira[]>([]);
  const [filtroAno, setFiltroAno] = useState(anoAtual);
  const [filtroMes, setFiltroMes] = useState(mesAtual);
  const [carregando, setCarregando] = useState(false);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);

  // Modais
  const [modalConfig, setModalConfig] = useState(false);
  const [modalSemana, setModalSemana] = useState(false);
  const [semanaEditando, setSemanaEditando] = useState<SemanaFinanceira | null>(null);
  const [semanaDetalhe, setSemanaDetalhe] = useState<SemanaFinanceira | null>(null);
  const [semanaExcluindo, setSemanaExcluindo] = useState<SemanaFinanceira | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  // Buscar empresas por rota padronizada/autenticada.
  // Não usa o Select customizado aqui porque este módulo foi diagnosticado com
  // dropdown inconsistente em produção; o input + select nativo preserva o fluxo.
  useEffect(() => {
    let mounted = true;
    setCarregandoEmpresas(true);
    apiFetch("/api/empresas/search?limit=500&incluir_incompletos=1")
      .then(data => {
        if (!mounted) return;
        const lista: Empresa[] = Array.isArray(data) ? data : (data.empresas || data.data || []);
        setEmpresas(lista);
      })
      .catch((err: any) => {
        if (mounted) toast.error(err?.message || "Erro ao carregar empresas.");
      })
      .finally(() => { if (mounted) setCarregandoEmpresas(false); });
    return () => { mounted = false; };
  }, []);

  // Buscar config e semanas quando empresa/filtro mudar
  const carregarDados = useCallback(async () => {
    if (!empresaSelecionada) return;
    setCarregando(true);
    try {
      const [cfg, semanasData] = await Promise.all([
        apiFetch(`/api/acompanhamento-financeiro/config/${empresaSelecionada}`),
        apiFetch(`/api/acompanhamento-financeiro/semanas/${empresaSelecionada}?ano=${filtroAno}&mes=${filtroMes}`),
      ]);
      setConfig(cfg);
      setSemanas(Array.isArray(semanasData) ? semanasData : (semanasData?.data || []));
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar acompanhamento financeiro.");
      setConfig(null);
      setSemanas([]);
    }
    finally { setCarregando(false); }
  }, [empresaSelecionada, filtroAno, filtroMes]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Exportar PDF
  const exportarPdf = async (semanaId: string) => {
    setExportandoPdf(true);
    try {
      const token = getToken();
      const r = await fetch(`/api/acompanhamento-financeiro/semana/${semanaId}/exportar-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        toast.error(errBody.error || `Erro ao gerar PDF (HTTP ${r.status}).`);
        return;
      }
      const data = await r.json();
      if (data.url) {
        const a = document.createElement("a");
        a.href = data.url;
        a.target = "_blank";
        a.download = data.filename || "relatorio-financeiro.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("PDF gerado com sucesso.");
      }
    } catch { toast.error("Erro ao gerar PDF."); }
    finally { setExportandoPdf(false); }
  };

  // Excluir semana
  const confirmarExclusao = async () => {
    if (!semanaExcluindo) return;
    setExcluindo(true);
    try {
      await apiFetch(`/api/acompanhamento-financeiro/semana/${semanaExcluindo.id}`, { method: "DELETE" });
      toast.success("Semana excluída com sucesso.");
      setSemanaExcluindo(null);
      carregarDados();
    } catch (err: any) { toast.error(err?.message || "Erro de conexão."); }
    finally { setExcluindo(false); }
  };

  // Abrir edição de semana (busca detalhe completo)
  const abrirEdicao = async (semana: SemanaFinanceira) => {
    try {
      setSemanaEditando(await apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}`));
    } catch {
      setSemanaEditando(semana);
    }
    setModalSemana(true);
    setSemanaDetalhe(null);
  };

  // Abrir detalhe completo
  const abrirDetalhe = async (semana: SemanaFinanceira) => {
    try {
      setSemanaDetalhe(await apiFetch(`/api/acompanhamento-financeiro/semana/${semana.id}`));
    } catch { setSemanaDetalhe(semana); }
  };

  // Empresa selecionada
  const termoEmpresa = buscaEmpresa.trim().toLowerCase();
  const empresasFiltradas = termoEmpresa
    ? empresas.filter((e) => `${e.razao_social || ""} ${e.cnpj || ""}`.toLowerCase().includes(termoEmpresa))
    : empresas;
  const empresaAtual = empresas.find(e => e.id === empresaSelecionada);

  // Totais do período
  const totalEntradasPeriodo = semanas.reduce((s, w) => s + (w.total_entradas || 0), 0);
  const totalSaidasPeriodo = semanas.reduce((s, w) => s + (w.total_saidas || 0), 0);
  const limiteMensalRef = semanas[0]?.limite_mensal_referencia || 0;
  const pctMensalPeriodo = limiteMensalRef > 0 ? (totalEntradasPeriodo / limiteMensalRef) * 100 : 0;

  return (
    <ColaboradorLayout title="Acompanhamento Financeiro Semanal">
      <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary flex-shrink-0" />
              Acompanhamento Financeiro Semanal
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Controle de coerência financeira com base no faturamento declarado
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={carregarDados}
              disabled={carregando}
              className="flex-shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${carregando ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Seleção de empresa */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Empresa</Label>
                {carregandoEmpresas ? (
                  <div className="flex items-center gap-2 mt-1 h-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                ) : (
                  <div className="mt-1 space-y-2">
                    <Input
                      value={buscaEmpresa}
                      onChange={(e) => setBuscaEmpresa(e.target.value)}
                      placeholder="Buscar por razão social ou CNPJ..."
                      className="h-9"
                    />
                    <select
                      value={empresaSelecionada}
                      onChange={(e) => setEmpresaSelecionada(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="">Selecione uma empresa</option>
                      {empresasFiltradas.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ""}
                        </option>
                      ))}
                    </select>
                    {!empresasFiltradas.length && (
                      <p className="text-xs text-warning">Nenhuma empresa encontrada para esta busca.</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Mês</Label>
                <Select value={String(filtroMes)} onValueChange={v => setFiltroMes(Number(v))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Ano</Label>
                <Input
                  type="number"
                  value={filtroAno}
                  onChange={e => setFiltroAno(Number(e.target.value))}
                  className="mt-1"
                  min={2020}
                  max={2099}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {empresaSelecionada && (
          <>
            {/* Painel de configuração */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Configuração de Acompanhamento</span>
                      {config?.configurado && (
                        <Badge variant="secondary" className="text-xs">Configurado</Badge>
                      )}
                    </div>

                    {config?.configurado ? (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div className="bg-muted rounded border p-2 text-center">
                          <p className="text-xs text-muted-foreground">Fat. Anual Declarado</p>
                          <p className="text-sm font-bold text-foreground">{moneyBR(config.faturamento_anual_declarado)}</p>
                        </div>
                        <div className="bg-muted rounded border p-2 text-center">
                          <p className="text-xs text-muted-foreground">% Operacional</p>
                          <p className="text-sm font-bold text-foreground">{pctBR(config.percentual_operacional)}</p>
                        </div>
                        <div className="bg-primary/10 rounded border border-primary/20 p-2 text-center">
                          <p className="text-xs text-primary">Limite Anual</p>
                          <p className="text-sm font-bold text-primary">{moneyBR(config.limite_anual)}</p>
                        </div>
                        <div className="bg-primary/10 rounded border border-primary/20 p-2 text-center">
                          <p className="text-xs text-primary">Limite Mensal</p>
                          <p className="text-sm font-bold text-primary">
                            {moneyBR((config.limite_anual || 0) / 12)}
                          </p>
                        </div>
                        <div className="bg-primary/10 rounded border border-primary/20 p-2 text-center">
                          <p className="text-xs text-primary">Limite Semanal*</p>
                          <p className="text-sm font-bold text-primary">
                            {semanas[0] ? moneyBR(semanas[0].limite_semanal_referencia) : "—"}
                          </p>
                          <p className="text-xs text-primary">*do mês atual</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg p-3">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span>Nenhuma configuração encontrada. Configure o faturamento anual para habilitar os cálculos.</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModalConfig(true)}
                    className="flex-shrink-0 self-start"
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    {config?.configurado ? "Editar" : "Configurar"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Resumo do período */}
            {semanas.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border rounded-lg p-3 bg-card text-center">
                  <p className="text-xs text-muted-foreground">Semanas no Período</p>
                  <p className="text-2xl font-bold text-foreground">{semanas.length}</p>
                </div>
                <div className="border rounded-lg p-3 bg-success/10 border-success/20 text-center">
                  <p className="text-xs text-success">Total de Entradas</p>
                  <p className="text-base font-bold text-success">{moneyBR(totalEntradasPeriodo)}</p>
                </div>
                <div className="border rounded-lg p-3 bg-destructive/10 border-destructive/20 text-center">
                  <p className="text-xs text-destructive">Total de Saídas</p>
                  <p className="text-base font-bold text-destructive">{moneyBR(totalSaidasPeriodo)}</p>
                </div>
                <div className="border rounded-lg p-3 bg-primary/10 border-primary/20 text-center">
                  <p className="text-xs text-primary">% Uso Mensal</p>
                  <p className={`text-base font-bold ${pctMensalPeriodo > 100 ? "text-destructive" : "text-primary"}`}>{pctBR(pctMensalPeriodo)}</p>
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Semanas de {nomeMes(filtroMes)}/{filtroAno}
                {semanas.length > 0 && <span className="text-muted-foreground font-normal ml-1">({semanas.length} registro{semanas.length !== 1 ? "s" : ""})</span>}
              </h2>
              <Button
                size="sm"
                onClick={() => { setSemanaEditando(null); setModalSemana(true); }}
                disabled={!config?.configurado}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-1" /> Nova Semana
              </Button>
            </div>

            {/* Lista de semanas */}
            {carregando ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : semanas.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm font-medium">Nenhuma semana registrada</p>
                <p className="text-muted-foreground text-xs mt-1">
                  {config?.configurado
                    ? "Clique em \"Nova Semana\" para começar o acompanhamento."
                    : "Configure o faturamento anual primeiro."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {semanas.map(semana => (
                  <CardSemana
                    key={semana.id}
                    semana={semana}
                    onVerDetalhe={abrirDetalhe}
                    onEditar={abrirEdicao}
                    onExcluir={s => setSemanaExcluindo(s)}
                    onExportarPdf={exportarPdf}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {!empresaSelecionada && !carregandoEmpresas && (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">Selecione uma empresa para iniciar o acompanhamento.</p>
          </div>
        )}
      </div>

      {/* Modal: Configuração */}
      <Dialog open={modalConfig} onOpenChange={v => !v && setModalConfig(false)}>
        <DialogContent className="max-w-lg w-full mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Configuração de Acompanhamento
            </DialogTitle>
          </DialogHeader>
          {empresaSelecionada && config !== null && (
            <FormConfig
              empresaId={empresaSelecionada}
              config={config}
              user={colaborador}
              onSalvo={() => { setModalConfig(false); carregarDados(); }}
              onClose={() => setModalConfig(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Semana (criar/editar) */}
      <Dialog open={modalSemana} onOpenChange={v => { if (!v) { setModalSemana(false); setSemanaEditando(null); } }}>
        <DialogContent className="max-w-2xl w-full mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {semanaEditando ? "Editar Semana" : "Registrar Nova Semana"}
            </DialogTitle>
          </DialogHeader>
          {empresaSelecionada && (
            <FormSemana
              empresaId={empresaSelecionada}
              semanaExistente={semanaEditando}
              onSalvo={() => { setModalSemana(false); setSemanaEditando(null); carregarDados(); }}
              onClose={() => { setModalSemana(false); setSemanaEditando(null); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhe */}
      <Dialog open={!!semanaDetalhe} onOpenChange={v => !v && setSemanaDetalhe(null)}>
        <DialogContent className="max-w-2xl w-full mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Detalhe do Acompanhamento Semanal
            </DialogTitle>
          </DialogHeader>
          {semanaDetalhe && (
            <DetalheSemana
              semana={semanaDetalhe}
              onClose={() => setSemanaDetalhe(null)}
              onExportarPdf={exportarPdf}
              onEditar={s => { setSemanaDetalhe(null); abrirEdicao(s); }}
              onSemanaAtualizada={(atualizada) => {
                setSemanaDetalhe(atualizada);
                setSemanas((atuais) => atuais.map((item) => item.id === atualizada.id ? { ...item, ...atualizada } : item));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmação de exclusão */}
      <ModalConfirmacao
        aberto={!!semanaExcluindo}
        mensagem={`Deseja excluir o acompanhamento da Semana ${semanaExcluindo?.numero_semana} de ${semanaExcluindo ? nomeMes(semanaExcluindo.mes) : ""}/${semanaExcluindo?.ano}? Esta ação não pode ser desfeita.`}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setSemanaExcluindo(null)}
        carregando={excluindo}
      />
    </ColaboradorLayout>
  );
}
