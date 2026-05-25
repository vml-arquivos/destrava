import { toast } from "sonner";
import { gerarArquivoPdfSimulacao, gerarPdfSimulacao } from "@/lib/gerarPdfSimulacao";
import { useState, useCallback, useEffect } from "react";
import Layout from "./Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Calculator,
  User,
  Building2,
  Phone,
  DollarSign,
  Percent,
  Calendar,
  FileText,
  Save,
  Printer,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Search,
  ChevronDown,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

// ─── Formatadores ─────────────────────────────────────────────────────────────

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function parseBRL(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
}

function formatarMoeda(v: string): string {
  const nums = v.replace(/\D/g, "");
  if (!nums) return "";
  const n = parseInt(nums) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarTelefone(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

async function armazenarPdfSimulacao(
  simulacaoId: string | undefined,
  dadosPdf: Parameters<typeof gerarArquivoPdfSimulacao>[0]
): Promise<boolean> {
  if (!simulacaoId) return false;
  try {
    const { base64, nomeArquivo } = gerarArquivoPdfSimulacao(dadosPdf);
    if (!base64) return false;
    await apiFetch(`/api/simulacoes/${simulacaoId}/pdf`, {
      method: "POST",
      body: JSON.stringify({
        nome_arquivo: nomeArquivo,
        pdf_base64: base64,
        metadata: { modo: dadosPdf.modo, cliente: dadosPdf.cliente?.nome || null },
      }),
    });
    return true;
  } catch (err) {
    console.warn("[PDF_SIMULACAO] Não foi possível armazenar o PDF", err);
    toast.warning("Simulação salva, mas o PDF não foi armazenado para reimpressão.");
    return false;
  }
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

interface ResultadoCalculo {
  parcelaMensal: number;
  totalFinanciamento: number;
  totalJuros: number;
  impostoValor: number;
  comissaoValor: number;
  custoTotalOperacao: number;
  taxaMensal: number;
  taxaAnualEquiv: number;
  cetMensal: number;
  cetAnual: number;
}

function calcularCET(valorCredito: number, prazo: number, parcelaMensal: number): number {
  let cet = 0.01; // Chute inicial
  for (let i = 0; i < 20; i++) {
    let f = 0;
    let df = 0;
    for (let t = 1; t <= prazo; t++) {
      f += parcelaMensal / Math.pow(1 + cet, t);
      df -= (t * parcelaMensal) / Math.pow(1 + cet, t + 1);
    }
    f -= valorCredito;
    cet = cet - f / df;
  }
  return cet; // Retorna taxa decimal mensal
}

function calcular(
  valorCredito: number,
  prazo: number,
  taxaMensal: number,
  valorFiscal: number,
  pctImposto: number,
  pctComissao: number
): ResultadoCalculo | null {
  if (!valorCredito || !prazo || !taxaMensal) return null;

  const taxa = taxaMensal / 100;

  const parcelaMensal =
    (valorCredito * taxa * Math.pow(1 + taxa, prazo)) /
    (Math.pow(1 + taxa, prazo) - 1);

  const totalFinanciamento = parcelaMensal * prazo;
  const totalJuros = totalFinanciamento - valorCredito;

  const impostoValor = valorFiscal > 0 && pctImposto > 0
    ? (valorFiscal * pctImposto) / 100
    : 0;

  const comissaoValor = pctComissao > 0
    ? (valorCredito * pctComissao) / 100
    : 0;

  // Comissão Destrava é exibida e salva separadamente, mas NÃO compõe o custo/despesa total do cliente.
  const custoTotalOperacao = totalFinanciamento + impostoValor;

  const taxaAnualEquiv = (Math.pow(1 + taxa, 12) - 1) * 100;
  
  // CET considera apenas o valor líquido afetado por imposto/despesas financeiras da operação.
  // A comissão fica destacada separadamente e não reduz o valor liberado nesta simulação.
  const valorLiberado = Math.max(valorCredito - impostoValor, 1);
  const cetMensalDecimal = calcularCET(valorLiberado, prazo, parcelaMensal);
  const cetMensal = cetMensalDecimal * 100;
  const cetAnual = (Math.pow(1 + cetMensalDecimal, 12) - 1) * 100;

  return {
    parcelaMensal,
    totalFinanciamento,
    totalJuros,
    impostoValor,
    comissaoValor,
    custoTotalOperacao,
    taxaMensal,
    taxaAnualEquiv,
    cetMensal,
    cetAnual,
  };
}

// ─── Tipos de formulário ──────────────────────────────────────────────────────

interface FormBase {
  nome: string;
  empresa: string;
  telefone: string;
  cpfCnpj: string;
  valorCredito: string;
  prazo: string;
  taxaJuros: string;
  comissao: string;
  banco: string;
  linhaCredito: string;
  observacoes: string;
}

interface FormComImposto extends FormBase {
  valorFiscal: string;
  pctImposto: string;
}

const BANCOS = [
  "CAIXA Econômica Federal",
  "Banco do Brasil",
  "Bradesco",
  "Itaú",
  "Santander",
  "Sicredi",
  "Sicoob",
  "BNB",
  "BNDES",
  "Outro",
];

const LINHAS = [
  "PRONAMPE",
  "Giro CAIXA Fácil",
  "Capital de Giro",
  "PRONAMP",
  "Crédito Rural",
  "Financiamento de Equipamentos",
  "Crédito Imobiliário PJ",
  "Antecipação de Recebíveis",
  "Crédito Pessoal",
  "Consignado",
  "Outro",
];

const PRAZOS = [6, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 120];

const formBaseInicial: FormBase = {
  nome: "",
  empresa: "",
  telefone: "",
  cpfCnpj: "",
  valorCredito: "",
  prazo: "24",
  taxaJuros: "",
  comissao: "",
  banco: "",
  linhaCredito: "",
  observacoes: "",
};

// ─── Busca de lead/cliente existente ────────────────────────────────────────

interface LeadOption {
  id: string;
  nome: string;
  empresa?: string;
  telefone: string;
  cpf_cnpj?: string;
}

function SeletorCliente({
  onSelect,
}: {
  onSelect: (lead: LeadOption) => void;
}) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<LeadOption[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (busca.length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const data = await apiFetch(`/api/leads?busca=${encodeURIComponent(busca)}&limit=8`);
        const arr: LeadOption[] = Array.isArray(data)
          ? data
          : (data?.leads ?? []);
        setResultados(arr.slice(0, 8));
        setAberto(true);
      } catch { setResultados([]); }
      setCarregando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 pb-1 border-b mb-3">
        <Search className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buscar cliente/empresa existente</p>
        <span className="text-xs text-muted-foreground ml-auto">(opcional)</span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 200)}
          placeholder="Digite nome, empresa ou telefone..."
          className="pl-9"
        />
        {carregando && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
      </div>
      {aberto && resultados.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {resultados.map(lead => (
            <button
              key={lead.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-0 transition-colors"
              onMouseDown={() => { onSelect(lead); setBusca(""); setAberto(false); }}
            >
              <p className="text-sm font-medium text-gray-900">{lead.nome}</p>
              <p className="text-xs text-gray-500">{lead.empresa || "—"} · {lead.telefone}</p>
            </button>
          ))}
        </div>
      )}
      {aberto && busca.length >= 2 && resultados.length === 0 && !carregando && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 text-sm text-gray-400">
          Nenhum cliente encontrado. Preencha os dados manualmente.
        </div>
      )}
    </div>
  );
}

