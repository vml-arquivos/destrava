import { useState, useEffect, useCallback } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Search,
  FileText,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit,
  Download,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Empresa = {
  id: string;
  razao_social: string;
  cnpj?: string;
};

type Config = {
  configurado: boolean;
  empresa_id?: string;
  faturamento_anual_declarado?: number;
  percentual_operacional?: number;
  limite_anual?: number;
  faturamento_anual_empresa?: number;
  percentual_operacional_padrao?: number;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    "gestor_credito","gestor_de_credito","gestor de credito",
  ]);
  return (
    permitidos.has(normalizarCargo(user?.cargo)) ||
    permitidos.has(normalizarCargo(user?.perfil))
  );
}

// ─── Configuração de status ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  dentro_da_referencia: {
    label: "Dentro da Referência",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  },
  atencao_leve: {
    label: "Atenção Leve",
    color: "text-yellow-700",
    bg: "bg-yellow-50 border-yellow-200",
    icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  },
  atencao_media: {
    label: "Atenção Média",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  },
  incompativel: {
    label: "Incompatível",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: <XCircle className="h-4 w-4 text-red-600" />,
  },
  critico: {
    label: "Crítico",
    color: "text-red-900",
    bg: "bg-red-100 border-red-300",
    icon: <XCircle className="h-4 w-4 text-red-800" />,
  },
  sem_documentacao: {
    label: "Sem Documentação",
    color: "text-gray-700",
    bg: "bg-gray-50 border-gray-200",
    icon: <Clock className="h-4 w-4 text-gray-500" />,
  },
  aguardando_atualizacao: {
    label: "Aguardando Atualização",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    icon: <Clock className="h-4 w-4 text-blue-500" />,
  },
  regularizado: {
    label: "Regularizado",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    color: "text-gray-700",
    bg: "bg-gray-50 border-gray-200",
    icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Formulário de configuração ───────────────────────────────────────────────

function FormConfig({
  empresaId,
  config,
  onSalvo,
  onClose,
}: {
  empresaId: string;
  config: Config;
  onSalvo: () => void;
  onClose: () => void;
}) {
  const [fat, setFat] = useState(
    String(config.faturamento_anual_declarado || config.faturamento_anual_empresa || "")
  );
  const [pct, setPct] = useState(
    String(config.percentual_operacional || config.percentual_operacional_padrao || 30)
  );
  const [saving, setSaving] = useState(false);
  const [limites, setLimites] = useState<{ limite_anual: number; limite_mensal: number; limite_semanal: number } | null>(null);

  const calcularPreview = useCallback(async () => {
    const f = parseFloat(fat.replace(/\./g, "").replace(",", "."));
    const p = parseFloat(pct.replace(",", "."));
    if (!isFinite(f) || f <= 0 || !isFinite(p) || p <= 0) { setLimites(null); return; }
    try {
      const r = await fetch("/api/acompanhamento-financeiro/calcular-limites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faturamento_anual_declarado: f,
          percentual_operacional: p,
          ano: new Date().getFullYear(),
          mes: new Date().getMonth() + 1,
        }),
      });
      if (r.ok) setLimites(await r.json());
    } catch {}
  }, [fat, pct]);

  useEffect(() => { calcularPreview(); }, [calcularPreview]);

  const salvar = async () => {
    const f = parseFloat(fat.replace(/\./g, "").replace(",", "."));
    const p = parseFloat(pct.replace(",", "."));
    if (!isFinite(f) || f < 0) { toast.error("Faturamento anual inválido."); return; }
    if (!isFinite(p) || p <= 0 || p > 100) { toast.error("Percentual deve estar entre 0,01 e 100."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/acompanhamento-financeiro/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, faturamento_anual_declarado: f, percentual_operacional: p }),
      });
      if (!r.ok) { const e = await r.json(); toast.error(e.error || "Erro ao salvar."); return; }
      toast.success("Configuração salva com sucesso.");
      onSalvo();
    } catch { toast.error("Erro de conexão."); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Faturamento Anual Declarado (R$)</Label>
          <Input
            value={fat}
            onChange={e => setFat(e.target.value)}
            placeholder="Ex: 100000,00"
            className="mt-1"
          />
        </div>
        <div>
          <Label>Percentual Operacional (%)</Label>
          <Input
            value={pct}
            onChange={e => setPct(e.target.value)}
            placeholder="30"
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">Padrão: 30%</p>
        </div>
      </div>
      {limites && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xs text-blue-600 font-medium uppercase">Limite Anual</p>
            <p className="text-sm font-bold text-blue-800">{moneyBR(limites.limite_anual)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-blue-600 font-medium uppercase">Limite Mensal</p>
            <p className="text-sm font-bold text-blue-800">{moneyBR(limites.limite_mensal)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-blue-600 font-medium uppercase">Limite Semanal</p>
            <p className="text-sm font-bold text-blue-800">{moneyBR(limites.limite_semanal)}</p>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configuração
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Formulário de semana ─────────────────────────────────────────────────────

const SEMANA_VAZIA = {
  ano: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
  numero_semana: 1,
  semana_inicio: isoDate(new Date()),
  semana_fim: isoDate(new Date()),
  saldo_inicial: "",
  total_entradas: "",
  total_saidas: "",
  observacoes: "",
  saldos_diarios: [] as SaldoDiario[],
  movimentacoes: [] as Movimentacao[],
};

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
  const [form, setForm] = useState({
    ...SEMANA_VAZIA,
    ...(semanaExistente
      ? {
          ano: semanaExistente.ano,
          mes: semanaExistente.mes,
          numero_semana: semanaExistente.numero_semana,
          semana_inicio: semanaExistente.semana_inicio?.slice(0, 10) || isoDate(new Date()),
          semana_fim: semanaExistente.semana_fim?.slice(0, 10) || isoDate(new Date()),
          saldo_inicial: String(semanaExistente.saldo_inicial ?? ""),
          total_entradas: String(semanaExistente.total_entradas ?? ""),
          total_saidas: String(semanaExistente.total_saidas ?? ""),
          observacoes: semanaExistente.observacoes || "",
          saldos_diarios: semanaExistente.saldos_diarios || [],
          movimentacoes: semanaExistente.movimentacoes || [],
        }
      : {}),
  });
  const [saving, setSaving] = useState(false);
  const [novaMovimentacao, setNovaMovimentacao] = useState<Movimentacao>({
    data_movimento: isoDate(new Date()),
    tipo: "entrada",
    categoria: "",
    descricao: "",
    valor: 0,
  });
  const [novoSaldo, setNovoSaldo] = useState<SaldoDiario>({
    data_referencia: isoDate(new Date()),
    saldo_dia: 0,
  });

  const addMovimentacao = () => {
    if (!novaMovimentacao.valor || Number(novaMovimentacao.valor) <= 0) {
      toast.error("Informe um valor válido para a movimentação.");
      return;
    }
    setForm(f => ({ ...f, movimentacoes: [...f.movimentacoes, { ...novaMovimentacao }] }));
    setNovaMovimentacao({ data_movimento: isoDate(new Date()), tipo: "entrada", categoria: "", descricao: "", valor: 0 });
  };

  const removeMovimentacao = (idx: number) => {
    setForm(f => ({ ...f, movimentacoes: f.movimentacoes.filter((_, i) => i !== idx) }));
  };

  const addSaldo = () => {
    if (!form.saldos_diarios.find(s => s.data_referencia === novoSaldo.data_referencia)) {
      setForm(f => ({ ...f, saldos_diarios: [...f.saldos_diarios, { ...novoSaldo }] }));
    } else {
      setForm(f => ({
        ...f,
        saldos_diarios: f.saldos_diarios.map(s =>
          s.data_referencia === novoSaldo.data_referencia ? { ...novoSaldo } : s
        ),
      }));
    }
    setNovoSaldo({ data_referencia: isoDate(new Date()), saldo_dia: 0 });
  };

  const removeSaldo = (idx: number) => {
    setForm(f => ({ ...f, saldos_diarios: f.saldos_diarios.filter((_, i) => i !== idx) }));
  };

  const salvar = async () => {
    const entradas = parseFloat(String(form.total_entradas).replace(/\./g, "").replace(",", ".")) || 0;
    const saidas = parseFloat(String(form.total_saidas).replace(/\./g, "").replace(",", ".")) || 0;
    const saldoIni = parseFloat(String(form.saldo_inicial).replace(/\./g, "").replace(",", ".")) || 0;

    if (!form.semana_inicio || !form.semana_fim) { toast.error("Informe as datas de início e fim da semana."); return; }
    if (form.semana_fim < form.semana_inicio) { toast.error("Data de fim não pode ser anterior à data de início."); return; }
    if (entradas < 0) { toast.error("Total de entradas não pode ser negativo."); return; }
    if (saidas < 0) { toast.error("Total de saídas não pode ser negativo."); return; }

    setSaving(true);
    try {
      const r = await fetch("/api/acompanhamento-financeiro/semana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          ano: form.ano,
          mes: form.mes,
          numero_semana: form.numero_semana,
          semana_inicio: form.semana_inicio,
          semana_fim: form.semana_fim,
          saldo_inicial: saldoIni,
          total_entradas: entradas,
          total_saidas: saidas,
          observacoes: form.observacoes || null,
          saldos_diarios: form.saldos_diarios,
          movimentacoes: form.movimentacoes,
        }),
      });
      if (!r.ok) { const e = await r.json(); toast.error(e.error || "Erro ao salvar."); return; }
      toast.success("Semana salva com sucesso.");
      onSalvo();
    } catch { toast.error("Erro de conexão."); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {/* Período */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Período de Referência</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ano</Label>
            <Input type="number" value={form.ano} onChange={e => setForm(f => ({ ...f, ano: Number(e.target.value) }))} className="mt-1" />
          </div>
          <div>
            <Label>Mês</Label>
            <Select value={String(form.mes)} onValueChange={v => setForm(f => ({ ...f, mes: Number(v) }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Número da Semana no Mês</Label>
            <Select value={String(form.numero_semana)} onValueChange={v => setForm(f => ({ ...f, numero_semana: Number(v) }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>Semana {n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <Label>Data Início da Semana</Label>
            <Input type="date" value={form.semana_inicio} onChange={e => setForm(f => ({ ...f, semana_inicio: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>Data Fim da Semana</Label>
            <Input type="date" value={form.semana_fim} onChange={e => setForm(f => ({ ...f, semana_fim: e.target.value }))} className="mt-1" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Valores */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Movimentação da Semana</h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Saldo Inicial (R$)</Label>
            <Input value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} placeholder="0,00" className="mt-1" />
          </div>
          <div>
            <Label>Total de Entradas (R$)</Label>
            <Input value={form.total_entradas} onChange={e => setForm(f => ({ ...f, total_entradas: e.target.value }))} placeholder="0,00" className="mt-1" />
          </div>
          <div>
            <Label>Total de Saídas (R$)</Label>
            <Input value={form.total_saidas} onChange={e => setForm(f => ({ ...f, total_saidas: e.target.value }))} placeholder="0,00" className="mt-1" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Saldos diários */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Saldos Diários (opcional)</h4>
        <div className="flex gap-2 mb-2">
          <Input type="date" value={novoSaldo.data_referencia} onChange={e => setNovoSaldo(s => ({ ...s, data_referencia: e.target.value }))} className="flex-1" />
          <Input type="number" placeholder="Saldo do dia" value={novoSaldo.saldo_dia || ""} onChange={e => setNovoSaldo(s => ({ ...s, saldo_dia: Number(e.target.value) }))} className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={addSaldo}>Adicionar</Button>
        </div>
        {form.saldos_diarios.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Data</th><th className="text-right p-2">Saldo</th><th className="p-2"></th></tr></thead>
              <tbody>
                {form.saldos_diarios.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{dataBR(s.data_referencia)}</td>
                    <td className="p-2 text-right">{moneyBR(s.saldo_dia)}</td>
                    <td className="p-2 text-center"><button onClick={() => removeSaldo(i)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Separator />

      {/* Movimentações */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Movimentações Detalhadas (opcional)</h4>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Input type="date" value={novaMovimentacao.data_movimento} onChange={e => setNovaMovimentacao(m => ({ ...m, data_movimento: e.target.value }))} />
          <Select value={novaMovimentacao.tipo} onValueChange={v => setNovaMovimentacao(m => ({ ...m, tipo: v as "entrada" | "saida" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Categoria" value={novaMovimentacao.categoria} onChange={e => setNovaMovimentacao(m => ({ ...m, categoria: e.target.value }))} />
          <Input placeholder="Descrição" value={novaMovimentacao.descricao} onChange={e => setNovaMovimentacao(m => ({ ...m, descricao: e.target.value }))} />
          <Input type="number" placeholder="Valor (R$)" value={novaMovimentacao.valor || ""} onChange={e => setNovaMovimentacao(m => ({ ...m, valor: Number(e.target.value) }))} />
          <Button type="button" variant="outline" size="sm" onClick={addMovimentacao}>Adicionar</Button>
        </div>
        {form.movimentacoes.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Data</th><th className="text-left p-2">Tipo</th><th className="text-left p-2">Descrição</th><th className="text-right p-2">Valor</th><th className="p-2"></th></tr></thead>
              <tbody>
                {form.movimentacoes.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{dataBR(m.data_movimento)}</td>
                    <td className="p-2 capitalize">{m.tipo}</td>
                    <td className="p-2">{m.descricao || m.categoria || "—"}</td>
                    <td className={`p-2 text-right font-medium ${m.tipo === "entrada" ? "text-green-700" : "text-red-700"}`}>{moneyBR(m.valor)}</td>
                    <td className="p-2 text-center"><button onClick={() => removeMovimentacao(i)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Separator />

      {/* Observações */}
      <div>
        <Label>Observações</Label>
        <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Observações técnicas sobre a semana..." className="mt-1" rows={3} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {semanaExistente ? "Atualizar Semana" : "Registrar Semana"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Detalhe da semana ────────────────────────────────────────────────────────

function DetalheSemana({
  semana,
  onClose,
  onExportarPdf,
  onEditar,
}: {
  semana: SemanaFinanceira;
  onClose: () => void;
  onExportarPdf: (id: string) => void;
  onEditar: (s: SemanaFinanceira) => void;
}) {
  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{nomeMes(semana.mes)}/{semana.ano} — Semana {semana.numero_semana}</p>
          <p className="text-xs text-gray-400">{dataBR(semana.semana_inicio)} a {dataBR(semana.semana_fim)}</p>
        </div>
        <StatusBadge status={semana.status} />
      </div>

      {/* Parâmetros */}
      {(semana.faturamento_anual_declarado || 0) > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Parâmetros de Acompanhamento</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-blue-500">Faturamento Declarado</p><p className="text-sm font-bold text-blue-800">{moneyBR(semana.faturamento_anual_declarado)}</p></div>
            <div><p className="text-xs text-blue-500">Percentual Operacional</p><p className="text-sm font-bold text-blue-800">{pctBR(semana.percentual_operacional)}</p></div>
            <div><p className="text-xs text-blue-500">Limite Anual</p><p className="text-sm font-bold text-blue-800">{moneyBR(semana.limite_anual_referencia)}</p></div>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <p className="text-xs text-gray-500">Saldo Inicial</p>
          <p className="text-base font-bold">{moneyBR(semana.saldo_inicial)}</p>
        </Card>
        <Card className="p-3 bg-green-50">
          <p className="text-xs text-green-600">Total de Entradas</p>
          <p className="text-base font-bold text-green-700">{moneyBR(semana.total_entradas)}</p>
        </Card>
        <Card className="p-3 bg-red-50">
          <p className="text-xs text-red-600">Total de Saídas</p>
          <p className="text-base font-bold text-red-700">{moneyBR(semana.total_saidas)}</p>
        </Card>
        <Card className="p-3 bg-gray-50">
          <p className="text-xs text-gray-500">Saldo Final</p>
          <p className="text-base font-bold">{moneyBR(semana.saldo_final)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">Saldo Médio Semanal</p>
          <p className="text-base font-bold">{moneyBR(semana.saldo_medio)}</p>
        </Card>
      </div>

      {/* Conformidade */}
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Análise de Conformidade</p>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Indicador</th>
                <th className="text-right p-2">Acumulado</th>
                <th className="text-right p-2">Limite</th>
                <th className="text-right p-2">% Uso</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">Semanal</td>
                <td className="p-2 text-right">{moneyBR(semana.total_entradas)}</td>
                <td className="p-2 text-right">{moneyBR(semana.limite_semanal_referencia)}</td>
                <td className={`p-2 text-right font-semibold ${semana.percentual_uso_semana > 100 ? "text-red-600" : "text-green-600"}`}>{pctBR(semana.percentual_uso_semana)}</td>
              </tr>
              <tr className="border-t bg-blue-50">
                <td className="p-2 font-medium">Mensal</td>
                <td className="p-2 text-right">{moneyBR(semana.acumulado_mensal)}</td>
                <td className="p-2 text-right">{moneyBR(semana.limite_mensal_referencia)}</td>
                <td className={`p-2 text-right font-semibold ${semana.percentual_uso_mes > 100 ? "text-red-600" : "text-green-600"}`}>{pctBR(semana.percentual_uso_mes)}</td>
              </tr>
              <tr className="border-t">
                <td className="p-2">Anual</td>
                <td className="p-2 text-right">{moneyBR(semana.acumulado_anual)}</td>
                <td className="p-2 text-right">{moneyBR(semana.limite_anual_referencia)}</td>
                <td className={`p-2 text-right font-semibold ${semana.percentual_uso_ano > 100 ? "text-red-600" : "text-green-600"}`}>{pctBR(semana.percentual_uso_ano)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Diagnóstico */}
      {semana.diagnostico && (
        <div className="bg-slate-50 border-l-4 border-blue-600 p-3 rounded-r">
          <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Diagnóstico Técnico</p>
          <p className="text-xs text-gray-700 leading-relaxed">{semana.diagnostico}</p>
        </div>
      )}

      {/* Movimentações */}
      {semana.movimentacoes && semana.movimentacoes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Movimentações</p>
          <div className="border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Data</th><th className="text-left p-2">Tipo</th><th className="text-left p-2">Descrição</th><th className="text-right p-2">Valor</th></tr></thead>
              <tbody>
                {semana.movimentacoes.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{dataBR(m.data_movimento)}</td>
                    <td className="p-2 capitalize">{m.tipo}</td>
                    <td className="p-2">{m.descricao || m.categoria || "—"}</td>
                    <td className={`p-2 text-right font-medium ${m.tipo === "entrada" ? "text-green-700" : "text-red-700"}`}>{moneyBR(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saldos diários */}
      {semana.saldos_diarios && semana.saldos_diarios.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Saldos Diários</p>
          <div className="border rounded overflow-hidden max-w-xs">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Data</th><th className="text-right p-2">Saldo</th></tr></thead>
              <tbody>
                {semana.saldos_diarios.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{dataBR(s.data_referencia)}</td>
                    <td className="p-2 text-right">{moneyBR(s.saldo_dia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Observações */}
      {semana.observacoes && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-r">
          <p className="text-xs font-semibold text-yellow-700 uppercase mb-1">Observações</p>
          <p className="text-xs text-gray-700">{semana.observacoes}</p>
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        <Button variant="outline" onClick={() => onEditar(semana)}>
          <Edit className="h-4 w-4 mr-1" /> Editar
        </Button>
        <Button onClick={() => onExportarPdf(semana.id)}>
          <Download className="h-4 w-4 mr-1" /> Exportar PDF
        </Button>
      </DialogFooter>
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
          <XCircle className="h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Restrito</h2>
          <p className="text-gray-500 max-w-md">
            O módulo de Acompanhamento Financeiro Semanal é restrito a{" "}
            <strong>Gestor de Crédito</strong>, <strong>Diretor</strong> e{" "}
            <strong>Administrador</strong>.
          </p>
        </div>
      </ColaboradorLayout>
    );
  }

  // Estado principal
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [semanas, setSemanas] = useState<SemanaFinanceira[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchEmpresa, setSearchEmpresa] = useState("");
  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState("");

  // Modais
  const [configOpen, setConfigOpen] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [editandoSemana, setEditandoSemana] = useState<SemanaFinanceira | null>(null);
  const [detalheSemana, setDetalheSemana] = useState<SemanaFinanceira | null>(null);
  const [exportandoPdf, setExportandoPdf] = useState<string | null>(null);

  // Buscar empresas
  useEffect(() => {
    fetch("/api/empresas?limit=200")
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmpresas(Array.isArray(data) ? data : data.empresas || data.rows || []))
      .catch(() => {});
  }, []);

  const empresasFiltradas = empresas.filter(e =>
    e.razao_social?.toLowerCase().includes(searchEmpresa.toLowerCase()) ||
    e.cnpj?.includes(searchEmpresa)
  );

  const selecionarEmpresa = async (empresa: Empresa) => {
    setEmpresaSelecionada(empresa);
    setConfig(null);
    setSemanas([]);
    setLoading(true);
    try {
      const [cfgRes, semRes] = await Promise.all([
        fetch(`/api/acompanhamento-financeiro/config/${empresa.id}`),
        fetch(`/api/acompanhamento-financeiro/semanas/${empresa.id}?ano=${filtroAno}${filtroMes ? `&mes=${filtroMes}` : ""}`),
      ]);
      if (cfgRes.ok) setConfig(await cfgRes.json());
      if (semRes.ok) setSemanas(await semRes.json());
    } catch {}
    finally { setLoading(false); }
  };

  const recarregarSemanas = async () => {
    if (!empresaSelecionada) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/acompanhamento-financeiro/semanas/${empresaSelecionada.id}?ano=${filtroAno}${filtroMes ? `&mes=${filtroMes}` : ""}`);
      if (r.ok) setSemanas(await r.json());
    } catch {}
    finally { setLoading(false); }
  };

  const recarregarConfig = async () => {
    if (!empresaSelecionada) return;
    const r = await fetch(`/api/acompanhamento-financeiro/config/${empresaSelecionada.id}`);
    if (r.ok) setConfig(await r.json());
  };

  const exportarPdf = async (id: string) => {
    setExportandoPdf(id);
    try {
      const r = await fetch(`/api/acompanhamento-financeiro/semana/${id}/exportar-pdf`, { method: "POST" });
      if (!r.ok) { toast.error("Erro ao gerar PDF."); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-financeiro-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso.");
    } catch { toast.error("Erro ao exportar PDF."); }
    finally { setExportandoPdf(null); }
  };

  const verDetalhe = async (semana: SemanaFinanceira) => {
    try {
      const r = await fetch(`/api/acompanhamento-financeiro/semana/${semana.id}`);
      if (r.ok) setDetalheSemana(await r.json());
      else setDetalheSemana(semana);
    } catch { setDetalheSemana(semana); }
  };

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 2 + i);

  return (
    <ColaboradorLayout title="Acompanhamento Financeiro Semanal">
      <div className="p-4 md:p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Acompanhamento Financeiro Semanal</h1>
            <p className="text-sm text-gray-500">Controle de coerência financeira com base no faturamento anual declarado</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Painel esquerdo: seleção de empresa */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700">Selecionar Empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar empresa..."
                    value={searchEmpresa}
                    onChange={e => setSearchEmpresa(e.target.value)}
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {empresasFiltradas.slice(0, 50).map(e => (
                    <button
                      key={e.id}
                      onClick={() => selecionarEmpresa(e)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        empresaSelecionada?.id === e.id
                          ? "bg-blue-600 text-white"
                          : "hover:bg-gray-100 text-gray-700"
                      }`}
                    >
                      <p className="font-medium truncate">{e.razao_social}</p>
                      {e.cnpj && <p className={`text-xs ${empresaSelecionada?.id === e.id ? "text-blue-200" : "text-gray-400"}`}>{e.cnpj}</p>}
                    </button>
                  ))}
                  {empresasFiltradas.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhuma empresa encontrada.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Painel direito: conteúdo */}
          <div className="lg:col-span-2 space-y-4">
            {!empresaSelecionada ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
                <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Selecione uma empresa para visualizar o acompanhamento financeiro.</p>
              </div>
            ) : (
              <>
                {/* Card de configuração */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-700">
                        Configuração — {empresaSelecionada.razao_social}
                      </CardTitle>
                      <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
                        <Settings className="h-4 w-4 mr-1" />
                        {config?.configurado ? "Editar" : "Configurar"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {config?.configurado ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center bg-gray-50 rounded p-2">
                          <p className="text-xs text-gray-500">Faturamento Declarado</p>
                          <p className="text-sm font-bold text-gray-800">{moneyBR(config.faturamento_anual_declarado)}</p>
                        </div>
                        <div className="text-center bg-blue-50 rounded p-2">
                          <p className="text-xs text-blue-600">Percentual Operacional</p>
                          <p className="text-sm font-bold text-blue-800">{pctBR(config.percentual_operacional)}</p>
                        </div>
                        <div className="text-center bg-green-50 rounded p-2">
                          <p className="text-xs text-green-600">Limite Anual</p>
                          <p className="text-sm font-bold text-green-800">{moneyBR(config.limite_anual)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span>Configuração pendente. Informe o faturamento anual declarado para iniciar o acompanhamento.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Filtros e ações */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={filtroAno} onValueChange={v => { setFiltroAno(v); }}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filtroMes || "todos"} onValueChange={v => setFiltroMes(v === "todos" ? "" : v)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Todos os meses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os meses</SelectItem>
                      {MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={recarregarSemanas}>
                    <Search className="h-4 w-4 mr-1" /> Filtrar
                  </Button>
                  <div className="ml-auto">
                    <Button size="sm" onClick={() => setNovaOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Nova Semana
                    </Button>
                  </div>
                </div>

                {/* Lista de semanas */}
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  </div>
                ) : semanas.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum registro encontrado para o período selecionado.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {semanas.map(s => (
                      <Card key={s.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => verDetalhe(s)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-800">
                                  {nomeMes(s.mes)}/{s.ano} — Semana {s.numero_semana}
                                </span>
                                <StatusBadge status={s.status} />
                              </div>
                              <p className="text-xs text-gray-500">{dataBR(s.semana_inicio)} a {dataBR(s.semana_fim)}</p>
                              <div className="grid grid-cols-3 gap-2 mt-2">
                                <div>
                                  <p className="text-xs text-green-600">Entradas</p>
                                  <p className="text-sm font-bold text-green-700">{moneyBR(s.total_entradas)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-red-500">Saídas</p>
                                  <p className="text-sm font-bold text-red-600">{moneyBR(s.total_saidas)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Saldo Final</p>
                                  <p className="text-sm font-bold">{moneyBR(s.saldo_final)}</p>
                                </div>
                              </div>
                              {s.limite_semanal_referencia > 0 && (
                                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                                  <span>Semana: <strong className={s.percentual_uso_semana > 100 ? "text-red-600" : "text-green-600"}>{pctBR(s.percentual_uso_semana)}</strong></span>
                                  <span>Mês: <strong className={s.percentual_uso_mes > 100 ? "text-red-600" : "text-green-600"}>{pctBR(s.percentual_uso_mes)}</strong></span>
                                  <span>Ano: <strong className={s.percentual_uso_ano > 100 ? "text-red-600" : "text-green-600"}>{pctBR(s.percentual_uso_ano)}</strong></span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => exportarPdf(s.id)}
                                disabled={exportandoPdf === s.id}
                                title="Exportar PDF"
                              >
                                {exportandoPdf === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Configuração */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configuração de Acompanhamento Financeiro</DialogTitle>
          </DialogHeader>
          {empresaSelecionada && config !== null && (
            <FormConfig
              empresaId={empresaSelecionada.id}
              config={config}
              onSalvo={() => { setConfigOpen(false); recarregarConfig(); }}
              onClose={() => setConfigOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Nova semana */}
      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar Semana de Acompanhamento</DialogTitle>
          </DialogHeader>
          {empresaSelecionada && (
            <FormSemana
              empresaId={empresaSelecionada.id}
              onSalvo={() => { setNovaOpen(false); recarregarSemanas(); }}
              onClose={() => setNovaOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Editar semana */}
      <Dialog open={!!editandoSemana} onOpenChange={v => { if (!v) setEditandoSemana(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Semana de Acompanhamento</DialogTitle>
          </DialogHeader>
          {empresaSelecionada && editandoSemana && (
            <FormSemana
              empresaId={empresaSelecionada.id}
              semanaExistente={editandoSemana}
              onSalvo={() => { setEditandoSemana(null); setDetalheSemana(null); recarregarSemanas(); }}
              onClose={() => setEditandoSemana(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhe da semana */}
      <Dialog open={!!detalheSemana} onOpenChange={v => { if (!v) setDetalheSemana(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhe do Acompanhamento Financeiro</DialogTitle>
          </DialogHeader>
          {detalheSemana && (
            <DetalheSemana
              semana={detalheSemana}
              onClose={() => setDetalheSemana(null)}
              onExportarPdf={id => { exportarPdf(id); }}
              onEditar={s => { setDetalheSemana(null); setEditandoSemana(s); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </ColaboradorLayout>
  );
}