// ─── Painel de resultado individual ──────────────────────────────────────────

function PainelResultado({
  resultado,
  comImposto,
  valorFiscalNum,
  pctImpostoNum,
  prazo,
}: {
  resultado: ResultadoCalculo;
  comImposto: boolean;
  valorFiscalNum: number;
  pctImpostoNum: number;
  prazo: number;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-[#001f6b] to-[#003db5] rounded-2xl p-6 text-white text-center">
        <p className="text-white/70 text-sm mb-1">Parcela Mensal</p>
        <p className="text-4xl font-bold">{fmtBRL.format(resultado.parcelaMensal)}</p>
        <p className="text-white/60 text-xs mt-1">{prazo}x mensais</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financiamento</p>
        <div className="space-y-0">
          <div className="flex justify-between items-center py-2 border-b border-border text-sm">
            <span className="text-muted-foreground">Valor do Crédito</span>
            <span className="font-medium">{fmtBRL.format(resultado.totalFinanciamento - resultado.totalJuros)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border text-sm">
            <span className="text-muted-foreground">Total de Juros</span>
            <span className="font-medium text-amber-600">{fmtBRL.format(resultado.totalJuros)}</span>
          </div>
          <div className="flex justify-between items-center py-2 text-sm">
            <span className="font-semibold">Total do Financiamento</span>
            <span className="font-bold text-primary">{fmtBRL.format(resultado.totalFinanciamento)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Custo Total da Operação <span className="normal-case font-normal">(sem comissão)</span></p>
        <div className="space-y-0">
          <div className="flex justify-between items-center py-2 border-b border-red-100 text-sm">
            <span className="text-muted-foreground">Total do Financiamento</span>
            <span className="font-medium">{fmtBRL.format(resultado.totalFinanciamento)}</span>
          </div>
          {resultado.comissaoValor > 0 && (
            <div className="flex justify-between items-center py-2 border-b border-red-100 text-sm">
              <span className="text-muted-foreground">Comissão Destrava <span className="text-xs">(informativa, não soma)</span></span>
              <span className="font-semibold text-orange-600">{fmtBRL.format(resultado.comissaoValor)}</span>
            </div>
          )}
          {comImposto && resultado.impostoValor > 0 && (
            <div className="flex justify-between items-center py-2 border-b border-red-100 text-sm">
              <span className="text-muted-foreground">
                Imposto ({pctImpostoNum}% s/ {fmtBRL.format(valorFiscalNum)}) <span className="text-xs">(1x)</span>
              </span>
              <span className="font-semibold text-red-600">{fmtBRL.format(resultado.impostoValor)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-3 text-sm">
            <span className="font-bold text-base">Total da Operação <span className="text-xs font-normal">(sem comissão)</span></span>
            <span className="font-bold text-xl text-red-700">{fmtBRL.format(resultado.custoTotalOperacao)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Taxas e Custos</p>
        <div className="space-y-0">
          <div className="flex justify-between items-center py-2 border-b border-border text-sm">
            <span className="text-muted-foreground">Taxa de Juros</span>
            <span className="font-medium">{resultado.taxaMensal.toFixed(2).replace('.', ',')}% a.m. / {resultado.taxaAnualEquiv.toFixed(2).replace('.', ',')}% a.a.</span>
          </div>
          <div className="flex justify-between items-center py-2 text-sm">
            <span className="text-muted-foreground">CET (Custo Efetivo Total)</span>
            <span className="font-medium text-red-600">{resultado.cetMensal.toFixed(2).replace('.', ',')}% a.m. / {resultado.cetAnual.toFixed(2).replace('.', ',')}% a.a.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Campos reutilizáveis ─────────────────────────────────────────────────────

function CamposCliente({
  form,
  erros,
  set,
  onSelectLead,
}: {
  form: FormBase;
  erros: Record<string, string>;
  set: (k: keyof FormBase, v: string) => void;
  onSelectLead?: (lead: LeadOption) => void;
}) {
  return (
    <div className="space-y-4">
      {onSelectLead && (
        <SeletorCliente onSelect={onSelectLead} />
      )}
      <div className="flex items-center gap-2 pb-1 border-b">
        <User className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Cliente</p>
        <span className="text-xs text-destructive ml-auto">* obrigatório</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome Completo <span className="text-destructive">*</span></Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Nome do cliente"
              className={`pl-9 ${erros.nome ? "border-destructive" : ""}`}
            />
          </div>
          {erros.nome && <p className="text-xs text-destructive">{erros.nome}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="empresa">Empresa / Razão Social <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="empresa"
              value={form.empresa}
              onChange={(e) => set("empresa", e.target.value)}
              placeholder="Nome da empresa"
              className={`pl-9 ${erros.empresa ? "border-destructive" : ""}`}
            />
          </div>
          {erros.empresa && <p className="text-xs text-destructive">{erros.empresa}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone / WhatsApp <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="telefone"
              value={form.telefone}
              onChange={(e) => set("telefone", formatarTelefone(e.target.value))}
              placeholder="(61) 9 9999-9999"
              className={`pl-9 ${erros.telefone ? "border-destructive" : ""}`}
              inputMode="tel"
            />
          </div>
          {erros.telefone && <p className="text-xs text-destructive">{erros.telefone}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cpfCnpj">CPF / CNPJ <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <Input
            id="cpfCnpj"
            value={form.cpfCnpj}
            onChange={(e) => set("cpfCnpj", e.target.value)}
            placeholder="00.000.000/0001-00"
          />
        </div>
      </div>
    </div>
  );
}

function CamposEmprestimo({
  form,
  erros,
  set,
}: {
  form: FormBase;
  erros: Record<string, string>;
  set: (k: keyof FormBase, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b">
        <DollarSign className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Empréstimo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="valorCredito">Valor do Crédito <span className="text-destructive">*</span></Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">R$</span>
            <Input
              id="valorCredito"
              value={form.valorCredito}
              onChange={(e) => set("valorCredito", formatarMoeda(e.target.value))}
              placeholder="0,00"
              className={`pl-9 ${erros.valorCredito ? "border-destructive" : ""}`}
              inputMode="numeric"
            />
          </div>
          {erros.valorCredito && <p className="text-xs text-destructive">{erros.valorCredito}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Prazo (meses) <span className="text-destructive">*</span></Label>
          <Select value={form.prazo} onValueChange={(v) => set("prazo", v)}>
            <SelectTrigger>
              <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRAZOS.map((p) => (
                <SelectItem key={p} value={String(p)}>{p} meses</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="taxaJuros">Taxa de Juros Mensal (%) <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="taxaJuros"
              value={form.taxaJuros}
              onChange={(e) => set("taxaJuros", e.target.value.replace(",", "."))}
              placeholder="Ex: 1.89"
              className={`pl-9 ${erros.taxaJuros ? "border-destructive" : ""}`}
              inputMode="decimal"
            />
          </div>
          {erros.taxaJuros && <p className="text-xs text-destructive">{erros.taxaJuros}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="comissao">Comissão Destrava (%) <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <div className="relative">
            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="comissao"
              value={form.comissao}
              onChange={(e) => set("comissao", e.target.value.replace(",", "."))}
              placeholder="Ex: 2.50"
              className="pl-9"
              inputMode="decimal"
            />
          </div>
          {form.comissao && parseBRL(form.valorCredito) > 0 && (
            <p className="text-xs text-orange-600 font-medium">
              = {fmtBRL.format((parseBRL(form.valorCredito) * parseFloat(form.comissao)) / 100)}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Banco <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <Select value={form.banco} onValueChange={(v) => set("banco", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {BANCOS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Linha de Crédito <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <Select value={form.linhaCredito} onValueChange={(v) => set("linhaCredito", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {LINHAS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── Cenário A: COM Imposto ───────────────────────────────────────────────────

function CenarioComImposto({ initialData }: { initialData?: { nome: string; empresa: string; telefone: string; cpf_cnpj: string } }) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormComImposto>({
    ...formBaseInicial,
    nome: initialData?.nome || "",
    empresa: initialData?.empresa || "",
    telefone: initialData?.telefone ? formatarTelefone(initialData.telefone.replace(/\D/g, "")) : "",
    cpfCnpj: initialData?.cpf_cnpj || "",
    valorFiscal: "",
    pctImposto: "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const setBase = useCallback((k: keyof FormBase, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErros((prev) => ({ ...prev, [k]: "" }));
  }, []);

  const setExtra = (k: "valorFiscal" | "pctImposto", v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Obrigatório";
    if (!form.empresa.trim()) e.empresa = "Obrigatório";
    if (!form.telefone.trim()) e.telefone = "Obrigatório";
    else if (form.telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido";
    if (!form.valorCredito) e.valorCredito = "Obrigatório";
    if (!form.taxaJuros) e.taxaJuros = "Obrigatório";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function handleCalcular() {
    if (!validar()) return;
    const vc = parseBRL(form.valorCredito);
    const prazo = parseInt(form.prazo);
    const taxa = parseFloat(form.taxaJuros);
    const vf = parseBRL(form.valorFiscal);
    const pi = parseFloat(form.pctImposto) || 0;
    const pc = parseFloat(form.comissao) || 0;
    setResultado(calcular(vc, prazo, taxa, vf, pi, pc));
    setSalvo(false);
  }

  async function handleSalvar() {
    if (!resultado) return;
    setSalvando(true);
    try {
      const saved = await apiFetch("/api/simulacoes", {
        method: "POST",
        body: JSON.stringify({
          cliente_nome: form.nome,
          cliente_telefone: form.telefone,
          cliente_cpf_cnpj: form.cpfCnpj || null,
          cliente_empresa: form.empresa || null,
          valor_solicitado: parseBRL(form.valorCredito),
          quantidade_parcelas: parseInt(form.prazo),
          taxa_juros_mensal: parseFloat(form.taxaJuros),
          imposto_percentual: parseFloat(form.pctImposto) || null,
          total_imposto: resultado.impostoValor || null,
          comissao_percentual: parseFloat(form.comissao) || null,
          total_comissao: resultado.comissaoValor,
          valor_parcela: resultado.parcelaMensal,
          valor_total_pagar: resultado.totalFinanciamento,
          total_juros: resultado.totalJuros,
          custo_efetivo_total: resultado.custoTotalOperacao,
          banco: form.banco || null,
          linha_credito: form.linhaCredito || null,
          observacoes: form.observacoes ? `[com_imposto] ${form.observacoes}` : "[com_imposto]",
        }),
      });
      await armazenarPdfSimulacao(saved?.id, {
        cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
        cenarioA: { taxa: parseFloat(form.taxaJuros), valorCredito: parseBRL(form.valorCredito), prazo: parseInt(form.prazo), parcela: resultado.parcelaMensal, totalFinanciamento: resultado.totalFinanciamento, totalJuros: resultado.totalJuros, impostoValor: resultado.impostoValor, comissaoValor: resultado.comissaoValor, custoTotalOperacao: resultado.custoTotalOperacao, cenario: "com_imposto", taxaAnualEquiv: resultado.taxaAnualEquiv, cetMensal: resultado.cetMensal, cetAnual: resultado.cetAnual },
        modo: "simples"
      });
      setSalvo(true);
      toast.success("Simulação salva com PDF armazenado para reimpressão!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar simulação. Verifique a conexão e tente novamente.");
    }
    setSalvando(false);
  }

  function handleLimpar() {
    setForm({ ...formBaseInicial, valorFiscal: "", pctImposto: "" });
    setResultado(null);
    setSalvo(false);
    setErros({});
  }

  function handleSelectLead(lead: LeadOption) {
    setForm(prev => ({
      ...prev,
      nome: lead.nome || prev.nome,
      empresa: lead.empresa || prev.empresa,
      telefone: lead.telefone || prev.telefone,
      cpfCnpj: lead.cpf_cnpj || prev.cpfCnpj,
    }));
    setErros({});
  }

  const valorFiscalNum = parseBRL(form.valorFiscal);
  const pctImpostoNum = parseFloat(form.pctImposto) || 0;
  const impostoPreview = valorFiscalNum > 0 && pctImpostoNum > 0
    ? (valorFiscalNum * pctImpostoNum) / 100
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <CamposCliente form={form} erros={erros} set={setBase} onSelectLead={handleSelectLead} />
        <CamposEmprestimo form={form} erros={erros} set={setBase} />

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Declaração Fiscal e Imposto</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 inline mr-1" />
            O imposto é calculado sobre o <strong>valor fiscal declarado</strong> pelo cliente.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valorFiscal">Valor Fiscal Declarado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">R$</span>
                <Input
                  id="valorFiscal"
                  value={form.valorFiscal}
                  onChange={(e) => setExtra("valorFiscal", formatarMoeda(e.target.value))}
                  placeholder="0,00"
                  className="pl-9"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pctImposto">Alíquota do Imposto (%)</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pctImposto"
                  value={form.pctImposto}
                  onChange={(e) => setExtra("pctImposto", e.target.value.replace(",", "."))}
                  placeholder="Ex: 6.00"
                  className="pl-9"
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>
          {impostoPreview !== null && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Imposto ({pctImpostoNum}% de {fmtBRL.format(valorFiscalNum)})</span>
              <span className="font-bold text-red-700 text-lg">{fmtBRL.format(impostoPreview)}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Observações <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <textarea
            value={form.observacoes}
            onChange={(e) => setBase("observacoes", e.target.value)}
            placeholder="Carência, garantias, condições especiais..."
            className="w-full min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-3">
          <Button onClick={handleCalcular} className="flex-1 font-bold h-12 text-base">
            <Calculator className="mr-2 h-5 w-5" />Calcular
          </Button>
          <Button variant="outline" onClick={handleLimpar} className="h-12 px-4" title="Limpar">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        {resultado ? (
          <Card className="border-0 shadow-lg sticky top-6">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                <span className="truncate min-w-0 flex-1">Resultado — {form.nome}</span>
                <Badge className="ml-auto flex-shrink-0 bg-blue-600 text-white text-xs">Cenário A · Com Imposto</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <PainelResultado
                resultado={resultado}
                comImposto={true}
                valorFiscalNum={valorFiscalNum}
                pctImpostoNum={pctImpostoNum}
                prazo={parseInt(form.prazo)}
              />
              <div className="flex gap-2 mt-5">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleSalvar} disabled={salvando || salvo}>
                  {salvo ? <><CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />Salvo!</> : <><Save className="mr-1.5 h-4 w-4" />{salvando ? "Salvando..." : "Salvar"}</>}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => gerarPdfSimulacao({
                  cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
                  cenarioA: resultado ? { taxa: parseFloat(form.taxaJuros), valorCredito: parseBRL(form.valorCredito), prazo: parseInt(form.prazo), parcela: resultado.parcelaMensal, totalFinanciamento: resultado.totalFinanciamento, totalJuros: resultado.totalJuros, impostoValor: resultado.impostoValor, comissaoValor: resultado.comissaoValor, custoTotalOperacao: resultado.custoTotalOperacao, cenario: "com_imposto", taxaAnualEquiv: resultado.taxaAnualEquiv, cetMensal: resultado.cetMensal, cetAnual: resultado.cetAnual } : undefined,
                  modo: "simples"
                })}>
                  <Printer className="mr-1.5 h-4 w-4" />Exportar PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center text-muted-foreground border-2 border-dashed rounded-2xl p-8">
            <Calculator className="h-14 w-14 mb-3 opacity-20" />
            <p className="font-medium">Preencha os dados e clique em Calcular</p>
            <p className="text-sm mt-1 opacity-60">O resultado aparecerá aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cenário B: SEM Imposto ───────────────────────────────────────────────────

function CenarioSemImposto({ initialData }: { initialData?: { nome: string; empresa: string; telefone: string; cpf_cnpj: string } }) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormBase>({
    ...formBaseInicial,
    nome: initialData?.nome || "",
    empresa: initialData?.empresa || "",
    telefone: initialData?.telefone ? formatarTelefone(initialData.telefone.replace(/\D/g, "")) : "",
    cpfCnpj: initialData?.cpf_cnpj || "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const set = useCallback((k: keyof FormBase, v: string) => {
    setForm((prev: FormBase) => ({ ...prev, [k]: v }));
    setErros((prev) => ({ ...prev, [k]: "" }));
  }, []);

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Obrigatório";
    if (!form.empresa.trim()) e.empresa = "Obrigatório";
    if (!form.telefone.trim()) e.telefone = "Obrigatório";
    else if (form.telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido";
    if (!form.valorCredito) e.valorCredito = "Obrigatório";
    if (!form.taxaJuros) e.taxaJuros = "Obrigatório";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function handleCalcular() {
    if (!validar()) return;
    const vc = parseBRL(form.valorCredito);
    const prazo = parseInt(form.prazo);
    const taxa = parseFloat(form.taxaJuros);
    const pc = parseFloat(form.comissao) || 0;
    setResultado(calcular(vc, prazo, taxa, 0, 0, pc));
    setSalvo(false);
  }

  async function handleSalvar() {
    if (!resultado) return;
    setSalvando(true);
    try {
      // User obtained from useAuth hook
      if (false) {
        toast.error("Sessão expirada. Faça login novamente.");
        setSalvando(false);
        return;
      }
      const saved = await apiFetch("/api/simulacoes", {
        method: "POST",
        body: JSON.stringify({
          colaborador_id: user?.id,
          cliente_nome: form.nome,
          cliente_telefone: form.telefone,
          cliente_cpf_cnpj: form.cpfCnpj || null,
          cliente_empresa: form.empresa || null,
          valor_solicitado: parseBRL(form.valorCredito),
          quantidade_parcelas: parseInt(form.prazo),
          taxa_juros_mensal: parseFloat(form.taxaJuros),
          comissao_percentual: parseFloat(form.comissao) || null,
          total_comissao: resultado.comissaoValor,
          valor_parcela: resultado.parcelaMensal,
          valor_total_pagar: resultado.totalFinanciamento,
          total_juros: resultado.totalJuros,
          custo_efetivo_total: resultado.custoTotalOperacao,
          banco: form.banco || null,
          linha_credito: form.linhaCredito || null,
          observacoes: form.observacoes ? `[sem_imposto] ${form.observacoes}` : "[sem_imposto]",
        }),
      });
      await armazenarPdfSimulacao(saved?.id, {
        cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
        cenarioA: { taxa: parseFloat(form.taxaJuros), valorCredito: parseBRL(form.valorCredito), prazo: parseInt(form.prazo), parcela: resultado.parcelaMensal, totalFinanciamento: resultado.totalFinanciamento, totalJuros: resultado.totalJuros, comissaoValor: resultado.comissaoValor, custoTotalOperacao: resultado.custoTotalOperacao, cenario: "sem_imposto", taxaAnualEquiv: resultado.taxaAnualEquiv, cetMensal: resultado.cetMensal, cetAnual: resultado.cetAnual },
        modo: "simples"
      });
      setSalvo(true);
      toast.success("Simulação salva com PDF armazenado para reimpressão!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar simulação. Verifique a conexão e tente novamente.");
    }
    setSalvando(false);
  }

  function handleLimpar() {
    setForm({ ...formBaseInicial });
    setResultado(null);
    setSalvo(false);
    setErros({});
  }

  function handleSelectLead(lead: LeadOption) {
    setForm(prev => ({
      ...prev,
      nome: lead.nome || prev.nome,
      empresa: lead.empresa || prev.empresa,
      telefone: lead.telefone || prev.telefone,
      cpfCnpj: lead.cpf_cnpj || prev.cpfCnpj,
    }));
    setErros({});
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <CamposCliente form={form} erros={erros} set={set} onSelectLead={handleSelectLead} />
        <CamposEmprestimo form={form} erros={erros} set={set} />
        <div className="space-y-1.5">
          <Label>Observações <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <textarea
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Carência, garantias, condições especiais..."
            className="w-full min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-3">
          <Button onClick={handleCalcular} className="flex-1 font-bold h-12 text-base">
            <Calculator className="mr-2 h-5 w-5" />Calcular
          </Button>
          <Button variant="outline" onClick={handleLimpar} className="h-12 px-4" title="Limpar">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        {resultado ? (
          <Card className="border-0 shadow-lg sticky top-6">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                <span className="truncate min-w-0 flex-1">Resultado — {form.nome}</span>
                <Badge variant="outline" className="ml-auto flex-shrink-0 text-xs">Cenário B · Sem Imposto</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <PainelResultado
                resultado={resultado}
                comImposto={false}
                valorFiscalNum={0}
                pctImpostoNum={0}
                prazo={parseInt(form.prazo)}
              />
              <div className="flex gap-2 mt-5">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleSalvar} disabled={salvando || salvo}>
                  {salvo ? <><CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />Salvo!</> : <><Save className="mr-1.5 h-4 w-4" />{salvando ? "Salvando..." : "Salvar"}</>}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => gerarPdfSimulacao({
                  cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
                  cenarioA: resultado ? { taxa: parseFloat(form.taxaJuros), valorCredito: parseBRL(form.valorCredito), prazo: parseInt(form.prazo), parcela: resultado.parcelaMensal, totalFinanciamento: resultado.totalFinanciamento, totalJuros: resultado.totalJuros, comissaoValor: resultado.comissaoValor, custoTotalOperacao: resultado.custoTotalOperacao, cenario: "sem_imposto", taxaAnualEquiv: resultado.taxaAnualEquiv, cetMensal: resultado.cetMensal, cetAnual: resultado.cetAnual } : undefined,
                  modo: "simples"
                })}>
                  <Printer className="mr-1.5 h-4 w-4" />Exportar PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center text-muted-foreground border-2 border-dashed rounded-2xl p-8">
            <Calculator className="h-14 w-14 mb-3 opacity-20" />
            <p className="font-medium">Preencha os dados e clique em Calcular</p>
            <p className="text-sm mt-1 opacity-60">O resultado aparecerá aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comparativo lado a lado ──────────────────────────────────────────────────

interface FormComparativo {
  nome: string;
  empresa: string;
  telefone: string;
  cpfCnpj: string;
  valorCredito: string;
  prazo: string;
  comissao: string;
  banco: string;
  linhaCredito: string;
  observacoes: string;
  // Cenário A — Com Imposto
  taxaA: string;
  valorFiscal: string;
  pctImposto: string;
  // Cenário B — Sem Imposto
  taxaB: string;
}

function DifTag({ a, b, campo }: { a: number; b: number; campo: "parcela" | "total" }) {
  const diff = a - b;
  if (Math.abs(diff) < 0.01) return <span className="text-xs text-gray-400 flex items-center gap-0.5"><Minus className="w-3 h-3" /> igual</span>;
  const maior = diff > 0;
  return (
    <span className={`text-xs font-semibold flex items-center gap-0.5 ${maior ? "text-red-600" : "text-green-600"}`}>
      {maior ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {maior ? "+" : ""}{fmtBRL.format(Math.abs(diff))}
    </span>
  );
}

function CenarioComparativo({ initialData }: { initialData?: { nome: string; empresa: string; telefone: string; cpf_cnpj: string } }) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormComparativo>({
    nome: initialData?.nome || "",
    empresa: initialData?.empresa || "",
    telefone: initialData?.telefone ? formatarTelefone(initialData.telefone.replace(/\D/g, "")) : "",
    cpfCnpj: initialData?.cpf_cnpj || "",
    valorCredito: "", prazo: "24", comissao: "",
    banco: "", linhaCredito: "", observacoes: "",
    taxaA: "", valorFiscal: "", pctImposto: "",
    taxaB: "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resA, setResA] = useState<ResultadoCalculo | null>(null);
  const [resB, setResB] = useState<ResultadoCalculo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const set = useCallback((k: keyof FormComparativo, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErros((prev) => ({ ...prev, [k]: "" }));
  }, []);

  // Recalcular em tempo real sempre que os campos mudarem
  useEffect(() => {
    const vc = parseBRL(form.valorCredito);
    const prazo = parseInt(form.prazo) || 0;
    const pc = parseFloat(form.comissao) || 0;

    const taxaA = parseFloat(form.taxaA) || 0;
    const vf = parseBRL(form.valorFiscal);
    const pi = parseFloat(form.pctImposto) || 0;
    const taxaB = parseFloat(form.taxaB) || 0;

    if (vc > 0 && prazo > 0) {
      setResA(taxaA > 0 ? calcular(vc, prazo, taxaA, vf, pi, pc) : null);
      setResB(taxaB > 0 ? calcular(vc, prazo, taxaB, 0, 0, pc) : null);
    } else {
      setResA(null);
      setResB(null);
    }
  }, [form]);

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Obrigatório";
    if (!form.empresa.trim()) e.empresa = "Obrigatório";
    if (!form.telefone.trim()) e.telefone = "Obrigatório";
    if (!form.valorCredito) e.valorCredito = "Obrigatório";
    if (!form.taxaA) e.taxaA = "Obrigatório";
    if (!form.taxaB) e.taxaB = "Obrigatório";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function handleSalvar() {
    if (!validar() || (!resA && !resB)) return;
    setSalvando(true);
    try {
      // User obtained from useAuth hook
      if (false) {
        toast.error("Sessão expirada. Faça login novamente.");
        setSalvando(false);
        return;
      }
      const base = {
        colaborador_id: user?.id,
        cliente_nome: form.nome,
        cliente_telefone: form.telefone,
        cliente_cpf_cnpj: form.cpfCnpj || null,
        cliente_empresa: form.empresa || null,
        valor_solicitado: parseBRL(form.valorCredito),
        quantidade_parcelas: parseInt(form.prazo),
        comissao_percentual: parseFloat(form.comissao) || null,
        banco: form.banco || null,
        linha_credito: form.linhaCredito || null,
      };
      if (resA) {
        const savedA = await apiFetch("/api/simulacoes", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            taxa_juros_mensal: parseFloat(form.taxaA),
            imposto_percentual: parseFloat(form.pctImposto) || null,
            total_imposto: resA.impostoValor || null,
            total_comissao: resA.comissaoValor,
            valor_parcela: resA.parcelaMensal,
            valor_total_pagar: resA.totalFinanciamento,
            total_juros: resA.totalJuros,
            custo_efetivo_total: resA.custoTotalOperacao,
            observacoes: form.observacoes ? `[com_imposto] ${form.observacoes}` : "[com_imposto]",
          }),
        });
        await armazenarPdfSimulacao(savedA?.id, {
          cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
          cenarioA: { taxa: parseFloat(form.taxaA), valorCredito: parseBRL(form.valorCredito), prazo: parseInt(form.prazo), parcela: resA.parcelaMensal, totalFinanciamento: resA.totalFinanciamento, totalJuros: resA.totalJuros, impostoValor: resA.impostoValor, comissaoValor: resA.comissaoValor, custoTotalOperacao: resA.custoTotalOperacao, cenario: "com_imposto", taxaAnualEquiv: resA.taxaAnualEquiv, cetMensal: resA.cetMensal, cetAnual: resA.cetAnual },
          modo: "simples"
        });
      }
      if (resB) {
        const savedB = await apiFetch("/api/simulacoes", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            taxa_juros_mensal: parseFloat(form.taxaB),
            total_comissao: resB.comissaoValor,
            valor_parcela: resB.parcelaMensal,
            valor_total_pagar: resB.totalFinanciamento,
            total_juros: resB.totalJuros,
            custo_efetivo_total: resB.custoTotalOperacao,
            observacoes: form.observacoes ? `[sem_imposto] ${form.observacoes}` : "[sem_imposto]",
          }),
        });
        await armazenarPdfSimulacao(savedB?.id, {
          cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
          cenarioA: { taxa: parseFloat(form.taxaB), valorCredito: parseBRL(form.valorCredito), prazo: parseInt(form.prazo), parcela: resB.parcelaMensal, totalFinanciamento: resB.totalFinanciamento, totalJuros: resB.totalJuros, comissaoValor: resB.comissaoValor, custoTotalOperacao: resB.custoTotalOperacao, cenario: "sem_imposto", taxaAnualEquiv: resB.taxaAnualEquiv, cetMensal: resB.cetMensal, cetAnual: resB.cetAnual },
          modo: "simples"
        });
      }
      setSalvo(true);
      toast.success("Simulações salvas com PDFs armazenados para reimpressão!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar simulação. Verifique a conexão e tente novamente.");
    }
    setSalvando(false);
  }

  function handleLimpar() {
    setForm({
      nome: "", empresa: "", telefone: "", cpfCnpj: "",
      valorCredito: "", prazo: "24", comissao: "",
      banco: "", linhaCredito: "", observacoes: "",
      taxaA: "", valorFiscal: "", pctImposto: "",
      taxaB: "",
    });
    setResA(null);
    setResB(null);
    setSalvo(false);
    setErros({});
  }

  const vc = parseBRL(form.valorCredito);
  const pc = parseFloat(form.comissao) || 0;
  const vf = parseBRL(form.valorFiscal);
  const pi = parseFloat(form.pctImposto) || 0;
  const prazoNum = parseInt(form.prazo) || 24;

  function handleSelectLead(lead: LeadOption) {
    setForm(prev => ({
      ...prev,
      nome: lead.nome || prev.nome,
      empresa: lead.empresa || prev.empresa,
      telefone: lead.telefone || prev.telefone,
      cpfCnpj: lead.cpf_cnpj || prev.cpfCnpj,
    }));
    setErros({});
  }

  return (
    <div className="space-y-6">
      {/* Dados comuns */}
      <div className="bg-white rounded-2xl border p-5 space-y-5">
        <SeletorCliente onSelect={handleSelectLead} />
        <div className="flex items-center gap-2 pb-1 border-b">
          <User className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Cliente e do Crédito</p>
          <span className="text-xs text-destructive ml-auto">* obrigatório</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Nome */}
          <div className="col-span-2 space-y-1.5">
            <Label>Nome Completo <span className="text-destructive">*</span></Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={form.nome} onChange={e => set("nome", e.target.value)} placeholder="Nome do cliente" className={`pl-9 ${erros.nome ? "border-destructive" : ""}`} />
            </div>
            {erros.nome && <p className="text-xs text-destructive">{erros.nome}</p>}
          </div>

          {/* Empresa */}
          <div className="col-span-2 space-y-1.5">
            <Label>Empresa <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={form.empresa} onChange={e => set("empresa", e.target.value)} placeholder="Razão social" className={`pl-9 ${erros.empresa ? "border-destructive" : ""}`} />
            </div>
            {erros.empresa && <p className="text-xs text-destructive">{erros.empresa}</p>}
          </div>

          {/* Telefone */}
          <div className="col-span-2 space-y-1.5">
            <Label>Telefone <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={form.telefone} onChange={e => set("telefone", formatarTelefone(e.target.value))} placeholder="(61) 9 9999-9999" className={`pl-9 ${erros.telefone ? "border-destructive" : ""}`} inputMode="tel" />
            </div>
            {erros.telefone && <p className="text-xs text-destructive">{erros.telefone}</p>}
          </div>

          {/* CPF/CNPJ */}
          <div className="col-span-2 space-y-1.5">
            <Label>CPF / CNPJ <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
            <Input value={form.cpfCnpj} onChange={e => set("cpfCnpj", e.target.value)} placeholder="00.000.000/0001-00" />
          </div>

          {/* Valor do crédito */}
          <div className="col-span-2 space-y-1.5">
            <Label>Valor do Crédito <span className="text-destructive">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">R$</span>
              <Input value={form.valorCredito} onChange={e => set("valorCredito", formatarMoeda(e.target.value))} placeholder="0,00" className={`pl-9 ${erros.valorCredito ? "border-destructive" : ""}`} inputMode="numeric" />
            </div>
            {erros.valorCredito && <p className="text-xs text-destructive">{erros.valorCredito}</p>}
          </div>

          {/* Prazo */}
          <div className="col-span-1 space-y-1.5">
            <Label>Prazo (meses)</Label>
            <Select value={form.prazo} onValueChange={v => set("prazo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRAZOS.map(p => <SelectItem key={p} value={String(p)}>{p}m</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Comissão */}
          <div className="col-span-1 space-y-1.5">
            <Label>Comissão (%) <span className="text-muted-foreground text-xs font-normal">(mesma nos dois)</span></Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={form.comissao} onChange={e => set("comissao", e.target.value.replace(",", "."))} placeholder="Ex: 2.50" className="pl-9" inputMode="decimal" />
            </div>
            {form.comissao && vc > 0 && (
              <p className="text-xs text-orange-600 font-medium">= {fmtBRL.format(vc * pc / 100)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Duas colunas de taxas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cenário A */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">A</div>
            <div>
              <p className="font-bold text-blue-900">Com Imposto</p>
              <p className="text-xs text-blue-600">Taxa + imposto sobre valor fiscal</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-blue-900">Taxa de Juros Mensal (%) <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
              <Input
                value={form.taxaA}
                onChange={e => set("taxaA", e.target.value.replace(",", "."))}
                placeholder="Ex: 2.10"
                className={`pl-9 bg-white border-blue-300 focus:border-blue-500 ${erros.taxaA ? "border-destructive" : ""}`}
                inputMode="decimal"
              />
            </div>
            {erros.taxaA && <p className="text-xs text-destructive">{erros.taxaA}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-blue-900 text-xs">Valor Fiscal Declarado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 text-sm font-semibold">R$</span>
                <Input
                  value={form.valorFiscal}
                  onChange={e => set("valorFiscal", formatarMoeda(e.target.value))}
                  placeholder="0,00"
                  className="pl-9 bg-white border-blue-300 text-sm"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-blue-900 text-xs">Alíquota Imposto (%)</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
                <Input
                  value={form.pctImposto}
                  onChange={e => set("pctImposto", e.target.value.replace(",", "."))}
                  placeholder="Ex: 6.00"
                  className="pl-9 bg-white border-blue-300 text-sm"
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>

          {vf > 0 && pi > 0 && (
            <div className="flex items-center justify-between bg-blue-100 rounded-xl px-3 py-2 text-sm">
              <span className="text-blue-700">Imposto ({pi}% s/ {fmtBRL.format(vf)})</span>
              <span className="font-bold text-blue-900">{fmtBRL.format(vf * pi / 100)}</span>
            </div>
          )}
        </div>

        {/* Cenário B */}
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">B</div>
            <div>
              <p className="font-bold text-green-900">Sem Imposto</p>
              <p className="text-xs text-green-600">Apenas taxa de juros + comissão</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-green-900">Taxa de Juros Mensal (%) <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400" />
              <Input
                value={form.taxaB}
                onChange={e => set("taxaB", e.target.value.replace(",", "."))}
                placeholder="Ex: 1.89"
                className={`pl-9 bg-white border-green-300 focus:border-green-500 ${erros.taxaB ? "border-destructive" : ""}`}
                inputMode="decimal"
              />
            </div>
            {erros.taxaB && <p className="text-xs text-destructive">{erros.taxaB}</p>}
          </div>

          <div className="bg-green-100 rounded-xl px-3 py-2 text-xs text-green-700">
            <Info className="h-3.5 w-3.5 inline mr-1" />
            Neste cenário, o imposto não é cobrado. Apenas a taxa de juros e a comissão compõem o custo.
          </div>
        </div>
      </div>

      {/* Comparativo em tempo real */}
      {(resA || resB) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-gray-900">Comparativo em Tempo Real</h3>
            <Badge variant="secondary" className="text-xs">Atualização automática</Badge>
          </div>

          {/* Cabeçalho */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="bg-blue-100 text-blue-700 rounded-lg py-2">Cenário A — Com Imposto</div>
            <div className="bg-gray-100 rounded-lg py-2">Diferença</div>
            <div className="bg-green-100 text-green-700 rounded-lg py-2">Cenário B — Sem Imposto</div>
          </div>

          {/* Parcela Mensal */}
          <div className="grid grid-cols-3 gap-2 items-center">
            <div className="bg-blue-600 rounded-2xl p-4 text-white text-center">
              <p className="text-blue-200 text-xs mb-1">Parcela Mensal</p>
              <p className="text-2xl font-bold">{resA ? fmtBRL.format(resA.parcelaMensal) : "—"}</p>
              <p className="text-blue-300 text-xs mt-1">{prazoNum}x mensais</p>
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Parcela</p>
              {resA && resB ? (
                <DifTag a={resA.parcelaMensal} b={resB.parcelaMensal} campo="parcela" />
              ) : <span className="text-xs text-gray-300">—</span>}
            </div>
            <div className="bg-green-600 rounded-2xl p-4 text-white text-center">
              <p className="text-green-200 text-xs mb-1">Parcela Mensal</p>
              <p className="text-2xl font-bold">{resB ? fmtBRL.format(resB.parcelaMensal) : "—"}</p>
              <p className="text-green-300 text-xs mt-1">{prazoNum}x mensais</p>
            </div>
          </div>

          {/* Tabela comparativa detalhada */}
          <div className="bg-white rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Item</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-blue-700 uppercase">Cenário A</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Diferença</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-green-700 uppercase">Cenário B</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  {
                    label: "Taxa de Juros",
                    a: form.taxaA ? `${parseFloat(form.taxaA).toFixed(2).replace(".", ",")}% a.m.` : "—",
                    b: form.taxaB ? `${parseFloat(form.taxaB).toFixed(2).replace(".", ",")}% a.m.` : "—",
                    aNum: null, bNum: null,
                  },
                  {
                    label: "Valor do Crédito",
                    a: vc > 0 ? fmtBRL.format(vc) : "—",
                    b: vc > 0 ? fmtBRL.format(vc) : "—",
                    aNum: null, bNum: null,
                  },
                  {
                    label: "Total de Juros",
                    a: resA ? fmtBRL.format(resA.totalJuros) : "—",
                    b: resB ? fmtBRL.format(resB.totalJuros) : "—",
                    aNum: resA?.totalJuros ?? null,
                    bNum: resB?.totalJuros ?? null,
                  },
                  {
                    label: "Total do Financiamento",
                    a: resA ? fmtBRL.format(resA.totalFinanciamento) : "—",
                    b: resB ? fmtBRL.format(resB.totalFinanciamento) : "—",
                    aNum: resA?.totalFinanciamento ?? null,
                    bNum: resB?.totalFinanciamento ?? null,
                  },
                  {
                    label: "Comissão Destrava (informativa, não soma)",
                    a: resA ? fmtBRL.format(resA.comissaoValor) : "—",
                    b: resB ? fmtBRL.format(resB.comissaoValor) : "—",
                    aNum: null, bNum: null,
                  },
                  {
                    label: `Imposto (${pi}% s/ fiscal)`,
                    a: resA && resA.impostoValor > 0 ? fmtBRL.format(resA.impostoValor) : "R$ 0,00",
                    b: "R$ 0,00",
                    aNum: resA?.impostoValor ?? null,
                    bNum: 0,
                    destaque: true,
                  },
                ].map((row, i) => (
                  <tr key={i} className={row.destaque ? "bg-red-50" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3 text-gray-700 font-medium">{row.label}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${row.destaque ? "text-red-700" : "text-blue-700"}`}>{row.a}</td>
                    <td className="px-4 py-3 text-right">
                      {row.aNum !== null && row.bNum !== null ? (
                        <DifTag a={row.aNum} b={row.bNum} campo="total" />
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${row.destaque ? "text-gray-400" : "text-green-700"}`}>{row.b}</td>
                  </tr>
                ))}

                {/* Linha de total */}
                <tr className="bg-gray-900 text-white">
                  <td className="px-4 py-4 font-bold text-base">Total da Operação <span className="text-xs font-normal">(sem comissão)</span></td>
                  <td className="px-4 py-4 text-right font-bold text-lg text-blue-300">
                    {resA ? fmtBRL.format(resA.custoTotalOperacao) : "—"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {resA && resB ? (
                      <span className={`text-sm font-bold flex items-center justify-end gap-1 ${resA.custoTotalOperacao > resB.custoTotalOperacao ? "text-red-400" : "text-green-400"}`}>
                        {resA.custoTotalOperacao > resB.custoTotalOperacao ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {fmtBRL.format(Math.abs(resA.custoTotalOperacao - resB.custoTotalOperacao))}
                      </span>
                    ) : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-lg text-green-300">
                    {resB ? fmtBRL.format(resB.custoTotalOperacao) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Resumo visual da diferença */}
          {resA && resB && (
            <div className={`rounded-2xl p-5 text-center ${
              resA.custoTotalOperacao > resB.custoTotalOperacao
                ? "bg-gradient-to-r from-blue-900 to-blue-700"
                : "bg-gradient-to-r from-green-900 to-green-700"
            } text-white`}>
              <p className="text-white/70 text-sm mb-1">Diferença Total entre os Cenários (sem comissão)</p>
              <p className="text-4xl font-bold">{fmtBRL.format(Math.abs(resA.custoTotalOperacao - resB.custoTotalOperacao))}</p>
              <p className="text-white/70 text-sm mt-2">
                {resA.custoTotalOperacao > resB.custoTotalOperacao
                  ? "O Cenário A (com imposto) custa mais para o cliente"
                  : "O Cenário B (sem imposto) custa mais para o cliente"}
              </p>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3">
            <Button
              onClick={handleSalvar}
              disabled={salvando || salvo || (!resA && !resB)}
              className="flex-1 h-12 font-bold"
            >
              {salvo
                ? <><CheckCircle2 className="mr-2 h-5 w-5" />Salvo com Sucesso!</>
                : <><Save className="mr-2 h-5 w-5" />{salvando ? "Salvando..." : "Salvar Ambos os Cenários"}</>
              }
            </Button>
            <Button variant="outline" onClick={() => {
              if (resA && resB) {
                gerarPdfSimulacao({
                  cliente: { nome: form.nome, empresa: form.empresa, cpfCnpj: form.cpfCnpj, telefone: form.telefone, banco: form.banco, linhaCredito: form.linhaCredito, observacoes: form.observacoes },
                    cenarioA: resA ? { taxa: parseFloat(form.taxaA), valorCredito: vc, prazo: parseInt(form.prazo), parcela: resA.parcelaMensal, totalFinanciamento: resA.totalFinanciamento, totalJuros: resA.totalJuros, impostoValor: resA.impostoValor, comissaoValor: resA.comissaoValor, custoTotalOperacao: resA.custoTotalOperacao, cenario: "com_imposto", taxaAnualEquiv: resA.taxaAnualEquiv, cetMensal: resA.cetMensal, cetAnual: resA.cetAnual } : undefined,
                    cenarioB: resB ? { taxa: parseFloat(form.taxaB), valorCredito: vc, prazo: parseInt(form.prazo), parcela: resB.parcelaMensal, totalFinanciamento: resB.totalFinanciamento, totalJuros: resB.totalJuros, comissaoValor: resB.comissaoValor, custoTotalOperacao: resB.custoTotalOperacao, cenario: "sem_imposto", taxaAnualEquiv: resB.taxaAnualEquiv, cetMensal: resB.cetMensal, cetAnual: resB.cetAnual } : undefined,
                  modo: "comparativo"
                });
              }
            }} className="h-12 px-5" title="Exportar PDF">
              <Printer className="h-5 w-5" />
            </Button>
            <Button variant="outline" onClick={handleLimpar} className="h-12 px-5" title="Limpar">
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {!resA && !resB && (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed rounded-2xl p-8">
          <ArrowLeftRight className="h-14 w-14 mb-3 opacity-20" />
          <p className="font-medium">Preencha o valor, prazo e as duas taxas</p>
          <p className="text-sm mt-1 opacity-60">O comparativo aparece automaticamente em tempo real</p>
        </div>
      )}
     </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────────────────────────────
export default function CalculadoraPage() {
  // Lê dados pré-preenchidos da empresa (passados via sessionStorage pelo módulo de Empresas)
  const empresaPreenchidaRaw = sessionStorage.getItem("calculadora_empresa");
  const empresaPreenchida = empresaPreenchidaRaw
    ? (() => { try { sessionStorage.removeItem("calculadora_empresa"); return JSON.parse(empresaPreenchidaRaw); } catch { return undefined; } })()
    : undefined;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Calculadora de Crédito</h1>
            <p className="text-muted-foreground text-sm">
              Área exclusiva para colaboradores — simule e compare propostas de crédito
            </p>
          </div>
        </div>

        {/* Aviso */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Uso interno.</strong> Confirme sempre taxas e condições com o banco antes de apresentar ao cliente.
          </span>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="comparativo">
          <TabsList className="grid grid-cols-3 w-full max-w-2xl h-12">
            <TabsTrigger value="comparativo" className="text-sm font-medium gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Comparativo
            </TabsTrigger>
            <TabsTrigger value="com-imposto" className="text-sm font-medium gap-2">
              <FileText className="h-4 w-4" />
              Com Imposto
            </TabsTrigger>
            <TabsTrigger value="sem-imposto" className="text-sm font-medium gap-2">
              <Calculator className="h-4 w-4" />
              Sem Imposto
            </TabsTrigger>
          </TabsList>

          <div className="mt-2 mb-5">
            <TabsContent value="comparativo">
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <strong>Comparativo:</strong> Preencha os dados uma única vez e informe as duas taxas. O sistema calcula e exibe os dois cenários lado a lado em tempo real, com a diferença destacada.
              </p>
            </TabsContent>
            <TabsContent value="com-imposto">
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <strong>Cenário A:</strong> Inclui imposto calculado sobre o valor fiscal declarado pelo cliente.
              </p>
            </TabsContent>
            <TabsContent value="sem-imposto">
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <strong>Cenário B:</strong> Simulação sem incidência de imposto. Custo base do empréstimo.
              </p>
            </TabsContent>
          </div>

          <TabsContent value="comparativo">
            <CenarioComparativo initialData={empresaPreenchida} />
          </TabsContent>
          <TabsContent value="com-imposto">
            <CenarioComImposto initialData={empresaPreenchida} />
          </TabsContent>
          <TabsContent value="sem-imposto">
            <CenarioSemImposto initialData={empresaPreenchida} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
